# Server & Routing

## Entry point: `server.ts`

`startServer()` builds two Express apps sharing one `tradeStore` singleton:

```
server.listen(3000, '0.0.0.0')   # Web UI + Vite + WebSocket + /api
mt5Server.listen(7777, '0.0.0.0') # Dedicated MT5 endpoint
```

If port 7777 is taken, the hub logs a notice and port 3000 remains fully
functional for MT5 routing (the EA's fallback URL).

### Middleware (applied to both servers)

- `express.json({ limit: '10mb' })` + `express.urlencoded`
- CORS: `Access-Control-Allow-Origin: *`, methods `GET, POST, PUT, DELETE`,
  headers `Origin, X-Requested-With, Content-Type, Accept, Authorization`,
  and an `OPTIONS → 200` preflight short-circuit.

### Route mounting

| Mount | Router | File |
|---|---|---|
| `/` and `/api/mt5` | `mt5Router` | `backend/routes/mt5Routes.ts` |
| `/api` | `apiRouter` | `backend/routes/apiRoutes.ts` |

Because `mt5Router` is mounted at both `/` and `/api/mt5`, every MT5 endpoint
works on both the dedicated hub and the main port.

### Vite / static serving

In dev (`NODE_ENV !== 'production'`) the Vite server runs in
`middlewareMode: true` and is mounted after the API routes. In production,
`dist/` is served statically with a catch-all `index.html` fallback.

### WebSocket

`setupWebSocketServer(server)` attaches a `ws` server at path `/ws` to the
**port 3000** HTTP server only. See [websockets.md](websockets.md).

## Environment

- `PORT` (default 3000) — main server
- `NODE_ENV=production` — switches Vite middleware to static `dist/`
- `.env` is loaded via `dotenv` at startup

## Startup log output

```
[MT5 Bridge Terminal] Web UI & WebSocket Server running at http://localhost:3000
[MT5 Bridge Hub] Dedicated MT5 Endpoint running at http://127.0.0.1:7777
```