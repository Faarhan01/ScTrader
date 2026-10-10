# EA-Side On-Demand Historical Bar Requests

**Status:** Already implemented — no action needed (verified)

## Verified current state

The full on-demand history flow already exists:

1. **Request:** `mcpServer.ts:853` — `mt5_request_chart_history` tool
2. **Queue:** `tradeStore.ts:595` — `requestHistoryFromEA(symbol, timeframe, count)` enqueues a `FETCH_HISTORY` command with `comment: JSON.stringify({ timeframe, count })`
3. **EA handler:** `AIMT5Bridge.mq5:804-853` — handles both `FETCH_HISTORY` and `REQUEST_HISTORY`:
   - Parses `timeframe` and `count` from the command object or the `comment` JSON (`ExtractJsonField`)
   - Defaults to `M1` / 100 bars
   - Calls `CopyRates(symbol, tfEnum, 0, count, reqRates)`
   - Builds a JSON payload and stores it in `g_onDemandHistoryJson`
4. **Return:** `AIMT5Bridge.mq5:410` — the EA transmits `historyPayload` in the next sync
5. **Persist:** `tradeStore.ts:150-156` — server persists via `dbInsertCandles`

## Remaining issues (minor)

- `tradeStore.ts:598` — `requestHistoryFromEA` uppercases the symbol. Fixed in `symbol-casing.md`.
- `mcpServer.ts:854` — `mt5_request_chart_history` uppercases before calling. Fixed in `symbol-casing.md`.
- The on-demand result is only stored in `g_onDemandHistoryJson` (a single slot) — if two requests come in before the next sync, the second overwrites the first.

## To-do

- [ ] **Single-slot race condition.** `g_onDemandHistoryJson` is one variable. If the bridge requests history for two different symbols/timeframes before the next sync, only the last is returned. Consider a queue of pending history requests with per-request IDs.
- [ ] **Verify end-to-end.** The flow exists but was never tested live. Run `mt5_request_chart_history` and confirm the EA pulls and returns real bars.

## Why it matters

Without on-demand requests, the AI can only analyze the active chart's last 60 bars. This flow already removes that limitation — it just needs the casing fix and a live test.