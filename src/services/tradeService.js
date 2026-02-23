/**
 * Trade service – persists webhook signals and matches entry ↔ exit.
 */
const db = require('../db/connection');

/**
 * Determine whether this signal is an entry or an exit.
 *
 * Payload fields:
 *   – side:  "bullish" | "bearish"   (direction of the trade)
 *   – type:  "entry"  | "exit"       (whether this opens or closes a trade)
 *
 * If type is explicitly "exit", we close the matching open trade.
 * If type is "entry", we open a new trade.
 * If type is neither (legacy), fall back to auto-detection:
 *   open trade exists → exit, otherwise → entry.
 */
async function processSignal(payload) {
    const {
        symbol,
        side,
        timeframe,
        type,
        price,
        closeonflip,
        timestamp,
    } = payload;

    const signalTime = timestamp ? new Date(timestamp) : new Date();
    const numericPrice = parseFloat(price);

    const typeLower = (type || '').toLowerCase();
    const isExplicitExit = typeLower === 'exit';
    const isExplicitEntry = typeLower === 'entry';

    // Try to find an open trade for this symbol
    const [openTrades] = await db.execute(
        `SELECT * FROM trades WHERE symbol = ? AND status = 'open' ORDER BY entry_time ASC LIMIT 1`,
        [symbol]
    );

    // Decide: EXIT if explicit exit OR (auto-detect: open trade exists and not explicit entry)
    const shouldExit = openTrades.length > 0 && (isExplicitExit || !isExplicitEntry);

    if (shouldExit) {
        // -------- EXIT --------
        const openTrade = openTrades[0];
        const entryPrice = parseFloat(openTrade.entry_price);

        // PnL calculation
        let pnlPercent;
        if (openTrade.side === 'bullish' || openTrade.side === 'long') {
            pnlPercent = ((numericPrice - entryPrice) / entryPrice) * 100;
        } else {
            // bearish / short: profit when price goes down
            pnlPercent = ((entryPrice - numericPrice) / entryPrice) * 100;
        }

        await db.execute(
            `UPDATE trades
                SET exit_price  = ?,
                    exit_time   = ?,
                    pnl_percent = ?,
                    status      = 'closed',
                    raw_payload = JSON_MERGE_PATCH(COALESCE(raw_payload, '{}'), ?)
             WHERE id = ?`,
            [
                numericPrice,
                signalTime,
                pnlPercent.toFixed(4),
                JSON.stringify({ exit_payload: payload }),
                openTrade.id,
            ]
        );

        const closedTrade = {
            ...openTrade,
            exit_price: numericPrice,
            exit_time: signalTime,
            pnl_percent: parseFloat(pnlPercent.toFixed(4)),
            status: 'closed',
        };

        // Update batch_trade_log for all batches that contain this symbol
        await updateBatchLogsForTrade(closedTrade);

        return { action: 'exit', trade: closedTrade };
    }

    // -------- ENTRY --------
    // side comes as "bullish" / "bearish" — store it directly
    const determinedSide = (side || 'bullish').toLowerCase();

    const [result] = await db.execute(
        `INSERT INTO trades (symbol, timeframe, side, entry_price, entry_time, status, raw_payload)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
        [
            symbol,
            timeframe,
            determinedSide,
            numericPrice,
            signalTime,
            JSON.stringify({ entry_payload: payload }),
        ]
    );

    return {
        action: 'entry',
        trade: {
            id: result.insertId,
            symbol,
            timeframe,
            side: determinedSide,
            entry_price: numericPrice,
            entry_time: signalTime,
            status: 'open',
        },
    };
}

/**
 * After a trade closes, iterate all batches that include its symbol
 * and append a row to batch_trade_log with running analytics.
 */
async function updateBatchLogsForTrade(trade) {
    // Find batches that contain this symbol and whose start_time <= trade entry
    const [batches] = await db.execute(
        `SELECT b.* FROM batches b
         JOIN batch_symbols bs ON bs.batch_id = b.id
         WHERE bs.symbol = ?
           AND (b.start_time IS NULL OR b.start_time <= ?)`,
        [trade.symbol, trade.entry_time]
    );

    for (const batch of batches) {
        await appendBatchLog(batch, trade);
    }
}

async function appendBatchLog(batch, trade) {
    // Get the last log entry for this batch to carry forward running totals
    const [lastLogs] = await db.execute(
        `SELECT * FROM batch_trade_log
         WHERE batch_id = ?
         ORDER BY trade_number DESC
         LIMIT 1`,
        [batch.id]
    );

    let capitalBefore, peakCapital, maxDrawdown, tradeNumber;

    if (lastLogs.length > 0) {
        const last = lastLogs[0];
        capitalBefore = parseFloat(last.capital_after);
        peakCapital = parseFloat(last.peak_capital);
        maxDrawdown = parseFloat(last.max_drawdown);
        tradeNumber = last.trade_number + 1;
    } else {
        capitalBefore = parseFloat(batch.capital);
        peakCapital = capitalBefore;
        maxDrawdown = 0;
        tradeNumber = 1;
    }

    const pnlPercent = parseFloat(trade.pnl_percent);
    const pnlAbsolute = capitalBefore * (pnlPercent / 100);
    const capitalAfter = capitalBefore + pnlAbsolute;
    const cumulativePnl = capitalAfter - parseFloat(batch.capital);

    if (capitalAfter > peakCapital) peakCapital = capitalAfter;

    const drawdown =
        peakCapital > 0
            ? ((peakCapital - capitalAfter) / peakCapital) * 100
            : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    await db.execute(
        `INSERT INTO batch_trade_log
            (batch_id, trade_id, symbol, side, entry_price, exit_price,
             entry_time, exit_time, pnl_percent, pnl_absolute,
             capital_before, capital_after, cumulative_pnl,
             drawdown, max_drawdown, peak_capital, trade_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            pnl_percent    = VALUES(pnl_percent),
            pnl_absolute   = VALUES(pnl_absolute),
            capital_before = VALUES(capital_before),
            capital_after  = VALUES(capital_after),
            cumulative_pnl = VALUES(cumulative_pnl),
            drawdown       = VALUES(drawdown),
            max_drawdown   = VALUES(max_drawdown),
            peak_capital   = VALUES(peak_capital),
            trade_number   = VALUES(trade_number)`,
        [
            batch.id,
            trade.id,
            trade.symbol,
            trade.side,
            trade.entry_price,
            trade.exit_price,
            trade.entry_time,
            trade.exit_time,
            trade.pnl_percent,
            pnlAbsolute.toFixed(2),
            capitalBefore.toFixed(2),
            capitalAfter.toFixed(2),
            cumulativePnl.toFixed(2),
            drawdown.toFixed(4),
            maxDrawdown.toFixed(4),
            peakCapital.toFixed(2),
            tradeNumber,
        ]
    );
}

/**
 * Rebuild ALL batch_trade_log entries for a given batch from scratch.
 * Used when a batch is created/edited so historical trades get accounted for.
 */
async function rebuildBatchLog(batchId) {
    const [batches] = await db.execute(
        `SELECT * FROM batches WHERE id = ?`,
        [batchId]
    );
    if (batches.length === 0) return;
    const batch = batches[0];

    // Get symbols in batch
    const [symbols] = await db.execute(
        `SELECT symbol FROM batch_symbols WHERE batch_id = ?`,
        [batchId]
    );
    if (symbols.length === 0) {
        await db.execute(`DELETE FROM batch_trade_log WHERE batch_id = ?`, [batchId]);
        return;
    }

    const symbolList = symbols.map((s) => s.symbol);
    const placeholders = symbolList.map(() => '?').join(',');

    // Fetch all closed trades for these symbols, ordered by exit_time
    let query = `SELECT * FROM trades
                 WHERE symbol IN (${placeholders})
                   AND status = 'closed'`;
    const params = [...symbolList];

    if (batch.start_time) {
        query += ` AND entry_time >= ?`;
        params.push(batch.start_time);
    }
    query += ` ORDER BY exit_time ASC`;

    const [trades] = await db.execute(query, params);

    // Clear existing log
    await db.execute(`DELETE FROM batch_trade_log WHERE batch_id = ?`, [batchId]);

    // Replay trades
    let capitalBefore = parseFloat(batch.capital);
    let peakCapital = capitalBefore;
    let maxDrawdown = 0;

    for (let i = 0; i < trades.length; i++) {
        const trade = trades[i];
        const pnlPercent = parseFloat(trade.pnl_percent);
        const pnlAbsolute = capitalBefore * (pnlPercent / 100);
        const capitalAfter = capitalBefore + pnlAbsolute;
        const cumulativePnl = capitalAfter - parseFloat(batch.capital);

        if (capitalAfter > peakCapital) peakCapital = capitalAfter;
        const drawdown =
            peakCapital > 0
                ? ((peakCapital - capitalAfter) / peakCapital) * 100
                : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;

        await db.execute(
            `INSERT INTO batch_trade_log
                (batch_id, trade_id, symbol, side, entry_price, exit_price,
                 entry_time, exit_time, pnl_percent, pnl_absolute,
                 capital_before, capital_after, cumulative_pnl,
                 drawdown, max_drawdown, peak_capital, trade_number)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                batch.id,
                trade.id,
                trade.symbol,
                trade.side,
                trade.entry_price,
                trade.exit_price,
                trade.entry_time,
                trade.exit_time,
                pnlPercent,
                pnlAbsolute.toFixed(2),
                capitalBefore.toFixed(2),
                capitalAfter.toFixed(2),
                cumulativePnl.toFixed(2),
                drawdown.toFixed(4),
                maxDrawdown.toFixed(4),
                peakCapital.toFixed(2),
                i + 1,
            ]
        );

        capitalBefore = capitalAfter;
    }
}

/* ---------- Simple CRUD helpers for trades ---------- */

async function getAllTrades({ status, symbol, limit = 200, offset = 0 }) {
    let query = 'SELECT * FROM trades WHERE 1=1';
    const params = [];
    if (status) {
        query += ' AND status = ?';
        params.push(status);
    }
    if (symbol) {
        query += ' AND symbol = ?';
        params.push(symbol);
    }
    query += ` ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;

    const [rows] = await db.execute(query, params);
    return rows;
}

async function getTradeById(id) {
    const [rows] = await db.execute('SELECT * FROM trades WHERE id = ?', [id]);
    return rows[0] || null;
}

/**
 * Returns the unique list of symbols that have been received via trade signals.
 * Used by the frontend to populate the symbol dropdown when creating/editing batches.
 */
async function getUniqueSymbols() {
    const [rows] = await db.execute(
        'SELECT DISTINCT symbol FROM trades ORDER BY symbol ASC'
    );
    return rows.map((r) => r.symbol);
}

module.exports = {
    processSignal,
    rebuildBatchLog,
    getAllTrades,
    getTradeById,
    getUniqueSymbols,
};
