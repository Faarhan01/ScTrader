# Daemon Mode

**Status:** Implemented (Option C worker thread daemon)

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
Option C (worker thread): **backend/daemon/** — dedicated top-level folder parallel to services/, routes/, etc. The daemon runs in a Node Worker Thread, communicating via postMessage. It gets Option B's latency with Option A's isolation (crash-safe, cannot corrupt tradeStore). **Status: IMPLEMENTED** (commit 67536fc).
Files
File	Purpose
daemon/daemon.ts	Worker manager (main thread). Creates worker, forwards events, executes commands against tradeStore, handles restart.
daemon/worker.ts	Worker script (runs inside the worker thread). Receives messages, maintains state mirror, dispatches commands via postMessage.
daemon/event-buffer.ts	NDJSON event log. Same as Option A — append/read/rotate.
daemon/commands.ts	Friendly command router. Same as Option A — 18 commands, read from mirror, mutate via postMessage to main thread.
daemon/README.md	Usage, architecture, troubleshooting.
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
1. Daemon start → main thread starts worker, sends init snapshot (full state).
2. Main thread subscribes to tradeStore.events and forwards every event to the worker.
3. Worker maintains its own state mirror (fed by main thread instead of WebSocket).
4. Worker sends command messages for mutating operations.
5. Main thread executes them against tradeStore (validated against risk guard) and sends back result.
6. If the worker crashes, worker.on('exit') fires — main thread restarts it with exponential backoff (1s, 2s, 4s, up to 30s cap).
7. Daemon appends each event to the buffer (data/daemon-events.jsonl) and prints it.

Event sources (verified from route files)
- init: websocketServer.ts:16 — sent on WS connect
- tick: mt5Routes.ts:72-83 (POST /tick) and apiRoutes.ts:332 — live tick for a symbol
- ea:sync: mt5Routes.ts:21-55 (POST /sync) — full EA sync, sent on every EA sync (~500ms interval)
- command:queued: apiRoutes.ts:16-42 (POST /commands) — order queued for EA dispatch
- command:result: mt5Routes.ts:58-69 (POST /result) — EA executed a command
- risk:updated: apiRoutes.ts:45-58 (POST /risk) — risk guard config changed
- risk:kill_switch: apiRoutes.ts:61-74 (POST /kill-switch) — kill switch toggled
- position:opened/closed: derived from command:result by worker.ts

Command dispatch
The daemon reuses the friendly command router from cli.js (lines 149-255) but runs in the worker thread instead of spawning node cli.js for each call. Same commands, same arguments, same JSON output — just persistent.

TO-DO
All implementation tasks for Option C worker thread daemon are complete:
- Created backend/daemon/daemon.ts — worker manager with message router ✅ DONE (commit 67536fc)
- Created backend/daemon/worker.ts — worker thread script ✅ DONE
- Created backend/daemon/event-buffer.ts — NDJSON event log ✅ DONE
- Created backend/daemon/commands.ts — friendly command router ✅ DONE
- Wired into server.ts — added startDaemon() after setupWebSocketServer ✅ DONE
- Added data/daemon-events.jsonl to .gitignore ✅ DONE
- Tested end-to-end — verified live against Deriv demo: buy queued and executed (ticket 9836565240), 377 events buffered, EA connected with 27 symbols streaming ✅
- Verified that a worker crash does not affect the server ✅
- Verified that a worker crash triggers auto-restart within 1-2 seconds ✅

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