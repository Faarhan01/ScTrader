# Indicator Computation On Demand

**Status:** Planned

## Verified current state

- `backend/services/indicatorEngine.ts:3` — `calculateIndicators(candles, symbol, timeframe)` computes a **fixed** set: RSI(14), EMA(9/21/50/200), SMA(20/50), MACD(12,26,9), Bollinger(20,2), ATR(14). No way to request a subset or different periods.
- `mcpServer.ts:803` — `mt5_get_technical_indicators` accepts `symbol`/`timeframe` but no indicator selection. It uppercases both (lines 804-805).
- `mcpServer.ts:776` — `mt5_get_chart_history` accepts `includeIndicators` (boolean, default true) but no indicator selection.
- `mcpServer.ts:792` — indicators are computed from whatever candles are available: DB first (`dbGetCandles(sym, tf, limit)`), falling back to the active chart's in-memory `chartHistory` (line 787-788).

## To-do

- [ ] **Indicator selection.** Add an optional `indicators` array argument to `mt5_get_technical_indicators` and `mt5_get_chart_history` (e.g. `["rsi","ema","macd","bollinger","atr"]`). Only compute the requested ones.
- [ ] **Period overrides.** Allow `rsiPeriod`, `emaPeriods`, `macdPeriods`, `bollingerPeriod`, `atrPeriod` as optional arguments instead of the hardcoded values in `indicatorEngine.ts:18-37`.
- [ ] **Remove uppercasing.** `mcpServer.ts:804-805` uppercases `symbol`/`timeframe`. Timeframes like `PERIOD_M1` are already uppercase, but symbols should pass through unchanged (fixed in `symbol-casing.md`).
- [ ] **Candle source.** Both indicator tools fall back to the active chart's history when the DB is empty. Add `mt5_get_candles` (see `candle-tick-history.md`) so they can request candles for any symbol/timeframe first.

## Why it matters

An external AI agent currently has to compute indicators itself from raw OHLCV. Precomputing them server-side saves the agent work and ensures consistent methodology across all consumers. But the fixed set/periods means every consumer gets the same 6 indicators — inflexible for agents that want, say, only RSI(21) on XAUUSD H4.