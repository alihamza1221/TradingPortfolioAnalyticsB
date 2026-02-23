# TradingView Portfolio Dashboard – Backend

Node.js + Express + MySQL backend that receives TradingView webhook signals and provides portfolio management analytics across configurable batches.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment – edit .env with your MySQL credentials
#    DB_HOST, DB_USER, DB_PASSWORD, DB_NAME

# 3. Create database & tables
npm run db:init

# 4. Start server
npm start        # or: npm run dev (with nodemon hot-reload)
```

Server starts on **http://localhost:3000** by default.

---

## Project Structure

```
src/
├── server.js                 # Express entry point
├── db/
│   ├── connection.js         # MySQL connection pool
│   ├── init.js               # DB initialisation script
│   └── schema.sql            # Full SQL schema
├── routes/
│   ├── webhook.js            # POST /api/webhook
│   ├── batches.js            # Batch CRUD + symbol management
│   ├── analytics.js          # Per-batch dashboard analytics
│   └── trades.js             # Direct trade access
└── services/
    ├── tradeService.js       # Signal processing + entry/exit matching
    └── batchService.js       # Batch CRUD + analytics queries
```

---

## Database Tables

| Table | Purpose |
|---|---|
| `trades` | Every signal (entry & exit matched in the same row) |
| `batches` | Named groups of symbols with starting capital |
| `batch_symbols` | Many-to-many: batch ↔ symbol |
| `batch_trade_log` | Pre-computed running capital/PnL/drawdown per trade per batch |

---

## API Endpoints

### Webhook

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/webhook` | Receive a TradingView alert payload |

**Payload format** (JSON body):
```json
{
  "symbol": "BTCUSDT",
  "side": "long",
  "timeframe": "1H",
  "type": "bullish",
  "price": "42150.50",
  "closeonflip": "true",
  "timestamp": "2026-02-21T12:00:00+0000"
}
```

Logic:
- If an **open** trade exists for the symbol → the signal **closes** it (exit).
- Otherwise → the signal **opens** a new trade (entry).
- On exit, PnL is calculated and all relevant batch logs are updated automatically.

---

### Batches (CRUD)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/batches` | List all batches with current snapshot |
| `GET` | `/api/batches/:id` | Get single batch |
| `POST` | `/api/batches` | Create a new batch |
| `PUT` | `/api/batches/:id` | Update batch name / capital / start_time |
| `DELETE` | `/api/batches/:id` | Delete a batch |

**Create batch body:**
```json
{
  "name": "BTC + ETH Portfolio",
  "capital": 100000,
  "start_time": "2025-01-01T00:00:00Z",
  "symbols": ["BTCUSDT", "ETHUSDT"]
}
```
- `capital` defaults to **100,000** if omitted.
- `start_time` defaults to **null** (uses all trade history).

---

### Batch Symbol Management

| Method | Endpoint | Description |
|---|---|---|
| `PUT` | `/api/batches/:id/symbols` | Replace entire symbol list |
| `POST` | `/api/batches/:id/symbols` | Add one symbol |
| `DELETE` | `/api/batches/:id/symbols/:symbol` | Remove one symbol |

**Replace symbols body:**
```json
{ "symbols": ["BTCUSDT", "ETHUSDT", "SOLUSDT"] }
```

**Add symbol body:**
```json
{ "symbol": "SOLUSDT" }
```

---

### Analytics (per batch)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/:batchId/summary` | KPI summary (win rate, total PnL, drawdown, etc.) |
| `GET` | `/api/analytics/:batchId/trade-log` | Full trade log with running capital |
| `GET` | `/api/analytics/:batchId/capital-by-trade` | Capital growth curve by trade # |
| `GET` | `/api/analytics/:batchId/capital-by-day` | Capital growth aggregated per day |
| `GET` | `/api/analytics/:batchId/trades-per-day` | Trade count per day |
| `GET` | `/api/analytics/:batchId/cumulative-trades` | Cumulative trade count over time |
| `GET` | `/api/analytics/:batchId/symbol-breakdown` | Per-symbol win/loss/PnL breakdown |
| `GET` | `/api/analytics/:batchId/drawdown` | Drawdown series over time |

---

### Trades (direct access)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/trades?status=open&symbol=BTCUSDT&limit=50&offset=0` | List trades with filters |
| `GET` | `/api/trades/:id` | Get single trade |

---

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |

---

## How It Works

1. **TradingView** sends a webhook POST to `/api/webhook` with the signal payload.
2. The server checks if an **open trade** exists for that symbol.
   - **No** → creates a new trade row (entry).
   - **Yes** → closes the trade (sets exit price/time, calculates PnL%).
3. On every **closed** trade, **all batches** that include that symbol get their `batch_trade_log` updated with:
   - Running capital (before/after)
   - PnL (absolute & percentage)
   - Cumulative PnL
   - Drawdown & max drawdown
   - Peak capital
4. When a **batch is created or edited**, the entire trade log is **rebuilt from historical trades** so existing data is reflected immediately.
5. The **analytics endpoints** serve pre-computed data optimised for frontend chart rendering.

---

## TradingView Webhook Setup

Set the webhook URL in your TradingView alert to:

```
http://YOUR_SERVER_IP:3000/api/webhook
```

Make sure the alert message format matches the JSON payload structure above.
