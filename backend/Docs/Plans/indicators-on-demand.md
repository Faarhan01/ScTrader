# Indicator Computation On Demand

**Status:** Planned

## TO-DO

- [ ] 1. Add indicators array argument to mt5_get_technical_indicators and mt5_get_chart_history
- [ ] 2. Thread period overrides through calculateIndicators
- [ ] 3. Remove symbol uppercasing in mt5_get_technical_indicators
- [ ] 4. Add mt5_get_candles so indicator tools can query any symbol/timeframe

## Verified current state

### Fixed indicator set and periods

`indicatorEngine.ts:3` — `calculateIndicators(candles, symbol, timeframe)` computes a **fixed** set with hardcoded periods (lines 18-37):

```js
const rsi14 = computeRSI(closes, 14);
const ema9 = computeEMA(closes, 9);
const ema21 = computeEMA(closes, 21);
const ema50 = computeEMA(closes, 50);
const ema200 = computeEMA(closes, Math.min(200, n));
const sma20 = computeSMA(closes, 20);
const sma50 = computeSMA(closes, 50);
const macd = computeMACD(closes, 12, 26, 9);
const bollinger = computeBollinger(closes, 20, 2);
const atr14 = computeATR(highs, lows, closes, 14);
```

**Good news:** the underlying compute functions already accept period parameters:
- `computeRSI(closes, period = 14)` — indicatorEngine.ts:131
- `computeMACD(closes, fast = 12, slow = 26, signal = 9)` — indicatorEngine.ts:163
- `computeBollinger(closes, period = 20, stdDev = 2)` — indicatorEngine.ts:202
- `computeATR(highs, lows, closes, period = 14)` — indicatorEngine.ts:228
- `computeSMA(values, period)` — indicatorEngine.ts:114
- `computeEMA(values, period)` — indicatorEngine.ts:121

So only `calculateIndicators` needs to thread parameters through — the compute functions are already flexible.

### Tool interfaces

- `mcpServer.ts:803` — `mt5_get_technical_indicators` accepts `symbol`/`timeframe` but no indicator selection. It uppercases both (lines 804-805).
- `mcpServer.ts:776` — `mt5_get_chart_history` accepts `includeIndicators` (boolean, default true) but no indicator selection.
- `mcpServer.ts:792` — indicators are computed from whatever candles are available: DB first (`dbGetCandles(sym, tf, limit)`), falling back to the active chart's in-memory `chartHistory` (lines 787-788).

### Consensus summary

`indicatorEngine.ts:58-87` — a scoring system (bullScore/bearScore) produces a summary: `STRONG_BUY` / `BUY` / `NEUTRAL` / `SELL` / `STRONG_SELL`. RSI, MACD, and EMA9/EMA21 each contribute 1 point, EMA200 contributes 1 point, RSI extremes contribute 2. Thresholds are 4+ for strong. This is a reasonable default but not configurable.

## Details per TO-DO

### 1. Add indicators array argument
Add an optional `indicators` array to `mt5_get_technical_indicators` and `mt5_get_chart_history` (e.g. `["rsi","ema","macd","bollinger","atr"]`). Only compute the requested ones. This avoids computing all 6 indicators when the agent only wants RSI.

### 2. Thread period overrides through calculateIndicators
Add optional parameters to `calculateIndicators`: `rsiPeriod`, `emaPeriods`, `macdPeriods`, `bollingerPeriod`, `bollingerStdDev`, `atrPeriod`. Pass them through to the compute functions at lines 18-37. The compute functions already accept these — just need the wiring.

### 3. Remove symbol uppercasing in mt5_get_technical_indicators
`mcpServer.ts:804-805` uppercases `symbol` and `timeframe`. Timeframes like `PERIOD_M1` are already uppercase, but symbols should pass through unchanged (fixed in `symbol-casing.md`).

### 4. Add mt5_get_candles
Both indicator tools fall back to the active chart's history when the DB is empty. Add `mt5_get_candles` (see `candle-tick-history.md`) so they can request candles for any symbol/timeframe first, instead of falling back to whatever the active chart happens to be.

## Why it matters

An external AI agent currently has to compute indicators itself from raw OHLCV. Precomputing them server-side saves the agent work and ensures consistent methodology across all consumers. But the fixed set/periods means every consumer gets the same 6 indicators — inflexible for agents that want, say, only RSI(21) on XAUUSD H4.