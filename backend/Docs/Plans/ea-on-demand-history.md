# EA-Side On-Demand Historical Bar Requests

**Status:** Already implemented — verified

## TO-DO

- [ ] 1. Fix single-slot race condition (AIMT5Bridge.mq5:49, 844)
- [ ] 2. Verify end-to-end live (never tested)
- [ ] 3. Add request ID so the server can match responses to requests

## Verified current state

The full on-demand history flow already exists:

1. **Request:** `mcpServer.ts:853` — `mt5_request_chart_history` tool
2. **Queue:** `tradeStore.ts:595` — `requestHistoryFromEA(symbol, timeframe, count)` enqueues a `FETCH_HISTORY` command with `comment: JSON.stringify({ timeframe, count })`
3. **EA handler:** `AIMT5Bridge.mq5:804-853` — handles both `FETCH_HISTORY` and `REQUEST_HISTORY`:
   - Parses `timeframe` and `count` from the command object or the `comment` JSON (`ExtractJsonField`)
   - Defaults to `M1` / 100 bars
   - Calls `CopyRates(symbol, tfEnum, 0, count, reqRates)`
   - Builds a JSON payload and stores it in `g_onDemandHistoryJson` (line 844)
4. **Return:** `AIMT5Bridge.mq5:408-411` — the EA transmits `g_onDemandHistoryJson` as `historyPayload` in the next sync, then clears it
5. **Persist:** `tradeStore.ts:150-156` — server receives `historyPayload`, persists via `dbInsertCandles`

## Details per TO-DO

### 1. Fix single-slot race condition
`AIMT5Bridge.mq5:49` declares a single `string g_onDemandHistoryJson = ""`. Line 844 overwrites it on each `FETCH_HISTORY`. If the bridge requests history for two different symbols/timeframes before the next sync (line 411 clears it), only the last is returned — the first is silently lost.

Fix: replace the single string with a queue of `{ id, json }` pairs, and transmit all of them in `historyPayload` as an array. The server already handles a single payload object (tradeStore.ts:150) — extend it to handle an array.

### 2. Verify end-to-end live
The flow exists on paper but was never tested. Run `mt5_request_chart_history` with a real symbol (e.g. Step Index) and confirm the EA pulls and returns real bars through the DB.

### 3. Add request ID
Currently the command `id` is used to track the request, but the `historyPayload` returned by the EA has no `id` field, so the server can't match a response to a specific request. Add the command `id` to the payload JSON (AIMT5Bridge.mq5:827) so the server can route the result correctly — especially important once the queue fix (TO-DO 1) is in place.

## Why it matters

Without on-demand requests, the AI can only analyze the active chart's last 60 bars. This flow already removes that limitation — it just needs the casing fix (done) and a live test.