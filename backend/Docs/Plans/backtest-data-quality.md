# Strategy Backtest Data Quality

**Status:** Planned

## TO-DO

- [ ] 1. Flag synthetic backtests with a dataQuality field (strategyEngine.ts:108)
- [ ] 2. Stop persisting synthetic candles (apiRoutes.ts:493, tradeStore.ts:637)
- [ ] 3. Fix symbol mismatch in both backtest paths (apiRoutes.ts:465, mcpServer.ts:940)
- [ ] 4. Add mt5_get_candles so backtests use real data (candle-tick-history.md)
- [ ] 5. Unify the two backtest paths

## Verified current state

### Two backtest paths — both broken the same way

**Path 1 — REST** (`apiRoutes.ts:450-508`, `/strategies/:id/backtest`):
- Line 461: `let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, candleCount)`
- Lines 464-496: if fewer than 20 candles, falls back to `tradeStore.getChartHistory()` (line 465) — **wrong symbol** — or generates synthetic candles inline
- Line 493: `await dbInsertCandles(strategy.symbol, strategy.timeframe, synthCandles)` — **persists synthetic data to the DB**
- Line 498: runs the backtest
- Line 499: `await dbSaveBacktestResult(result)` — saves the result

**Path 2 — MCP** (`mcpServer.ts:928-976`, `mt5_backtest_strategy`):
- Line 938: `let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, candleLimit)`
- Lines 939-948: if fewer than 20 candles, falls back to `tradeStore.getChartHistory()` (line 940) — **wrong symbol** — or calls `tradeStore.seedCandles` (line 945)
- `seedCandles` (tradeStore.ts:605-639) generates synthetic candles, **overwrites `this.chartHistory`** (line 636), **persists them via `dbInsertCandles`** (line 637), and **recomputes `this.indicators`** (line 638)
- Line 950: runs the backtest
- Line 951: `await dbSaveBacktestResult(backtest)` — saves the result

### Synthetic candle generator

Both paths use the same algorithm (apiRoutes.ts:472-491, strategyEngine.ts equivalent):
```js
let price = strategy.symbol.includes('JPY') ? 154.5
  : strategy.symbol.includes('XAU') ? 2650.0
  : 1.085;
for (let i = 100; i >= 0; i--) {
  const t = now - i * 60;
  const open = price;
  const delta = (Math.random() - 0.49) * (price * 0.0008);
  const close = open + delta;
  ...
  price = close;
}
```

**Result:** backtests on EURUSD show prices ~10591 instead of the real ~1.12. The backtest "works" but the numbers are meaningless.

### BacktestResult interface (strategyEngine.ts:108-137)

Has no `dataQuality` field. `sharpeRatio` is optional (line 133) but never computed anywhere.

### Symbol mismatch bug

`getChartHistory()` (tradeStore.ts:636) returns the **active chart's** candles, not the strategy's symbol. If the active chart is Step Index 200 and the strategy is for EURUSD, the fallback evaluates EURUSD signals against Step Index data. Same bug in:
- `apiRoutes.ts:465`
- `mcpServer.ts:940`
- `strategyEngine.ts:658-664` (`evaluateAllActiveStrategies`)
- `strategyEngine.ts:686-689` (`executeStrategySignal`)

## Details per TO-DO

### 1. Flag synthetic backtests
Add `dataQuality: 'synthetic' | 'live'` to `BacktestResult` (strategyEngine.ts:108). Set it based on whether the candles came from the DB or were generated. This lets callers distinguish real from generated data. Also consider rejecting the backtest with a clear error when candles are missing, rather than silently generating fake data.

### 2. Stop persisting synthetic candles
- `apiRoutes.ts:493` — remove the `dbInsertCandles` call. Generate synthetic candles in-memory only for the backtest run.
- `tradeStore.ts:637` — in `seedCandles`, remove the `dbInsertCandles` call, or add a `persist` parameter (default false) so callers can opt in.

### 3. Fix symbol mismatch
In all four locations, only fall back to `getChartHistory()` if its symbol matches the strategy's symbol. Otherwise return a NEUTRAL signal or throw a clear error. The fix is the same pattern in each place:
```js
const liveHistory = tradeStore.getChartHistory();
if (liveHistory && liveHistory.length >= 20 && liveHistory.symbol === strategy.symbol) {
  candles = liveHistory;
}
```
Note: `getChartHistory()` currently returns a bare array with no symbol — you may need to add a `symbol` field to `CandleData` or track the active chart symbol separately.

### 4. Add mt5_get_candles
Both backtest paths rely on `dbGetCandles` returning real data. Add `mt5_get_candles(symbol, timeframe, count)` (see `candle-tick-history.md`) so backtests can request candles for any symbol/timeframe, not just the active chart.

### 5. Unify the two backtest paths
The REST endpoint (`apiRoutes.ts:450`) and MCP tool (`mcpServer.ts:928`) duplicate the same candle-fetching and synthetic-fallback logic. Extract it into a shared function in `strategyEngine.ts` so both paths use one implementation, and fixes apply in one place.

## Why it matters

A backtest that silently uses synthetic data gives false confidence. And a strategy evaluated against the wrong symbol's candles produces garbage signals that could trigger real trades.