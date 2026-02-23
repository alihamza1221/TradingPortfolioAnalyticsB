/**
 * Batch service – CRUD + analytics for batches.
 */
const db = require('../db/connection');
const { rebuildBatchLog } = require('./tradeService');

/**
 * Convert an ISO 8601 / JS date string to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS).
 */
function toMySQLDatetime(value) {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

/* ===========================  CRUD  =========================== */

async function createBatch({ name, capital = 100000, start_time = null, symbols = [] }) {
    const [result] = await db.execute(
        `INSERT INTO batches (name, capital, start_time) VALUES (?, ?, ?)`,
        [name, capital, toMySQLDatetime(start_time)]
    );
    const batchId = result.insertId;

    if (symbols.length > 0) {
        await setSymbols(batchId, symbols);
    }

    // Build historical log
    await rebuildBatchLog(batchId);

    return getBatchById(batchId);
}

async function getBatchById(id) {
    const [rows] = await db.execute('SELECT * FROM batches WHERE id = ?', [id]);
    if (rows.length === 0) return null;
    const batch = rows[0];
    batch.symbols = await getSymbols(id);
    return batch;
}

async function getAllBatches() {
    const [rows] = await db.execute('SELECT * FROM batches ORDER BY created_at DESC');
    for (const batch of rows) {
        batch.symbols = await getSymbols(batch.id);

        // Attach latest snapshot
        const [snapshot] = await db.execute(
            `SELECT capital_after, cumulative_pnl, drawdown, max_drawdown, peak_capital, trade_number
             FROM batch_trade_log WHERE batch_id = ? ORDER BY trade_number DESC LIMIT 1`,
            [batch.id]
        );
        if (snapshot.length > 0) {
            batch.current_capital = parseFloat(snapshot[0].capital_after);
            batch.cumulative_pnl = parseFloat(snapshot[0].cumulative_pnl);
            batch.current_drawdown = parseFloat(snapshot[0].drawdown);
            batch.max_drawdown = parseFloat(snapshot[0].max_drawdown);
            batch.peak_capital = parseFloat(snapshot[0].peak_capital);
            batch.total_trades = snapshot[0].trade_number;
        } else {
            batch.current_capital = parseFloat(batch.capital);
            batch.cumulative_pnl = 0;
            batch.current_drawdown = 0;
            batch.max_drawdown = 0;
            batch.peak_capital = parseFloat(batch.capital);
            batch.total_trades = 0;
        }
    }
    return rows;
}

async function updateBatch(id, { name, capital, start_time }) {
    const fields = [];
    const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (capital !== undefined) { fields.push('capital = ?'); params.push(capital); }
    if (start_time !== undefined) { fields.push('start_time = ?'); params.push(toMySQLDatetime(start_time)); }

    if (fields.length > 0) {
        params.push(id);
        await db.execute(`UPDATE batches SET ${fields.join(', ')} WHERE id = ?`, params);
    }

    // If capital or start_time changed, rebuild log
    if (capital !== undefined || start_time !== undefined) {
        await rebuildBatchLog(id);
    }

    return getBatchById(id);
}

async function deleteBatch(id) {
    await db.execute('DELETE FROM batches WHERE id = ?', [id]);
}

/* ===========================  SYMBOLS  =========================== */

async function getSymbols(batchId) {
    const [rows] = await db.execute(
        'SELECT symbol FROM batch_symbols WHERE batch_id = ?',
        [batchId]
    );
    return rows.map((r) => r.symbol);
}

async function setSymbols(batchId, symbols) {
    // Remove old
    await db.execute('DELETE FROM batch_symbols WHERE batch_id = ?', [batchId]);
    // Insert new
    for (const sym of symbols) {
        await db.execute(
            'INSERT IGNORE INTO batch_symbols (batch_id, symbol) VALUES (?, ?)',
            [batchId, sym.toUpperCase()]
        );
    }
    // Rebuild log since symbol set changed
    await rebuildBatchLog(batchId);
}

async function addSymbol(batchId, symbol) {
    await db.execute(
        'INSERT IGNORE INTO batch_symbols (batch_id, symbol) VALUES (?, ?)',
        [batchId, symbol.toUpperCase()]
    );
    await rebuildBatchLog(batchId);
}

async function removeSymbol(batchId, symbol) {
    await db.execute(
        'DELETE FROM batch_symbols WHERE batch_id = ? AND symbol = ?',
        [batchId, symbol.toUpperCase()]
    );
    await rebuildBatchLog(batchId);
}

/* ===========================  ANALYTICS  =========================== */

/**
 * Full trade log for a batch (every closed trade with running capital).
 */
async function getBatchTradeLog(batchId, { limit = 500, offset = 0 } = {}) {
    const [rows] = await db.execute(
        `SELECT * FROM batch_trade_log
         WHERE batch_id = ?
         ORDER BY trade_number ASC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
        [batchId]
    );
    return rows;
}

/**
 * Capital growth curve by trade (for chart).
 */
async function getCapitalGrowthByTrade(batchId) {
    const [rows] = await db.execute(
        `SELECT trade_number, capital_after, cumulative_pnl, pnl_absolute, pnl_percent,
                drawdown, max_drawdown, exit_time, symbol
         FROM batch_trade_log
         WHERE batch_id = ?
         ORDER BY trade_number ASC`,
        [batchId]
    );
    return rows;
}

/**
 * Capital growth aggregated per day.
 */
async function getCapitalGrowthByDay(batchId) {
    const [rows] = await db.execute(
        `SELECT
            DATE(exit_time) AS day,
            MAX(trade_number) AS trade_count_cumulative,
            COUNT(*)          AS trades_on_day,
            SUM(pnl_absolute) AS daily_pnl,
            MAX(capital_after) AS capital_eod,
            MAX(cumulative_pnl) AS cumulative_pnl,
            MAX(drawdown)      AS drawdown_eod,
            MAX(max_drawdown)  AS max_drawdown
         FROM batch_trade_log
         WHERE batch_id = ?
         GROUP BY DATE(exit_time)
         ORDER BY day ASC`,
        [batchId]
    );
    return rows;
}

/**
 * Trades per day chart data.
 */
async function getTradesPerDay(batchId) {
    const [rows] = await db.execute(
        `SELECT
            DATE(exit_time) AS day,
            COUNT(*)        AS trade_count
         FROM batch_trade_log
         WHERE batch_id = ?
         GROUP BY DATE(exit_time)
         ORDER BY day ASC`,
        [batchId]
    );
    return rows;
}

/**
 * Cumulative trade count over time.
 */
async function getCumulativeTradeCount(batchId) {
    const [rows] = await db.execute(
        `SELECT trade_number, exit_time
         FROM batch_trade_log
         WHERE batch_id = ?
         ORDER BY trade_number ASC`,
        [batchId]
    );
    return rows;
}

/**
 * Summary / KPI snapshot for a batch.
 */
async function getBatchSummary(batchId) {
    const batch = await getBatchById(batchId);
    if (!batch) return null;

    const [stats] = await db.execute(
        `SELECT
            COUNT(*)                           AS total_trades,
            SUM(CASE WHEN pnl_percent > 0 THEN 1 ELSE 0 END) AS winning_trades,
            SUM(CASE WHEN pnl_percent < 0 THEN 1 ELSE 0 END) AS losing_trades,
            SUM(CASE WHEN pnl_percent = 0 THEN 1 ELSE 0 END) AS breakeven_trades,
            AVG(pnl_percent)                   AS avg_pnl_percent,
            MAX(pnl_percent)                   AS best_trade_pct,
            MIN(pnl_percent)                   AS worst_trade_pct,
            SUM(pnl_absolute)                  AS total_pnl_absolute
         FROM batch_trade_log
         WHERE batch_id = ?`,
        [batchId]
    );

    const [lastLog] = await db.execute(
        `SELECT capital_after, cumulative_pnl, drawdown, max_drawdown, peak_capital, trade_number
         FROM batch_trade_log WHERE batch_id = ? ORDER BY trade_number DESC LIMIT 1`,
        [batchId]
    );

    return {
        batch,
        stats: stats[0],
        latest: lastLog[0] || null,
    };
}

/**
 * Win-rate and symbol-level breakdown.
 */
async function getSymbolBreakdown(batchId) {
    const [rows] = await db.execute(
        `SELECT
            symbol,
            COUNT(*)                           AS trades,
            SUM(CASE WHEN pnl_percent > 0 THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN pnl_percent < 0 THEN 1 ELSE 0 END) AS losses,
            AVG(pnl_percent)                   AS avg_pnl_pct,
            SUM(pnl_absolute)                  AS total_pnl
         FROM batch_trade_log
         WHERE batch_id = ?
         GROUP BY symbol
         ORDER BY total_pnl DESC`,
        [batchId]
    );
    return rows;
}

/**
 * Drawdown over time for a batch.
 */
async function getDrawdownSeries(batchId) {
    const [rows] = await db.execute(
        `SELECT trade_number, exit_time, drawdown, max_drawdown, capital_after, peak_capital
         FROM batch_trade_log
         WHERE batch_id = ?
         ORDER BY trade_number ASC`,
        [batchId]
    );
    return rows;
}

module.exports = {
    createBatch,
    getBatchById,
    getAllBatches,
    updateBatch,
    deleteBatch,
    getSymbols,
    setSymbols,
    addSymbol,
    removeSymbol,
    getBatchTradeLog,
    getCapitalGrowthByTrade,
    getCapitalGrowthByDay,
    getTradesPerDay,
    getCumulativeTradeCount,
    getBatchSummary,
    getSymbolBreakdown,
    getDrawdownSeries,
};
