# Candle & Tick History Depth

**Status:** Planned

## Verified current state

### On-demand candle history — ALREADY WORKS

This was a false alarm. The full flow exists:

- `mcpServer.ts:853` — `mt5_request_chart_history` queues a `FETCH_HISTORY` command
- `tradeStore.ts:595` — `requestHistoryFromEA(symbol, timeframe, count)` queues it (symbol casing fixed)
- `AIMT5Bridge.mq5:804-853` — EA handles `FETCH_HISTORY`/`REQUEST_HISTORY`: parses `timeframe`/`count` from the command or `comment` JSON, calls `CopyRates(symbol, tfEnum, 0, count)`, stores the result in `g_onDemandHistoryJson`
- `AIMT5Bridge.mq5:410` — the EA transmits `g_onDemandHistoryJson` as `historyPayload` in the next sync
- `tradeStore.ts:150-156` — server receives `historyPayload`, persists via `dbInsertCandles`

**Remaining issue:** `requestHistoryFromEA` uppercases the symbol (fixed in `symbol-casing.md`). Also `mcpServer.ts:854` uppercases before calling it — also fixed.

### Active chart candles — only 60 bars

- `AIMT5Bridge.mq5:873-880` — `BuildChartHistoryJson` transmits `CopyRates(_Symbol, Period(), 0, count)` with `count = InpHistoryCandles` (default 60). Only the active chart's symbol/timeframe.
- `tradeStore.ts:133-141` — server stores them in `chartHistory` and `dbInsertCandles(currentSym, currentTf, ...)`.

### Tick history — in-memory only

- `tradeStore.ts:98` — `tickHistory` is an in-memory `Map`, capped at 100 entries per symbol (line 213). Does **not** reload from DB on startup.
- `tradeStore.ts:195` — ticks ARE persisted to SQLite via `dbInsertTicks` on every sync.
- `db.ts:438` — `dbGetTicksHistory(symbol, limit)` reads back from SQLite.
- `apiRoutes.ts:239` — exposed via `GET /api/database/ticks`.
- `mcpServer.ts:875` — exposed via `mt5_get_tick_history`.

## To-do

- [ ] **Tick history reload on startup.** In the `TradeStore` constructor (tradeStore.ts:100), load `dbGetTicksHistory()` for tracked symbols and repopulate `this.tickHistory` so the chart survives restarts.
- [ ] **Candle query tool.** Add `mt5_get_candles(symbol, timeframe, count)` to `mcpServer.ts` that calls `dbGetCandles` and falls back to the active chart's history — mirroring `mt5_get_chart_history` but without requiring the symbol to be the active chart.
- [ ] **Retention policy.** Add `pruneCandles()` / `pruneTicks()` in `db.ts` that deletes rows older than a configurable window (candles 90 days, ticks 7 days), called from `pruneDatabase()`.
- [ ] **Raise default candle count.** `AIMT5Bridge.mq5:875` — `InpHistoryCandles` defaults to 60. Raise to 200+ or make it configurable per request.

## Why it matters

Strategies need multi-timeframe OHLCV history. Currently only the active chart's 60 bars are available, and forex symbols are empty when the market is closed. Deriv's synthetic indices (Step Index, Volatility 10, Boom 150) are the only reliably-tradeable symbols right now.