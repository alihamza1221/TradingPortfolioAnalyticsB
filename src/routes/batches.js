/**
 * Batch routes – CRUD + symbol management.
 */
const express = require('express');
const router = express.Router();
const batchService = require('../services/batchService');

/* ---------- Batch CRUD ---------- */

// GET /api/batches
router.get('/', async (req, res) => {
    try {
        const batches = await batchService.getAllBatches();
        res.json({ success: true, data: batches });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch batches' });
    }
});

// GET /api/batches/:id
router.get('/:id', async (req, res) => {
    try {
        const batch = await batchService.getBatchById(req.params.id);
        if (!batch) return res.status(404).json({ error: 'Batch not found' });
        res.json({ success: true, data: batch });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch batch' });
    }
});

// POST /api/batches
router.post('/', async (req, res) => {
    try {
        const { name, capital, start_time, symbols } = req.body;
        if (!name) return res.status(400).json({ error: 'Batch name is required' });

        const batch = await batchService.createBatch({ name, capital, start_time, symbols });
        res.status(201).json({ success: true, data: batch });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create batch' });
    }
});

// PUT /api/batches/:id
router.put('/:id', async (req, res) => {
    try {
        const { name, capital, start_time } = req.body;
        const batch = await batchService.updateBatch(req.params.id, { name, capital, start_time });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });
        res.json({ success: true, data: batch });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update batch' });
    }
});

// DELETE /api/batches/:id
router.delete('/:id', async (req, res) => {
    try {
        await batchService.deleteBatch(req.params.id);
        res.json({ success: true, message: 'Batch deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete batch' });
    }
});

/* ---------- Symbol management ---------- */

// PUT /api/batches/:id/symbols  – replace entire symbol list
router.put('/:id/symbols', async (req, res) => {
    try {
        const { symbols } = req.body;
        if (!Array.isArray(symbols)) return res.status(400).json({ error: 'symbols must be an array' });
        await batchService.setSymbols(req.params.id, symbols);
        const batch = await batchService.getBatchById(req.params.id);
        res.json({ success: true, data: batch });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to set symbols' });
    }
});

// POST /api/batches/:id/symbols  – add one symbol
router.post('/:id/symbols', async (req, res) => {
    try {
        const { symbol } = req.body;
        if (!symbol) return res.status(400).json({ error: 'symbol is required' });
        await batchService.addSymbol(req.params.id, symbol);
        const batch = await batchService.getBatchById(req.params.id);
        res.json({ success: true, data: batch });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add symbol' });
    }
});

// DELETE /api/batches/:id/symbols/:symbol
router.delete('/:id/symbols/:symbol', async (req, res) => {
    try {
        await batchService.removeSymbol(req.params.id, req.params.symbol);
        const batch = await batchService.getBatchById(req.params.id);
        res.json({ success: true, data: batch });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove symbol' });
    }
});

module.exports = router;
