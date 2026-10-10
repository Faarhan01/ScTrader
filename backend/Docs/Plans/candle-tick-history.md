# Candle & Tick History Depth

**Status:** Planned

## TO-DO

- [ ] 1. Tick history reload on startup (tradeStore.ts:100)
- [ ] 2. Add mt5_get_candles tool (mcpServer.ts)
- [ ] 3. Fix seedCandles polluting real history (tradeStore.ts:636-638)
- [ ] 4. Add retention window for candles by time (db.ts:283)
- [ ] 5. Raise default candle count (AIMT5Bridge.mq5:875)

## Verified current state

### On-demand candle history — ALREADY WORKS

- `mcpServer.ts:853` — `mt5_request_chart_history` queues a `FETCH_HISTORY` command
- `tradeStore.ts:595` — `requestHistoryFromEA(symbol, timeframe, count)` queues it
- `AIMT5Bridge.mq5:804-853` — EA handles `FETCH_HISTORY`/`REQUEST_HISTORY`: parses `timeframe`/`count` from command or `comment` JSON, calls `CopyRates(symbol, tfEnum, 0, count)`, stores result in `g_onDemandHistoryJson`
- `AIMT5Bridge.mq5:410` — EA transmits `g_onDemandHistoryJson` as `historyPayload` in next sync
- `tradeStore.ts:150-156` — server receives `historyPayload`, persists via `dbInsertCandles`

### Active chart candles — only 60 bars

- `AIMT5Bridge.mq5:873-880` — `BuildChartHistoryJson` transmits `CopyRates(_Symbol, Period(), 0, count)` with `count = InpHistoryCandles` (default 60). Only the active chart's symbol/timeframe.
- `tradeStore.ts:133-141` — server stores them in `chartHistory` and `dbInsertCandles(currentSym, currentTf, ...)`.

### Tick history — in-memory only

- `tradeStore.ts:98` — `tickHistory` is an in-memory `Map`, capped at 100 entries per symbol (line 213). Does NOT reload from DB on startup.
- `tradeStore.ts:195` — ticks ARE persisted to SQLite via `dbInsertTicks` on every sync.
- `db.ts:438` — `dbGetTicksHistory(symbol, limit)` reads back from SQLite.
- `apiRoutes.ts:239` — exposed via `GET /api/database/ticks`.
- `mcpServer.ts:875` — exposed via `mt5_get_tick_history`.

### Retention policy — ALREADY EXISTS

- `db.ts:249-293` — `pruneDatabase()` runs every 20 sync cycles and caps:
  - ticks: last 5,000 or within 48h (db.ts:277)
  - candles: last 2,000 (db.ts:283)
  - account_history: last 1,000 or older than 7 days (db.ts:280)
  - audit_logs: last 500 or older than 7 days (db.ts:286)
  - backtest_results: last 200 (db.ts:289)
  - orders: last 1,000 (db.ts:274)

### seedCandles — pollutes real history

- `tradeStore.ts:605-639` — `seedCandles(symbol, timeframe, count, basePrice)` generates synthetic candles and:
  - overwrites `this.chartHistory` (line 636) — destroying the active chart's real data
  - persists them via `dbInsertCandles` (line 637) — polluting the DB
  - recomputes `this.indicators` from synthetic data (line 638)

## Details per TO-DO

### 1. Tick history reload on startup
In the `TradeStore` constructor (tradeStore.ts:100), load `dbGetTicksHistory()` for tracked symbols and repopulate `this.tickHistory` so the chart survives restarts. Currently `tickHistory` is in-memory only and resets on restart, even though the raw ticks are persisted.

### 2. Add mt5_get_candles tool
Add `mt5_get_candles(symbol, timeframe, count)` to `mcpServer.ts` that calls `dbGetCandles` and falls back to the active chart's history — mirroring `mt5_get_chart_history` (mcpServer.ts:776) but without requiring the symbol to be the active chart. This is needed because `mt5_get_chart_history` falls back to the active chart's history when the DB is empty (mcpServer.ts:787), so querying a non-active symbol returns nothing.

### 3. Fix seedCandles polluting real history
`seedCandles` (tradeStore.ts:605) is meant for testing but it overwrites `this.chartHistory` and persists synthetic candles to the DB. Either:
- Remove the `dbInsertCandles` call (line 637) so synthetic data stays in-memory only, or
- Add a `persist` parameter (default false) so callers can opt in.

Also add a `dataQuality` flag to any result derived from synthetic candles.

### 4. Add retention window for candles by time
`db.ts:283` only caps candles by count (last 2,000). Add a time-based window (e.g. delete candles older than 90 days) so old data doesn't accumulate. The other tables already have both count and time caps.

### 5. Raise default candle count
`AIMT5Bridge.mq5:875` — `InpHistoryCandles` defaults to 60. Raise to 200+ or make it configurable per request. The on-demand `FETCH_HISTORY` handler already supports arbitrary counts (AIMT5Bridge.mq5:810-818), but the active chart's periodic transmission is stuck at 60.

## Why it matters

Strategies need multi-timeframe OHLCV history. Currently only the active chart's 60 bars are available, and forex symbols are empty when the market is closed. Deriv's synthetic indices (Step Index, Volatility 10, Boom 150) are the only reliably-tradeable symbols right now.