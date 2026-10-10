# WebSocket

Implementation: `backend/services/websocketServer.ts` (64 lines). A `ws`
`WebSocketServer` mounted at path `/ws` on the **port 3000** HTTP server.

## Connection lifecycle

`setupWebSocketServer(server)` creates `wss = new WebSocketServer({ server,
path: '/ws' })`. On each connection:

1. The server sends an immediate `init` event containing the full
   `tradeStore.getState()` snapshot.
2. Incoming messages are JSON-parsed and dispatched to `handleClientMessage`.
   Malformed messages are silently ignored.
3. On `close`/`error` the client is removed from the set.

## Client → server messages

| `type` | Response |
|---|---|
| `ping` | `{ "type": "pong", "timestamp": <ms> }` |
| `get_state` | `{ "type": "init", "payload": tradeStore.getState() }` |

## Server → client broadcasts

`broadcast({ type, payload })` serializes the message once and sends it to
every open client. It is a no-op when there are no clients. The MT5 routes
call it on every state-changing event:

| Trigger | Broadcast `type` | Payload |
|---|---|---|
| EA `/sync` | `ea:sync` | account, positions, ticks, currentChart, allSymbols, chartHistory, connection, `isEaConnected`, `lastEaSync` |
| EA `/result` | `command:result` | the execution result |
| EA `/tick` | `tick` | the updated tick |
| `/api/commands` | `command:queued` | the new head of `commandQueue` |
| `/api/risk` | `risk:updated` | the risk guard config |
| `/api/kill-switch` | `risk:kill_switch` | `{ active }` |
| `/api/simulate-tick` | `tick` | the updated tick for the symbol |

## Purpose

The WebSocket feed is what the React web UI (port 3000) consumes for live
dashboard updates — account metrics, open positions, tick streams, and
command status — without polling.