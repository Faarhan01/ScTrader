# Option A — Subprocess Daemon (isolated, no server changes)

## What it is

A standalone Node process in `backend/mcp-tool/daemon/` that connects to
`ws://127.0.0.1:3000/ws` and streams events to stdout plus an NDJSON buffer
file. Commands are dispatched via HTTP POST to `/api/commands`,
`/api/mcp/tools/:name`, etc.

## Why this option

- Isolated from the server — no server code changes required
- Safe — a daemon bug cannot affect the bridge
- Works regardless of server internals
- Uses the WebSocket and HTTP APIs that already exist

## Cons

- Per-command HTTP latency (a few ms) for mutating commands only
- Cannot access `tradeStore` directly
- Two failure domains to monitor (daemon process + server process)

## Performance optimizations (zero server changes)

These reduce or eliminate HTTP round-trips without touching the server.

### 1. Serve read commands from in-memory state (biggest win)

The daemon already receives the full `init` snapshot plus pushed `ea:sync`/`tick`
events over the WebSocket. It doesn't need HTTP for reads — all that state is
already in memory. Only *mutating* commands need HTTP.

| Category                | Commands                                                                                                                                | Source of truth                                                 |
| :---------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- |
| **In-memory (no HTTP)** | `status`, `positions`, `orders`, `quote`, `ticks`, `candles`, `indicators`, `strategies`, `signals`, `backtest`, `observations`, `list` | WebSocket events (`init`, `ea:sync`, `tick`)                    |
| **HTTP only**           | `buy`, `sell`, `close`, `cancel`, `prune`, `risk`, `kill-switch`                                                                        | `POST /api/commands`, `POST /api/risk`, `POST /api/kill-switch` |

This removes ~14 of 18 commands from the HTTP path entirely. The daemon maintains
a local mirror of `tradeStore.getState()` updated on every WebSocket event, and
read commands query the mirror — zero latency, zero server round-trip.

**Implementation:** `commands.js` keeps a `stateMirror` object. On each incoming
WebSocket event (`init`, `ea:sync`, `tick`), it merges the payload into the mirror.
Read commands return slices of the mirror. Mutating commands still POST to HTTP.

### 2. HTTP keep-alive + connection pooling

Node's `http.Agent` with `keepAlive: true` reuses the TCP connection across
commands instead of a new TLS/TCP handshake per call. Client-side only, zero
server changes.

```js
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
// All HTTP requests use this agent
```

### 3. Command batching (optional, needs new server endpoint)

A `POST /api/commands/batch` that enqueues multiple commands in one request.
Useful if the agent fires several orders rapidly. Requires a small server change
(~10 lines in `apiRoutes.ts`) but eliminates N round-trips for N commands.

### Optional: push commands over WebSocket (small server change)

`websocketServer.ts` currently only handles `ping`/`get_state` (lines 54-63).
Adding command handling — the daemon sends
`{ type: 'command', payload: { action, symbol, ... } }`, the server executes via
`tradeStore.enqueueCommand()` and broadcasts the result — makes Option A's
command latency match Option B. The server change is ~10 lines in
`handleClientMessage`. This closes the gap with Option B entirely while keeping
the daemon as a separate process.

## Separate Folder: `backend/mcp-tool/daemon/`

The daemon lives in its own folder under `backend/mcp-tool/`, sibling to `cli.js`.
This is deliberate — the two tools have different lifecycle concerns and different
consumers:

| Concern | `cli.js` | `daemon/` |
| :--- | :--- | :--- |
| Lifecycle | One-shot: run, print, exit | Persistent: start, stream, stop |
| State | Stateless across invocations | Maintains connection, buffer, filters |
| Input | Command-line args (`process.argv`) | Subcommands + flags (`daemon start --filter ...`) |
| Output | Single JSON object to stdout | Continuous stream: stdout + NDJSON file |
| Failure mode | Exit non-zero on error | Must survive, auto-reconnect, log to buffer |
| Consumer | Humans typing `node cli.js buy ...` | AI agents that need to be "in sync" |

**Why not put it in `cli.js`?**
- `cli.js` is 286 lines and already handles 18 commands. Adding daemon lifecycle
  (start/stop/status/attach/replay), WebSocket management, event buffering, and
  auto-reconnect would bloat it past 500 lines and mix two distinct concerns.
- The daemon needs `ws` (WebSocket client), file I/O for the NDJSON buffer, and
  process-management logic (PID file, graceful shutdown). `cli.js` is a pure
  command router — it does not import `ws` and has no file writes.
- Keeping them separate means the CLI stays simple and the daemon can evolve
  independently (e.g. add a `--daemon` flag to the CLI later that spawns the
  daemon process, without changing the CLI's core).

**Folder naming note:** `mcp-tool` is named for its existing contents (`cli.js`
is an MCP client speaking JSON-RPC to `/api/mcp`). The daemon is NOT an MCP tool —
it communicates via WebSocket + HTTP directly. If the folder is meant for
client-side tools generally, consider renaming to `backend/tools/` or
`backend/cli/`. This is cosmetic and doesn't affect the daemon's design.

**Why `backend/mcp-tool/` and not `backend/` directly?**
- `backend/mcp-tool/` already contains `cli.js` — the friendly command runner.
  The daemon is a sibling tool with the same audience (AI agents, power users).
- `backend/mcp-tool/` is the designated folder for "tools that talk to the bridge"
  but are not part of the server runtime. The daemon fits this perfectly.
- It keeps the server tree (`backend/services/`, `backend/routes/`, `backend/database/`)
  clean — no daemon code leaks into the runtime.

**Folder structure to create:**
```
backend/mcp-tool/daemon/
├── index.js          # Entry point — parses subcommands, dispatches to modules
├── connection.js     # WebSocket client with auto-reconnect + exponential backoff
├── event-buffer.js   # NDJSON append/read for event history
├── commands.js       # Friendly command router (in-memory reads + HTTP writes)
├── README.md         # Usage, architecture, troubleshooting
└── package.json      # Optional: declares "daemon" as a self-contained module
```

**Dependencies already available (no new `npm install` needed):**
- `ws` ^8.22.0 — already a dependency (`package.json:26`), imported by `websocketServer.ts:1`
- Node.js built-ins: `fs`, `path`, `http`, `process`, `crypto` — all available
- `tsx` is not needed — the daemon is plain `.js` (ESM via `"type": "module"` in `package.json:5`)

**`package.json` script to add:**
```json
"daemon": "node backend/mcp-tool/daemon/index.js"
```
This mirrors the existing `cli.js` invocation pattern (`node backend/mcp-tool/cli.js`).

## Verified server APIs the daemon can use

### WebSocket — `ws://127.0.0.1:3000/ws`

From `backend/services/websocketServer.ts` (verified, 64 lines total):
- setupWebSocketServer(server) at line 8 mounts a WebSocketServer at path /ws.
The server is created in server.ts:44 (http.createServer(app)) and the WS server
is attached at server.ts:47 (setupWebSocketServer(server)).
- On connect the server sends an init event with the full tradeStore.getState()
snapshot (lines 15-21). This is the daemon's first data — it gets account,
positions, ticks, chart history, indicators, command queue, risk guard, and logs
in one message, before it sends any command.
- Client messages: ping (returns pong with timestamp, lines 55-58) and
get_state (returns another init snapshot, lines 60-63). The daemon can use
get_state to re-sync after a reconnect without re-issuing commands.
- broadcast({ type, payload }) at line 44 sends to all connected clients.
It checks client.readyState === WebSocket.OPEN before sending (line 48),
so a dying connection is skipped silently. The daemon should handle on('close')
and trigger auto-reconnect.
- The WS server is mounted on port 3000 (the main server, server.ts:64), not
port 7777 (the MT5-only listener). The daemon connects to 3000.
**Daemon connection flow (verified):**
1. Daemon opens `ws://127.0.0.1:3000/ws`
2. Server immediately sends `{ type: 'init', payload: <full state> }`
3. Daemon writes the snapshot to the NDJSON buffer, prints it, and seeds the in-memory state mirror
4. Server pushes events via `broadcast()` as they happen
5. Daemon appends each event to the buffer, prints it, and merges it into the state mirror

**WebSocket message format (verified from source):**
```json
{ "type": "init", "payload": { /* tradeStore.getState() */ } }
{ "type": "ping" }  // client → server
{ "type": "pong", "timestamp": 1698123456789 }  // server → client
{ "type": "get_state" }  // client → server
{ "type": "ea:sync", "payload": { /* account, positions, ticks, ... */ } }
{ "type": "tick", "payload": { /* single tick */ } }
{ "type": "command:queued", "payload": { /* command object */ } }
{ "type": "command:result", "payload": { /* execution result */ } }
{ "type": "risk:updated", "payload": { /* risk guard */ } }
{ "type": "risk:kill_switch", "payload": { /* { active: bool } */ } }
```

### HTTP endpoints the daemon can call

From `backend/routes/apiRoutes.ts` (verified, 663 lines total). The daemon uses
these only for mutating commands — reads are served from the in-memory mirror.

| Endpoint | Method | Purpose | Line |
| :--- | :--- | :--- | :--- |
| `/api/commands` | POST | Enqueue an order (BUY/SELL) | 16 |
| `/api/risk` | POST | Update risk guard config | 45 |
| `/api/kill-switch` | POST | Toggle emergency kill switch | 61 |
| `/api/database/prune` | POST | Prune stale data | 213 |
| `/api/candles/simulate` | POST | Seed synthetic candles | 264 |
| `/api/candles/request` | POST | Request EA pull historical bars | 286 |

**Note:** `/api/commands` (line 16) only handles `action`/`symbol`/`orderType`/
`volume`/`sl`/`tp`/`ticket`/`magic`/`comment`/`source`. For any other mutating
operations, the daemon POSTs to `/api/mcp/tools/:name` with the JSON-RPC payload
from `cli.js:12-142`.

**Command dispatch path (verified from `cli.js:12-142`):**
- `cli.js` defines `BRIDGE_URL = new URL('http://127.0.0.1:3000/api/mcp')`
- `callTool(name, args)` POSTs `{ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }` to `BRIDGE_URL`
- The daemon's `commands.js` reuses this exact payload format for mutating commands,
  and serves read commands from the state mirror instead.

### Broadcast events the daemon will receive

From `websocketServer.ts:44` and the route-level `broadcast()` calls.
Verified sources for each event:

| Event | Source | What it means |
| :--- | :--- | :--- |
| `init` | `websocketServer.ts:16` | Full state snapshot on connect. Sent once per WS connection. Seeds the state mirror. |
| `ping` / `pong` | `websocketServer.ts:55-58` | Keep-alive. Daemon sends `ping`, server replies `pong` with `timestamp`. |
| `get_state` | `websocketServer.ts:60-63` | Client-requested re-sync. Returns another `init` snapshot. |
| `tick` | `mt5Routes.ts:72-83` (POST `/tick`) and `apiRoutes.ts:332` | Live tick for a symbol. Payload is `{ symbol, bid, ask, spread, time }`. Merged into mirror. |
| `ea:sync` | `mt5Routes.ts:21-55` (POST `/sync`) | Full EA sync — account, positions, ticks, currentChart, allSymbols, chartHistory, connection status. Sent on every EA sync (typically every 500ms). Merged into mirror. |
| `command:queued` | `apiRoutes.ts:16-42` (POST `/commands`) | Order queued for EA dispatch. Payload is the command object from `tradeStore.getState().commandQueue[0]`. |
| `command:result` | `mt5Routes.ts:58-69` (POST `/result`) | EA executed a command (success/failure). Payload includes `commandId`, `dealTicket`, `ticket`, `executionPrice`, `errorCode`. |
| `risk:updated` | `apiRoutes.ts:45-58` (POST `/risk`) | Risk guard config changed. Payload is the full `riskGuard` object. Merged into mirror. |
| `risk:kill_switch` | `apiRoutes.ts:61-74` (POST `/kill-switch`) | Kill switch engaged/disengaged. Payload is `{ active: boolean }`. Merged into mirror. |
Events the daemon derives (not pushed by server):
- position:opened — derived from command:result when dealTicket is present and a new position appears in positions
- position:closed — derived from command:result when a position disappears from positions
The daemon tracks the positions array from the last init or ea:sync and diffs it
against the next ea:sync to detect opens/closes. Alternatively, it can infer from
command:result payloads: a BUY/SELL result with a ticket means a position opened;
a CLOSE result means it closed.
### Files to create

| File | Purpose |
| :--- | :--- |
| `daemon/index.js` | Entry point. Commands: `start`, `stop`, `status`, `attach`, `replay`. Parses `process.argv`, loads modules, manages PID file for `stop`/`status`. |
| `daemon/connection.js` | WebSocket client with auto-reconnect (exponential backoff). Exports `connect(url, onEvent)` and `disconnect()`. Tracks `readyState`, reconnect count, last event time. |
| `daemon/event-buffer.js` | NDJSON append/read for event history. Exports `append(event)`, `read(sinceTimestamp, limit)`, `rotate(maxSize)`. Each line is `{ ts, type, payload }`. |
| `daemon/commands.js` | Friendly command router (`buy`, `sell`, `close`, `cancel`, `quote`, `positions`, `orders`, `status`, `indicators`, `candles`, `strategies`, `signals`, `exec-signal`, `backtest`, `observations`, `prune`, `list`). Read commands query the in-memory state mirror; mutating commands POST to HTTP. |
| `daemon/README.md` | Usage and design notes. Covers `start`, `stop`, `status`, `attach`, `replay`, `--filter`, `--buffer`. |

**Detailed file responsibilities:**

### `daemon/index.js` — Entry point
- Parses process.argv to extract the subcommand (start/stop/status/attach/replay)
and flags (--port, --buffer, --filter, --symbol, --pid)
- start: writes a PID file (default data/daemon.pid) so stop and status can
find the process, then loads connection.js, event-buffer.js, and commands.js,
connects to the WebSocket, and streams events to stdout + buffer
- stop: reads the PID file, sends a graceful shutdown signal (SIGTERM, then SIGKILL
after 5s), closes the buffer file
- status: checks if the PID file exists, if the process is alive, if the WebSocket
readyState is OPEN, and reports the last event timestamp
- attach: reads the NDJSON buffer file and tails it (like tail -f) for agents that
missed events while the daemon was down
- replay: reads the buffer and replays events from a given timestamp or offset
- Exits with code 0 on success, 1 on error (e.g. server not running, connection refused)

### `daemon/connection.js` — WebSocket client
- Uses the `ws` package (already a dependency at `package.json:26`)
- `connect(url, onEvent)`:
  - Creates a `new WebSocket(url)`
  - On `open`: sends a `ping` to verify the server is responsive
  - On `message`: parses JSON, calls `onEvent(event)`, appends to the event buffer
  - On `close`: schedules a reconnect with exponential backoff (1s, 2s, 4s, 8s, up to
    30s cap). Logs the reconnect attempt to stderr.
  - On `error`: logs to stderr, does not crash (the `close` handler will trigger reconnect)
- `disconnect()`: closes the WebSocket cleanly (code 1000, normal closure), stops reconnect
- Exposes `isConnected()` and `getLastEventTime()` for `status` command
- Auto-reconnect is critical: the server may restart (e.g. `npm run dev` reboots during
  development), and the daemon should survive it and re-sync via the next `init` event.

### `daemon/event-buffer.js` — NDJSON event log
- Each line is one JSON object: `{ "ts": 1698123456789, "type": "tick", "payload": {...} }`
- `append(event)`: writes one line to the buffer file (default `data/daemon-events.jsonl`).
  Uses `fs.appendFileSync` for simplicity — the daemon is a single-threaded process,
  so there's no race condition. Flushes after each write so agents reading the file
  with the Read tool see complete lines.
- `read(sinceTs, limit)`: reads the buffer file, filters events with `ts > sinceTs`,
  returns up to `limit` events. Used by `replay` and `attach`.
- `rotate(maxLines)`: if the buffer exceeds `maxLines`, truncates to the last `maxLines`
  lines. Prevents the event log from growing unbounded. Default max: 10,000 lines.
- The buffer file is in `data/` (same as `mt5_bridge.sqlite`), which is gitignored
  (per the project's `.gitignore`). It is runtime data, not source.

### `daemon/commands.js` — Friendly command router
- Reuses the same command set as `cli.js:149-255` (verified: 18 commands)
- Maintains a `stateMirror` object, seeded from the `init` event and merged on every
  subsequent WebSocket event (`ea:sync`, `tick`, `risk:updated`, `risk:kill_switch`)
- Read commands (`status`, `positions`, `orders`, `quote`, `indicators`, `candles`,
  `strategies`, `signals`, `backtest`, `observations`, `list`): return slices of the
  state mirror. Zero HTTP, zero latency. Output matches `cli.js` exactly because the
  mirror mirrors `tradeStore.getState()`.
- Mutating commands (`buy`, `sell`, `close`, `cancel`, `prune`): POST to the
  appropriate HTTP endpoint using the exact JSON-RPC payload format from `cli.js:12-142`.
- For `buy`/`sell`/`close`/`cancel`: uses `/api/commands` (POST) for lower latency, since
  these are order actions and the REST endpoint is purpose-built for them
  (`apiRoutes.ts:16`).
- Returns the same JSON output as `cli.js` — so the daemon is a drop-in replacement
  for the CLI, just persistent.

**Command → tool mapping (verified from `cli.js:149-255`):**

| Daemon command | Source | HTTP path (if mutating) | Notes |
| :--- | :--- | :--- | :--- |
| `status` | Mirror | — | Aggregates account + currentChart from mirror |
| `quote <sym>` | Mirror | — | Latest tick from mirror |
| `positions [sym]` | Mirror | — | Optional symbol filter on `mirror.positions` |
| `orders [sym]` | Mirror | — | Optional symbol filter on `mirror.pendingOrders` |
| `buy <sym> <lots> [sl] [tp] [comment]` | HTTP | `/api/commands` | Symbol preserved — case-sensitive on Deriv |
| `sell <sym> <lots> [sl] [tp] [comment]` | HTTP | `/api/commands` | Same as buy, orderType SELL |
| `close <ticket> [lots]` | HTTP | `/api/mcp/tools/mt5_close_position` | Partial close supported |
| `cancel <ticket>` | HTTP | `/api/mcp/tools/mt5_cancel_pending_order` | |
| `indicators <sym> [tf]` | Mirror | — | Latest indicators from mirror |
| `candles <sym> [tf] [limit]` | Mirror | — | Latest chartHistory from mirror |
| `strategies [sym]` | Mirror | — | (Not in `getState()` — falls back to HTTP if not in mirror) |
| `signals [id]` | HTTP | `/api/mcp/tools/mt5_evaluate_strategy_signals` | Needs live computation |
| `exec-signal <id> [vol]` | HTTP | `/api/mcp/tools/mt5_execute_strategy_signal` | Mutating |
| `backtest <id> [limit] [deposit]` | HTTP | `/api/mcp/tools/mt5_backtest_strategy` | Needs live computation |
| `observations [cat]` | HTTP | `/api/mcp/tools/mt5_list_observations` | (Not in `getState()` — always HTTP) |
| `prune` | HTTP | `/api/database/prune` | Not an MCP tool — direct HTTP |
| `list` | Mirror | — | Tool list cached from first `tools/list` call |

**Note on strategies/observations/backtest:** These are not part of
`tradeStore.getState()` (verified at `tradeStore.ts:534-552`). They live in SQLite
and are served by MCP tools. The daemon must call HTTP for these. Consider adding
them to the `init` payload in a future server change if they're needed frequently.

## Changes needed
- None to the server. The daemon uses the existing /ws WebSocket and existing HTTP endpoints.
No Express route changes, no tradeStore changes, no server.ts changes.
- ws is already a dependency (package.json:26, websocketServer.ts:1 imports it).
The daemon uses the same ws package as a client (the server uses it as a
server — both sides are covered by the one dependency).
- Add a package.json script: "daemon": "node backend/mcp-tool/daemon/index.js".
This mirrors the existing cli.js pattern (node backend/mcp-tool/cli.js).
- The data/ directory must exist for the PID file and NDJSON buffer. It already
exists (contains mt5_bridge.sqlite). If not, index.js should create it on start.
- No TypeScript changes needed — the daemon is plain JavaScript (ESM, matching
"type": "module" in package.json:5). The project uses tsx for the server
(server.ts), but the daemon is a standalone Node process and does not need `tsx`.

## Command dispatch

The daemon does NOT spawn `cli.js` as a subprocess. It has its own `commands.js`
module that reuses the same command set and output format as `cli.js:149-255`,
but runs in-process within the daemon. Same commands, same arguments, same JSON
output — just persistent.

**Why not spawn `cli.js` as a subprocess?**
- Spawning `node cli.js buy ...` for each command is what the current CLI does —
  it's a one-shot process. The daemon's whole point is to avoid that overhead.
- In-process dispatch means the daemon can correlate commands with events in the
  same process. For example, after sending `buy`, the daemon can immediately watch
  for `command:queued` and `command:result` events on the WebSocket without any
  timing coordination.
- The `commands.js` module imports the same `callTool` logic from `cli.js:12-142`
  (or duplicates it exactly) so the output format is identical.

## TO-DO

### Implementation sequence (recommended order)

1. **Create the folder and stub files.** `backend/mcp-tool/daemon/` with empty
   `index.js`, `connection.js`, `event-buffer.js`, `commands.js`, `README.md`.
   Each file should export a minimal function so `index.js` can import them.

2. **Implement `event-buffer.js` first.** It has no dependencies on the server.
   Test it in isolation: write 3 events, read them back, rotate. This is the
   foundation for everything else.

3. **Implement the state mirror in `commands.js`.** Seed it from a mock `init`
   event, merge mock `ea:sync`/`tick` events, and verify read commands return
   correct slices. This is the key optimization — get it right before connecting
   to the real server.

4. **Implement `connection.js`.** Connect to `ws://127.0.0.1:3000/ws`, verify you
   receive the `init` event, send a `ping`, receive `pong`. Test auto-reconnect
   by killing the server (`npm run dev` stops) and restarting it — the daemon
   should reconnect and get a fresh `init`.

5. **Wire `connection.js` to `commands.js`.** Verify that WebSocket events update
   the state mirror and read commands return live data.

6. **Implement mutating commands in `commands.js`.** Start with `buy`, `sell`,
   `close`. Verify the output matches `cli.js` exactly. Then add `cancel`, `prune`.

7. **Implement `index.js`.** Wire the subcommands (`start`, `stop`, `status`,
   `attach`, `replay`) to the modules. Add PID file management.

8. **Add flags.** `--port` (default 3000), `--buffer` (default `data/daemon-events.jsonl`),
   `--pid` (default `data/daemon.pid`), `--filter` (event type or symbol).

9. **Test end-to-end.** See "Success criteria" below.

### Detailed task list

- [ ] Create `backend/mcp-tool/daemon/` folder with `index.js`, `connection.js`, `event-buffer.js`, `commands.js`, `README.md`
- [ ] Implement `daemon start` — connect to `ws://127.0.0.1:3000/ws`, print `init` snapshot, stream events to stdout and NDJSON buffer
- [ ] Implement `daemon stop` — graceful disconnect, close buffer file, remove PID file
- [ ] Implement `daemon status` — is the daemon running? is the connection alive? last event time?
- [ ] Implement `daemon attach` — tail the event buffer (for agents that missed events)
- [ ] Implement `daemon replay <timestamp>` — replay buffered events from a given timestamp
- [ ] Implement state mirror in `commands.js` — seeded from `init`, merged on every WebSocket event
- [ ] Serve read commands (`status`, `positions`, `orders`, `quote`, `indicators`, `candles`) from the state mirror (no HTTP)
- [ ] Dispatch mutating commands (`buy`, `sell`, `close`, `cancel`, `prune`) via HTTP using the `cli.js:12-142` JSON-RPC payload format
- [ ] Add HTTP keep-alive agent (`http.Agent({ keepAlive: true })`) for mutating command HTTP calls
- [ ] Add auto-reconnect with exponential backoff (1s → 2s → 4s → 8s → 30s cap). Server restart should not kill the daemon.
- [ ] Add a `--filter` flag to subscribe to specific event types or symbols (e.g. `daemon start --symbol "Step Index"`)
- [ ] Write events to a configurable NDJSON file (default `data/daemon-events.jsonl`) so the agent can read history with the Read tool
- [ ] Add buffer rotation at 10,000 lines to prevent unbounded growth
- [ ] Add a `package.json` script: `"daemon": "node backend/mcp-tool/daemon/index.js"`
- [ ] Write `daemon/README.md` with usage examples and troubleshooting

## Success criteria

- Agent runs `daemon start` and immediately sees the full account state
  (from the `init` event — no polling needed).
- Agent issues `buy "Step Index" 0.10 7330 7360 "AI"` and sees `command:queued`
  then `command:result` then `position:opened` as pushed events — no polling.
- Agent sees `tick` events for tracked symbols in real time (sub-second latency).
- Read commands (`status`, `positions`, `quote`) return instantly from the state mirror — no HTTP round-trip.
- Daemon survives a server restart (auto-reconnect, replay buffered events).
- Agent can read event history from the NDJSON buffer after disconnect
  (using `daemon attach` or the Read tool on `data/daemon-events.jsonl`).
- `daemon status` reports accurate connection state and last event time.
- The daemon process is stoppable with `daemon stop` and restartable with
  `daemon start` — no zombie processes, no leftover PID files.