# Backend Documentation

Architecture and reference for the MT5 AI Bridge backend. All entry-point code
lives in `server.ts`; the source tree is:

```
backend/
├── database/db.ts            # sql.js persistence layer
├── routes/mt5Routes.ts      # MT5 EA HTTP endpoints (/sync, /result, /tick, /health)
├── routes/apiRoutes.ts      # Web API + MCP transports (/api/*)
├── services/tradeStore.ts   # in-memory state engine + risk guard
├── services/mcpServer.ts    # MCP tool definitions + JSON-RPC handler
├── services/websocketServer.ts # ws broadcast to the web UI
├── types/mt5.ts             # shared TypeScript interfaces
└── ea/AIMT5Bridge.mq5       # MetaTrader 5 Expert Advisor
```

## Runtime topology

`server.ts` starts **two HTTP servers** from one process:

| Port | Purpose | Mounts |
|---|---|---|
| 3000 | Vite dev middleware + Web UI + WebSocket + all `/api` routes | `mt5Router`, `apiRouter`, `/ws` |
| 7777 | Dedicated MT5 endpoint (`127.0.0.1:7777`) | `mt5Router`, `apiRouter` |

Both servers share the same `tradeStore` singleton, so the EA can talk to
either port and the web UI sees identical state.

## Documents

- [Server & routing](server.md) — ports, middleware, route mounting
- [API reference](api.md) — every endpoint, request/response shapes
- [MCP](mcp.md) — the 13 tools, JSON-RPC 2.0, the three transports
- [WebSocket](websockets.md) — `/ws` broadcast, message types
- [Database](database.md) — sql.js schema, persistence, analytics
- [Trade store](tradeStore.md) — state engine, command lifecycle, risk guard
- [Expert Advisor](ea.md) — MQL5 sync loop, command execution, trailing stops