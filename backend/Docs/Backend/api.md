# API Reference

All routes are served on both port 3000 and 7777. MT5 endpoints are also
available at the root path (`/health`, `/sync`, `/result`, `/tick`).

## MT5 EA endpoints (`backend/routes/mt5Routes.ts`)

The EA calls these directly via MQL5 `WebRequest`. The server does **not**
authenticate the API key sent in the sync payload.

### `GET /health` (also `/api/mt5/health`, `/handshake`)

Health check / WebRequest verification.

Response:
```json
{ "status": "ok", "bridge": "AI MT5 Bridge Service", "version": "2.10",
  "timestamp": 1791555245391, "port": 7777,
  "mcpEndpoint": "http://127.0.0.1:3000/api/mcp" }
```

### `POST /sync` (also `/api/mt5/sync`)

Primary high-frequency sync — called every 500 ms by the EA.

Request body (`EASyncPayload`): `apiKey`, `eaVersion`, `mt5Time`,
`terminalName`, `terminalCompany`, `terminalBuild`, `currentChart`,
`allSymbols`, `chartHistory`, `account`, `positions`, `ticks`,
`pendingExecutionResults`.

Response (`EASyncResponse`):
```json
{ "status": "ok", "serverTime": 1791555245, "commands": [...], "riskGuard": {...} }
```

The `commands` array is the set of pending orders the EA must execute
(`EXECUTE_TRADE`, `MODIFY_POSITION`, `CLOSE_POSITION`, `CLOSE_ALL`).

### `POST /result` (also `/api/mt5/result`)

Direct execution-result report from the EA.

```json
{ "commandId": "cmd-...", "success": true, "dealTicket": 9708058052,
  "orderTicket": 9835214258, "executionPrice": 1.11927, "errorCode": 0,
  "errorMessage": "", "executionTimeMs": 297 }
```

Requires `commandId`; otherwise `400`.

### `POST /tick` (also `/api/mt5/tick`)

Live tick push from the EA. Requires `symbol`; otherwise `400`.

## Web API (`backend/routes/apiRoutes.ts`)

### `GET /api/state`

Full state snapshot: `connection`, `currentChart`, `allSymbols`,
`chartHistory`, `account`, `positions`, `ticks`, `tickHistory`,
`commandQueue`, `riskGuard`, `logs`.

### `POST /api/commands`

Enqueue an order from the UI or an external API client.

```json
{ "action": "EXECUTE_TRADE", "symbol": "EURUSD", "orderType": "BUY",
  "volume": 0.1, "sl": 1.08, "tp": 1.10, "magic": 889900,
  "comment": "...", "source": "MANUAL_UI" }
```

Response: `{ "success": true, "commandId": "cmd-..." }` or `400` with
`{ "success": false, "error": "..." }`.

### `POST /api/risk`

Update risk-guard parameters. Body is merged into the current config.

### `POST /api/kill-switch`

```json
{ "active": true }
```

Engaging halts new orders and queues a `CLOSE_ALL`.

### `GET /api/mcp/sse`

Server-Sent Events transport. See [mcp.md](mcp.md).

### `POST /api/mcp`, `POST /api/mcp/messages`

JSON-RPC 2.0 entry points. See [mcp.md](mcp.md).

### `GET /api/mcp/tools`

Returns `{ "tools": MCP_TOOLS }` — the 13 tool definitions.

### `POST /api/mcp/tools/:name`

Execute a tool directly via REST. Body is the tool's `arguments`.
Response: `{ "success": true, "result": ... }` or `400`.

### `GET /api/ea/code`

Returns `{ "code": "<MQL5 source>" }` for `backend/ea/AIMT5Bridge.mq5`.

### `GET /api/ea/download`

Streams `AIMT5Bridge.mq5` as an attachment.

### `GET /api/database/analytics`

SQLite analytics: `dbSizeBytes`, `totalOrders`, `executedOrders`,
`failedOrders`, `executionSuccessRate`, `totalLogs`.

### `GET /api/database/orders?limit=100`

Recent order history from SQLite.

### `GET /api/database/download`

Streams `data/mt5_bridge.sqlite` as an attachment.

### `POST /api/simulate-tick`

For testing the tick pipeline. Body: `{ "symbol", "bid", "ask" }`.
Random-walks the price if `bid`/`ask` are omitted. Broadcasts the resulting
tick over WebSocket.