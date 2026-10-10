# MCP (Model Context Protocol)

The bridge exposes MT5 to AI agents as an MCP server. Implementation:
`backend/services/mcpServer.ts` (493 lines). It defines 13 tools and a
JSON-RPC 2.0 handler (`handleMcpJsonRpc`), wired into `apiRoutes.ts`.

## The 13 tools

All tools return a JSON object serialized as MCP `content[0].text`.

| Tool | Arguments | What it does |
|---|---|---|
| `mt5_get_account_info` | — | balance, equity, margin, free margin, margin level %, leverage, currency, server |
| `mt5_get_market_data` | `symbol?` (default ALL) | bid/ask/spread/24h high/24h low per symbol |
| `mt5_get_open_positions` | `symbol?` | open positions with ticket, type, volume, open price, P/L, SL/TP |
| `mt5_execute_trade` | `symbol`, `orderType` (BUY\|SELL), `volume`, `sl?`, `tp?`, `comment?`, `magic?` | async order → commandId |
| `mt5_modify_position` | `ticket`, `sl?`, `tp?` | modify SL/TP on an open position |
| `mt5_close_position` | `ticket`, `volume?` | full or partial close |
| `mt5_close_all` | `symbol?` (default ALL) | liquidate portfolio or one symbol |
| `mt5_configure_risk_guard` | `globalTakeProfitUSD?`, `globalStopLossUSD?`, `trailingStopEnabled?`, `trailingStopDistancePoints?`, `trailingStopStepPoints?`, `maxLotSizePerTrade?`, `emergencyKillSwitch?` | update risk parameters |
| `mt5_get_execution_queue` | `limit?` (default 10) | command status + execution latency |
| `mt5_get_current_chart` | — | active chart symbol, TF, spread, lot limits |
| `mt5_get_all_symbols` | — | all symbols the EA is streaming |
| `mt5_query_trade_history` | `limit?` (default 20) | historical orders from SQLite |
| `mt5_get_performance_analytics` | — | success rate, totals, DB size |

`mt5_execute_trade`, `mt5_modify_position`, and `mt5_close_position` are
asynchronous: they enqueue a command and return a `commandId`. The EA
executes on MT5 and reports the result back via `/result`, which marks the
command `executed`/`failed`. Poll `mt5_get_execution_queue` to track status.

## JSON-RPC 2.0

`handleMcpJsonRpc(body)` dispatches on `body.method`:

| Method | Response |
|---|---|
| `initialize` | `protocolVersion: "2024-11-05"`, `capabilities: { tools: {} }`, `serverInfo: { name: "mt5-ai-mcp-bridge", version: "2.10.0" }` |
| `tools/list` | `{ tools: MCP_TOOLS }` |
| `tools/call` | executes the tool; result wrapped in `content[0].text` with `isError` flag |
| anything else | `error: { code: -32601, message: "Method not found: ..." }` |

Tool errors are returned as `isError: true` (not JSON-RPC errors), so a client
still gets a valid response envelope.

## Transports

Three ways to talk to the server:

### 1. Direct POST — `POST /api/mcp`

Send a JSON-RPC body, get the response in the same HTTP transaction. Simplest
for scripts and curl.

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"mt5_get_account_info","arguments":{}}}'
```

### 2. REST shortcut — `GET /api/mcp/tools` and `POST /api/mcp/tools/:name`

Bypasses JSON-RPC wrapping. `POST` returns `{ "success": true, "result": ... }`.

### 3. SSE — `GET /api/mcp/sse` + `POST /api/mcp/messages`

Server-Sent Events transport for streaming:

1. `GET /api/mcp/sse` opens a long-lived connection. The server immediately
   writes:
   ```
   event: endpoint
   data: /api/mcp/messages?sessionId=mcp-session-1791556297290-4632
   ```
2. The client POSTs JSON-RPC requests to that URL.
3. The server executes the request and writes the response back on the **same**
   SSE stream as:
   ```
   event: message
   data: {"jsonrpc":"2.0","id":...,"result":{...}}
   ```

This is how an MCP host (e.g. Claude) connects: it opens the SSE stream, reads
the `endpoint` event, then sends requests over `/api/mcp/messages` and reads
the pushed `message` events.

See `backend/mcp-test/sse_roundtrip.py` for a working end-to-end example.

## Tool schema reference

Each tool's `inputSchema` is a JSON Schema object with `type: "object"`,
`properties`, and `required` where applicable. `mt5_execute_trade` requires
`symbol`, `orderType`, `volume`. `mt5_modify_position` and
`mt5_close_position` require `ticket`.