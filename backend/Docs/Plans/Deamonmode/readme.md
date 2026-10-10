# Daemon Mode

**Status:** Proposed

## Problem

The friendly CLI (`backend/mcp-tool/cli.js`) runs each command as a stateless process — connect, do one thing, exit. For an AI agent that needs to be "in sync" with the trading flow, this is the wrong model:

1. **Poll instead of subscribe.** To know a trade executed, the agent must repeatedly call `positions` or `orders`. It can't just wait for the event.
2. **No live tick stream.** `quote EURUSD` is a snapshot. The agent can't watch ticks flow — it has to spam the command.
3. **No session context.** Each call is blind to what happened before. The agent re-reads `status` every time to reconstruct state.
4. **Latency.** A trade round-trip is: agent call → queue → EA 500ms sync → MT5 → result. By the the agent polls again, state may have moved.

## Solution

A persistent daemon that opens one connection to the server and pushes events to the agent as they arrive. The server already has this — the WebSocket at `/ws` and the SSE stream at `/api/mcp/sse` both broadcast `tick`, `command:queued`, `command:result`, `ea:sync`, `risk:updated` events.

Instead of:
```bash
node cli.js buy "Step Index" 0.10 7330 7360 "AI"
node cli.js positions      # poll
node cli.js positions      # poll again
The agent would have:
daemon start                 # opens stream, agent is now subscribed
  → [pushed] tick Step Index 7352.3
  → [pushed] command queued cmd-...
  → [pushed] command executed deal 9709... ticket 9836...
buy "Step Index" 0.10 7330 7360 "AI"   # in-process, same connection
  → [pushed] position opened ticket 9836401092
close 9836401092
  → [pushed] position closed
Architecture
Where it lives
Option A (subprocess): New folder backend/mcp-tool/daemon/ — separate from cli.js. Rationale:
- cli.js is a one-shot command runner. Mixing daemon lifecycle (start/stop/attach) into it would bloat it.
- The daemon has different concerns: connection management, event buffering, command dispatch, log rotation.
- Keeping it separate means the CLI stays simple and the daemon can evolve independently.
Note: mcp-tool is named for its existing contents (cli.js is an MCP client). The daemon is NOT an MCP tool — it communicates via WebSocket + HTTP directly. If the folder is meant for client-side tools generally, consider renaming to backend/tools/ or backend/cli/.
Option B (in-process): backend/services/daemon.ts — same folder as tradeStore.ts, mcpServer.ts, indicatorEngine.ts. Rationale:
- It's a server service, not a client tool. It imports tradeStore directly and runs in-process.
- Consistent with existing pattern: every server-side component lives in backend/services/.
- No new folder to design — it's just another service file, imported by server.ts.
Option C (worker thread): **backend/daemon/** — dedicated top-level folder parallel to services/, routes/, etc. The daemon runs in a Node Worker Thread, communicating via postMessage. It gets Option B's latency with Option A's isolation (crash-safe, cannot corrupt tradeStore). **Status: IMPLEMENTED** (commit 67536fc).
Shared code: event-buffer.ts and commands.ts live in backend/daemon/ and are shared across options. Only the connection layer differs (WebSocket client vs. in-process polling vs. worker thread messaging).
Files
File	Purpose
daemon/index.js	Entry point. Commands: start, stop, status, attach
daemon/connection.js	Persistent WebSocket connection with auto-reconnect
daemon/event-buffer.js	Buffered event log (NDJSON file) for history after disconnect
daemon/commands.js	Friendly command router (buy, sell, close, quote, positions, indicators, candles, strategies, signals, observations) dispatched over the same connection
daemon/README.md	Usage and design notes
Transport choice: WebSocket over SSE
Use WebSocket (ws://127.0.0.1:3000/ws), not SSE. Reasons:
- Bidirectional. WebSocket lets the daemon send commands and receive events over the same socket. SSE is receive-only — you'd still need a separate HTTP POST for commands, which defeats the "one connection" goal.
- Already implemented. websocketServer.ts:8 mounts a WebSocketServer at /ws. It sends an init snapshot on connect (websocketServer.ts:15-21) and broadcasts tick, command:queued, command:result, ea:sync, risk:updated on every state change (websocketServer.ts:44).
- Lower overhead. No per-event HTTP headers. SSE sends a new HTTP response chunk per event; WebSocket sends a frame.
SSE is still useful as a fallback (e.g. behind a proxy that strips WebSocket upgrades), but WebSocket is the primary.
WebSocket server verification (from backend/services/websocketServer.ts, 64 lines total):
- Line 8: setupWebSocketServer(server) mounts WebSocketServer at path /ws
- Lines 15-21: on connect, sends { type: 'init', payload: tradeStore.getState() }
- Lines 55-58: client ping → server replies pong with timestamp
- Lines 60-63: client get_state → server replies with another init snapshot
- Line 44: broadcast({ type, payload }) sends to all connected clients
- Line 48: checks client.readyState === WebSocket.OPEN before sending (skips dead connections)
How it connects
The daemon connects to ws://127.0.0.1:3000/ws (port 3000, same as the web UI). It does not go through MCP — MCP is for AI hosts like Claude Desktop, not for a local agent. The daemon talks directly to the server's WebSocket and HTTP APIs.
Event flow
1. Daemon starts → connects to /ws → server sends init snapshot (full state).
2. Daemon writes the snapshot to the event buffer (NDJSON file) and prints it.
3. Server pushes events (tick, command:queued, command:result, ea:sync, risk:updated, position:opened, position:closed) as they happen.
4. Daemon appends each event to the buffer and prints it.
5. Agent issues a command (buy, close, etc.) → daemon POSTs to the HTTP API (/api/commands, /api/mcp/tools/:name, etc.) over the same process, or directly calls tradeStore if running in-process.
6. The server processes the command and pushes the result back over WebSocket.
7. Daemon prints the result.
Event sources (verified from route files)
- init: websocketServer.ts:16 — sent on WS connect
- tick: mt5Routes.ts:72-83 (POST /tick) and apiRoutes.ts:332 — live tick for a symbol
- ea:sync: mt5Routes.ts:21-55 (POST /sync) — full EA sync, sent on every EA sync (~500ms interval)
- command:queued: apiRoutes.ts:16-42 (POST /commands) — order queued for EA dispatch
- command:result: mt5Routes.ts:58-69 (POST /result) — EA executed a command
- risk:updated: apiRoutes.ts:45-58 (POST /risk) — risk guard config changed
- risk:kill_switch: apiRoutes.ts:61-74 (POST /kill-switch) — kill switch toggled
Running in-process vs. subprocess
Option A — subprocess (simpler): The daemon is a standalone Node process in backend/mcp-tool/daemon/. The agent reads its stdout and NDJSON buffer. Commands are dispatched via HTTP. Pro: simple, no server code changes. Con: per-command HTTP latency, cannot access tradeStore directly, two failure domains to monitor (daemon process + server process).
Option B — in-process (fastest): The daemon lives in backend/services/daemon.ts and runs inside the server process. Commands call tradeStore directly — no HTTP round-trip. Pro: lowest latency, full access to internal state, single process, minimal footprint (1 new file + 1 import line). Con: couples the daemon to the server; requires server code changes; a daemon bug could affect the server.
Option C — worker thread (best of both): The daemon runs in a Node Worker Thread inside the server process. It communicates via postMessage — no HTTP, no shared memory. Pro: Option B's latency with Option A's isolation (crash-safe, cannot corrupt tradeStore). Con: more complex than Option B, requires ~30 lines of server wiring.
Recommendation: Start with Option A (subprocess, HTTP). It's isolated and safe. Add Option C later if you want isolation without sacrificing latency. All options can share the same command router and event buffer — only the connection layer differs.
Event types to subscribe to
From websocketServer.ts and the route broadcasts:
Event	Source	What it means
init	websocketServer.ts:16	Full state snapshot on connect
tick	mt5Routes.ts:32, apiRoutes.ts:332	Live tick for a symbol
ea:sync	mt5Routes.ts:62	Full EA sync (account, positions, ticks)
command:queued	apiRoutes.ts:49	Order queued for EA dispatch
command:result	mt5Routes.ts:76	EA executed a command (success/failure)
risk:updated	apiRoutes.ts:65	Risk guard config changed
risk:kill_switch	apiRoutes.ts:273	Kill switch engaged/disengaged
position:opened	(derived from command:result)	New position opened
position:closed	(derived from command:result)	Position closed
Command dispatch
The daemon reuses the friendly command router from cli.js (lines 149-255) but runs in-process instead of spawning node cli.js for each call. Same commands, same arguments, same JSON output — just persistent.
TO-DO
- Create backend/mcp-tool/daemon/ folder with index.js, connection.js, event-buffer.js, commands.js, README.md
- Implement daemon start — connect to ws://127.0.0.1:3000/ws, print init snapshot, stream events to stdout and NDJSON buffer
- Implement daemon stop — graceful disconnect, close buffer file, remove PID file
- Implement daemon status — is the daemon running? is the connection alive? last event time?
- Implement daemon attach — tail the event buffer (for agents that missed events)
- Implement daemon replay <timestamp> — replay buffered events from a given timestamp
- Reuse the friendly command router from cli.js for in-process dispatch (same JSON-RPC payload format, cli.js:12-142)
- Add auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → 30s cap). Server restart shouldn't kill the daemon.
- Add a --filter flag to subscribe to specific event types or symbols (e.g. daemon start --symbol "Step Index")
- Write events to a configurable NDJSON file (default data/daemon-events.jsonl) so the agent can read history with the Read tool
- Add buffer rotation at 10,000 lines to prevent unbounded growth
- Add a package.json script: "daemon": "node backend/mcp-tool/daemon/index.js"
- Write daemon/README.md with usage examples and troubleshooting
- (Option B only) Create backend/services/daemon.ts — self-contained in-process daemon service
- (Option B only) Wire into server.ts — add one import line after setupWebSocketServer
- (Option C only) Create backend/daemon/daemon.ts — worker manager with message router ✅ DONE (commit 67536fc)
- (Option C only) Create backend/daemon/worker.ts — worker thread script ✅ DONE
- (Option C only) Create backend/daemon/event-buffer.ts — NDJSON event log ✅ DONE
- (Option C only) Create backend/daemon/commands.ts — friendly command router ✅ DONE
- (Option C only) Wire into server.ts — add startDaemon() after setupWebSocketServer ✅ DONE
- (Option C only) Add data/daemon-events.jsonl to .gitignore ✅ DONE
Why this beats the alternatives
- vs. friendly CLI only: The agent stops polling and starts reacting. Being "in sync" means seeing state changes, not just state snapshots.
- vs. MCP config snippet: The agent isn't an MCP host, so a config file does nothing for it. The daemon gives the same benefit — a persistent, event-driven connection — without needing the agent to speak MCP.
- vs. polling REST endpoints: One connection, no per-call overhead, events arrive as they happen.
Success criteria
- Agent runs daemon start and immediately sees the full account state.
- Agent issues buy "Step Index" 0.10 7330 7360 "AI" and sees command:queued then command:result then position:opened as pushed events — no polling.
- Agent sees tick events for tracked symbols in real time.
- Daemon survives a server restart (auto-reconnect, replay buffered events).
- Agent can read event history from the NDJSON buffer after disconnect.