-- TradingView Portfolio Dashboard Schema

CREATE DATABASE IF NOT EXISTS psxst_dashboard;
USE psxst_dashboard;

-- ============================================================
-- TRADES TABLE
-- Stores every signal. Entry & exit are matched in the same row.
-- ============================================================
CREATE TABLE IF NOT EXISTS trades (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    symbol          VARCHAR(50)     NOT NULL,
    timeframe       VARCHAR(20)     NOT NULL,
    side            VARCHAR(20)     NOT NULL COMMENT 'long / short',
    entry_price     DECIMAL(20, 8)  NULL,
    exit_price      DECIMAL(20, 8)  NULL,
    entry_time      DATETIME        NULL,
    exit_time       DATETIME        NULL,
    pnl_percent     DECIMAL(12, 4)  NULL COMMENT 'calculated on exit',
    status          ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    raw_payload     JSON            NULL COMMENT 'original webhook payload',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_symbol        (symbol),
    INDEX idx_status        (status),
    INDEX idx_entry_time    (entry_time),
    INDEX idx_exit_time     (exit_time),
    INDEX idx_symbol_status (symbol, status)
);

-- ============================================================
-- BATCHES TABLE
-- A batch groups a set of symbols with a starting capital.
-- ============================================================
CREATE TABLE IF NOT EXISTS batches (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255)    NOT NULL,
    capital         DECIMAL(20, 2)  NOT NULL DEFAULT 100000.00,
    start_time      DATETIME        NULL COMMENT 'NULL = all history',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- BATCH_SYMBOLS TABLE  (many-to-many: batch <-> symbol string)
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_symbols (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    batch_id    INT             NOT NULL,
    symbol      VARCHAR(50)     NOT NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_batch_symbol (batch_id, symbol),
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE
);

-- ============================================================
-- BATCH_TRADE_LOG TABLE
-- Snapshot of running capital / drawdown after each closed trade
-- that belongs to a batch. Pre-computed for fast dashboard reads.
-- ============================================================
CREATE TABLE IF NOT EXISTS batch_trade_log (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    batch_id            INT             NOT NULL,
    trade_id            INT             NOT NULL,
    symbol              VARCHAR(50)     NOT NULL,
    side                VARCHAR(20)     NOT NULL,
    entry_price         DECIMAL(20, 8)  NOT NULL,
    exit_price          DECIMAL(20, 8)  NOT NULL,
    entry_time          DATETIME        NOT NULL,
    exit_time           DATETIME        NOT NULL,
    pnl_percent         DECIMAL(12, 4)  NOT NULL,
    pnl_absolute        DECIMAL(20, 2)  NOT NULL,
    capital_before      DECIMAL(20, 2)  NOT NULL,
    capital_after       DECIMAL(20, 2)  NOT NULL,
    cumulative_pnl      DECIMAL(20, 2)  NOT NULL,
    drawdown            DECIMAL(12, 4)  NOT NULL COMMENT 'current drawdown %',
    max_drawdown        DECIMAL(12, 4)  NOT NULL COMMENT 'max drawdown % so far',
    peak_capital        DECIMAL(20, 2)  NOT NULL,
    trade_number        INT             NOT NULL COMMENT 'sequential trade # in batch',

    UNIQUE KEY uq_batch_trade (batch_id, trade_id),
    FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE,
    FOREIGN KEY (trade_id) REFERENCES trades(id)  ON DELETE CASCADE,

    INDEX idx_batch_exit_time (batch_id, exit_time)
);
