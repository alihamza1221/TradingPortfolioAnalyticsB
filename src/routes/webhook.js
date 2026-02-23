/**
 * Webhook route – receives TradingView alerts.
 *
 * POST /api/webhook
 */
const express = require('express');
const router = express.Router();
const { processSignal } = require('../services/tradeService');

router.post('/', async (req, res) => {
    try {
        const payload = req.body;

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
