/**
 * Trade routes – direct trade access.
 */
const express = require('express');
const router = express.Router();
const tradeService = require('../services/tradeService');

// GET /api/trades
router.get('/', async (req, res) => {
    try {
        const { status, symbol, limit, offset } = req.query;
        const trades = await tradeService.getAllTrades({
            status,
            symbol,
            limit: parseInt(limit) || 200,
            offset: parseInt(offset) || 0,
        });
        res.json({ success: true, data: trades });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch trades' });
    }
});

// GET /api/trades/symbols  –  unique symbols from all received signals
router.get('/symbols', async (req, res) => {
    try {
        const symbols = await tradeService.getUniqueSymbols();
        res.json({ success: true, data: symbols });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch symbols' });
    }
});

// GET /api/trades/:id
router.get('/:id', async (req, res) => {
    try {
        const trade = await tradeService.getTradeById(req.params.id);
        if (!trade) return res.status(404).json({ error: 'Trade not found' });
        res.json({ success: true, data: trade });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch trade' });
    }
});

module.exports = router;
