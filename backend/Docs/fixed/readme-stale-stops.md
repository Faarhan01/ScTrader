# README Stale Stop-Loss Values (Deriv error 10016)

**Status:** Fixed

## Problem

The Python agent snippet in `README.md` used hardcoded absolute stops:

```python
"sl": 1.0820,
"tp": 1.0920,
```

Deriv rejects stops outside the minimum distance from the current price, returning MT5 error **10016 "invalid stops"**. At the time EURUSD traded near 1.1196, so a stop-loss at 1.0820 (370 pips away) was far outside the broker's allowed range.

The MCP layer and EA worked correctly end-to-end — the failure was purely a broker constraint. Any agent copy-pasting the snippet would hit the same rejection.

## Fixed

`README.md` lines 183-190 — added a comment explaining the constraint and pointing agents to read the live price first with `mt5_get_market_data`, then size stops relative to it (e.g. +/- 10 pips for EURUSD, +/- 0.1 for Step Index).

## Lesson

Default example values should adapt to the live market, not be stale hardcoded prices.