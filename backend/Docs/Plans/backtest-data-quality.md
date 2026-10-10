# Strategy Backtest Data Quality

**Status:** Planned

## Verified current state

### Synthetic candle fallback (confirmed)

`strategyEngine.ts:469-495` — when the DB has fewer than 20 candles for a strategy's symbol/timeframe, the backtest generates synthetic candles instead:

```js
let price = strategy.symbol.includes('JPY') ? 154.5
  : strategy.symbol.includes('XAU') ? 2650.0
  : 1.085;
const now = Math.floor(Date.now() / 1000);
for (let i = 100; i >= 0; i--) {
  const t = now - i * 60;
  const open = price;
  const delta = (Math.random() - 0.49) * (price * 0.0008);
  ...
}
```

This is called from `apiRoutes.ts:464-496` (the `/strategies/:id/backtest` endpoint). The synthetic candles are persisted to the DB via `dbInsertCandles`, so they pollute the real history.

**Result:** backtests on EURUSD currently show prices ~10591 instead of the real ~1.12. The backtest "works" but the numbers are meaningless.

### Symbol mismatch bug (confirmed)

`strategyEngine.ts:658-664` — `evaluateAllActiveStrategies` falls back to the active chart's history when the DB is empty:

```js
let candles = await dbGetCandles(strat.symbol, strat.timeframe, 100);
if (candles.length < 15) {
  const liveHistory = tradeStore.getChartHistory();  // active chart's candles
  if (liveHistory && liveHistory.length >= 15) {
    candles = liveHistory;  // WRONG symbol
  }
}
```

`getChartHistory()` returns the **active chart's** candles, not the strategy's symbol. If the active chart is Step Index 200 and the strategy is for EURUSD, the fallback evaluates EURUSD signals against Step Index data. Same bug exists in `executeStrategySignal` (lines 686-689) and `evaluateLiveSignal` callers.

## To-do

- [ ] **Flag synthetic backtests.** Add a `dataQuality: 'synthetic' | 'live'` field to `BacktestResult` so callers can distinguish real from generated data. Or reject the backtest with a clear error when candles are missing.
- [ ] **Don't persist synthetic candles.** Remove the `dbInsertCandles` call in `apiRoutes.ts:493` so synthetic data doesn't pollute the DB. Generate them in-memory only for the backtest run.
- [ ] **Fix the symbol mismatch.** In `strategyEngine.ts:658-664` and `686-689`, only fall back to `getChartHistory()` if its symbol matches the strategy's symbol. Otherwise return a NEUTRAL signal with a clear rationale.
- [ ] **Seed real candles.** Once `candle-tick-history.md` is implemented, backtests should run on real EA data by default.

## Why it matters

A backtest that silently uses synthetic data gives false confidence. And a strategy evaluated against the wrong symbol's candles produces garbage signals that could trigger real trades.