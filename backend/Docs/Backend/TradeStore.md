# Trade Store

Implementation: `backend/services/tradeStore.ts` (511 lines). Singleton
instance exported as `tradeStore`. It is the single source of truth shared by
both HTTP servers, the WebSocket broadcast, and the MCP layer.

## State

| Field | Type | Source |
|---|---|---|
| `account` | `AccountInfo` | EA `/sync` |
| `positions` | `Map<ticket, Position>` | EA `/sync` (fully replaced each sync) |
| `ticks` | `Map<symbol, TickData>` | EA `/sync` + `/tick` + `simulate-tick` |
| `tickHistory` | `Map<symbol, {time,bid,ask}[]>` | derived from ticks (last 100 per symbol) |
| `commandQueue` | `TradeCommand[]` | `enqueueCommand` (max 50, unshift) |
| `logs` | `ExecutionLog[]` | `addLog` (max 100, unshift) |
| `riskGuard` | `RiskGuardConfig` | defaults + `updateRiskGuard` |
| `currentChart` | `ChartSymbolInfo \| null` | EA `/sync` |
| `allSymbols` | `DetailedSymbolInfo[]` | EA `/sync` |
| `chartHistory` | `CandleData[]` | EA `/sync` (replaced when non-empty) |
| `eaConnected` | boolean | derived from sync recency |
| `lastEaSync`, `eaVersion`, `mt5ServerTime` | — | EA `/sync` |
| `terminalName`, `terminalCompany`, `terminalBuild` | — | EA `/sync` |

Positions come **only** from the real MT5 EA — the server never fabricates a
position. `getState()` marks the EA disconnected if no sync arrives within
5000 ms.

## `handleEASync(payload)`

Called on every `/sync`. Steps:
1. Mark connected; log on first connect / reconnect.
2. Update `currentChart`, `allSymbols`, `chartHistory`.
3. Replace `account` (merge, set `lastUpdate` to now).
4. **Clear and repopulate** `positions` from the payload.
5. Merge each tick, computing `high24h`/`low24h` and appending to
   `tickHistory`.
6. Resolve any `pendingExecutionResults` reported by the EA.
7. Run `evaluateRiskGuard()`.
8. Return `dispatchPendingCommands()` — the commands the EA must execute.

## Command lifecycle

`enqueueCommand(params)`:
1. **Risk pre-validation** — blocked if the kill switch is active (except
   close actions), lot size exceeds `maxLotSizePerTrade`, open-position cap
   reached, or symbol not in `allowedSymbols`.
2. Build a `TradeCommand` with status `pending`, unshift onto the queue.
3. Persist to SQLite (`dbInsertOrder`), log it.
4. Return `{ success: true, commandId }`.

`dispatchPendingCommands()` marks every `pending` command `dispatched` and
returns them — this is what the EA receives in its `/sync` response.

`resolveExecutionResult(res)` (called from `/result` and from sync results):
marks the command `executed`/`failed`, stores the result, persists to SQLite,
and logs `trade`/`error`.

Sources: `AI_MCP`, `MANUAL_UI`, `RISK_GUARD`, `API`.

## Tick math

`updateTick(tick)` recomputes floating P/L for every open position on that
symbol:
- `XAUUSD`: `diff * volume * 100`
- `BTCUSD`: `diff * volume`
- others: `diff * volume * 100000`

where `diff = type === 'BUY' ? bid - openPrice : openPrice - ask`. It then
updates `account.profit` and `account.equity` and recomputes `marginLevel`.

## Risk guard

`evaluateRiskGuard()` runs on every sync and auto-liquidates when:
- floating profit `>= globalTakeProfitUSD` → queues `CLOSE_ALL`
- floating profit `<= -globalStopLossUSD` → queues `CLOSE_ALL`
- `marginLevel < autoCloseOnMarginLevelBelow` → queues `CLOSE_ALL`

`updateRiskGuard(updates)` merges partial config and persists.
`triggerKillSwitch(active)` sets the switch and queues `CLOSE_ALL` when
engaged.

## Persistence

Every state change fans out to SQLite via the `db*` helpers (see
[database.md](database.md)) and to WebSocket clients via `broadcast` (see
[websockets.md](websockets.md)).