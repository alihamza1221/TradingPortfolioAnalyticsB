/**
 * Webhook route – receives TradingView alerts.
 *
 * POST /api/webhook
 *
 * Supports two formats:
 *   1. JSON payload (legacy): { symbol, side, timeframe, type, price, ... }
 *   2. Text alert (new):
 *      "sell 2000 @ 68050.0 on BTCUSD.P (2026-02-26T13:51:00Z). Position: -2000 @ avg 68050.0. Order ID: Short"
 *      Position qty determines type: 0 = exit, negative = short entry, positive = long entry
 */
const express = require('express');
const router = express.Router();
const { processSignal } = require('../services/tradeService');

/**
 * Parse the new TradingView text alert format into a normalized payload.
 *
 * Format: "{action} {qty} @ {price} on {symbol} ({timestamp}). Position: {pos_qty} @ avg {avg_price}. Order ID: {order_id}"
 */
function parseTextAlert(text) {
    const regex = /^(buy|sell)\s+[\d.]+\s+@\s+([\d.]+)\s+on\s+(\S+)\s+\(([^)]+)\)\.\s*Position:\s*([-\d.]+)\s+@\s+avg\s+[\d.]+\.\s*Order ID:\s*(.+)$/i;
    const match = text.trim().match(regex);

    if (!match) return null;

    const [, action, price, symbol, timestamp, positionQty, orderId] = match;
    const posQty = parseFloat(positionQty);

    // Position = 0 → exit
    // Position < 0 → short/bearish entry
    // Position > 0 → long/bullish entry
    let type, side;
    if (posQty === 0) {
        type = 'exit';
        // Side comes from the original open trade, but we pass the action direction
        side = action.toLowerCase() === 'buy' ? 'bullish' : 'bearish';
    } else if (posQty < 0) {
        type = 'entry';
        side = 'bearish';
    } else {
        type = 'entry';
        side = 'bullish';
    }

    return {
        symbol: symbol.trim(),
        side,
        timeframe: '',
        type,
        price,
        closeonflip: 'false',
        timestamp,
        _raw: text,
        _orderId: orderId.trim(),
        _positionQty: posQty,
    };
}

router.post('/', async (req, res) => {
    try {
        let payload;

        // Detect format: text string vs JSON object
        if (typeof req.body === 'string') {
            // New text alert format
            payload = parseTextAlert(req.body);
            if (!payload) {
                console.error('[Webhook] Failed to parse text alert:', req.body);
                return res.status(400).json({ error: 'Could not parse alert text' });
            }
            console.log(`[Webhook] Parsed text alert → ${payload.symbol} ${payload.side} ${payload.type} @ ${payload.price}`);
        } else {
            // Legacy JSON format
            payload = req.body;
        }

        // Basic validation
        if (!payload.symbol || !payload.price) {
            return res.status(400).json({ error: 'Missing required fields: symbol, price' });
        }

        console.log(`[Webhook] Received signal: ${payload.symbol} ${payload.side} ${payload.type} @ ${payload.price}`);

        const result = await processSignal(payload);

        console.log(`[Webhook] Processed as ${result.action} for trade #${result.trade.id}`);

        return res.status(200).json({
            success: true,
            action: result.action,
            trade: result.trade,
        });
    } catch (err) {
        console.error('[Webhook] Error processing signal:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
