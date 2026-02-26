/**
 * TradingView Portfolio Dashboard – Express server entry point.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const webhookRoutes = require('./routes/webhook');
const batchRoutes = require('./routes/batches');
const analyticsRoutes = require('./routes/analytics');
const tradeRoutes = require('./routes/trades');

const app = express();

/* ---------- Middleware ---------- */
app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

/* ---------- Routes ---------- */
app.use('/api/webhook', webhookRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/trades', tradeRoutes);

// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ---------- Error handler ---------- */
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀  Server running on http://localhost:${PORT}`);
    console.log(`    Webhook URL: http://localhost:${PORT}/api/webhook`);
    console.log(`    Health:      http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
