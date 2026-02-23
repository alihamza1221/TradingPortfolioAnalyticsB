/**
 * Analytics routes – per-batch dashboard data.
 */
const express = require('express');
const router = express.Router();
const batchService = require('../services/batchService');

// GET /api/analytics/:batchId/summary
router.get('/:batchId/summary', async (req, res) => {
    try {
        const data = await batchService.getBatchSummary(req.params.batchId);
        if (!data) return res.status(404).json({ error: 'Batch not found' });
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch summary' });
    }
});

// GET /api/analytics/:batchId/trade-log
router.get('/:batchId/trade-log', async (req, res) => {
    try {
        const { limit, offset } = req.query;
        const data = await batchService.getBatchTradeLog(
            req.params.batchId,
            { limit: parseInt(limit) || 500, offset: parseInt(offset) || 0 }
        );
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch trade log' });
    }
});

// GET /api/analytics/:batchId/capital-by-trade
router.get('/:batchId/capital-by-trade', async (req, res) => {
    try {
        const data = await batchService.getCapitalGrowthByTrade(req.params.batchId);
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch capital growth by trade' });
    }
});

// GET /api/analytics/:batchId/capital-by-day
router.get('/:batchId/capital-by-day', async (req, res) => {
    try {
        const data = await batchService.getCapitalGrowthByDay(req.params.batchId);
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch capital growth by day' });
    }
});

// GET /api/analytics/:batchId/trades-per-day
router.get('/:batchId/trades-per-day', async (req, res) => {
    try {
        const data = await batchService.getTradesPerDay(req.params.batchId);
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch trades per day' });
    }
});

// GET /api/analytics/:batchId/cumulative-trades
router.get('/:batchId/cumulative-trades', async (req, res) => {
    try {
        const data = await batchService.getCumulativeTradeCount(req.params.batchId);
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch cumulative trade count' });
    }
});

// GET /api/analytics/:batchId/symbol-breakdown
router.get('/:batchId/symbol-breakdown', async (req, res) => {
    try {
        const data = await batchService.getSymbolBreakdown(req.params.batchId);
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch symbol breakdown' });
    }
});

// GET /api/analytics/:batchId/drawdown
router.get('/:batchId/drawdown', async (req, res) => {
    try {
        const data = await batchService.getDrawdownSeries(req.params.batchId);
        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch drawdown series' });
    }
});

module.exports = router;
