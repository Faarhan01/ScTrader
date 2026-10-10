# Option B — In-Process Daemon (fastest, needs server changes)

## What it is

The daemon runs inside the server process. It imports `tradeStore` directly,
so commands call it in-process with zero HTTP round-trip.

## Minimal footprint: 2 file changes

The full Option B is described below, but the **minimal viable Option B** is:

1. **Create `backend/services/daemon.ts`** — one self-contained service file.
   It imports `tradeStore` directly, polls `getState()` on a 250ms timer to
   detect changes (no `broadcast()` subscription needed), and dispatches
   commands via `tradeStore.enqueueCommand()`. Exports `start()` and `stop()`.

2. **Add one line to `server.ts`**: `import { startDaemon } from './services/daemon.js'; startDaemon();`

That's it. No route file, no WebSocket changes, no `tradeStore` changes,
no `package.json` script. The daemon is self-contained in one service file,
wired in with one import.

**Why polling works:** The EA sync itself runs at ~500ms (`mt5Routes.ts:21`).
Polling `tradeStore.getState()` at 250ms catches every state change with negligible
overhead. The daemon diffs the serialized state and emits derived events
(`position:opened`, `position:closed`, `tick`, etc.) when fields change.
This is simpler than hooking `broadcast()` and requires zero changes to existing files.

**If you want true push events later:** Add an `EventEmitter` to `tradeStore.ts`
(1 file change) and have the daemon subscribe to it instead of polling.
But polling is the pragmatic starting point.

## Where the code lives: `backend/services/` not `backend/mcp-tool/`

**The daemon is NOT an MCP tool.** It communicates via WebSocket + HTTP directly.
`backend/mcp-tool/` holds `cli.js`, which IS an MCP client (JSON-RPC to `/api/mcp`),
but the daemon's primary channel is the WebSocket at `/ws`.

For Option B (in-process), the natural home is **`backend/services/`** — the same
folder as `tradeStore.ts`, `mcpServer.ts`, `indicatorEngine.ts`. It's a server
service, not a client tool. This means:

- No new top-level folder needed
- Consistent with existing service pattern (singleton, imported by `server.ts`)
- The daemon can import `tradeStore`, `broadcast`, and other services directly
- No confusion about whether it's an MCP tool

For Option A (subprocess), the daemon is a standalone Node process and could live
in `backend/daemon/` or stay in `backend/mcp-tool/daemon/` as a sibling to `cli.js`.
But `mcp-tool` is a misleading name for a non-MCP tool — consider renaming to
`backend/tools/` or `backend/cli/` if the folder is meant for client-side tools generally.

## How it integrates with the server

The server entry point is `server.ts` (99 lines, verified). Currently:

- `server.ts:19` — `async function startServer()` creates the Express app
- `server.ts:44` — `http.createServer(app)` creates the HTTP server
- `server.ts:47` — `setupWebSocketServer(server)` attaches the WebSocket server
- `server.ts:64` — `server.listen(PORT, '0.0.0.0')` starts listening on port 3000
- `server.ts:68-93` — a second HTTP server on port 7777 for MT5 EA direct access

**Integration point:** The daemon module is imported and started inside
`startServer()`, after `setupWebSocketServer(server)` (so `broadcast()` is available)
but before `server.listen()` (so the daemon is ready before connections arrive).

**Minimal wiring (1 line in `server.ts`):**
```ts
// server.ts — add after setupWebSocketServer (line 47)
import { startDaemon } from './services/daemon.js';
startDaemon();
Alternative integration point: A new Express route backend/routes/daemon.ts
with endpoints /api/daemon/start, /api/daemon/stop, /api/daemon/events.
This lets an agent start/stop the daemon via HTTP without restarting the server.
The route would import the daemon module and call its start/stop functions.
File to create
backend/services/daemon.ts — The entire daemon — singleton service, self-contained.
Optional additions (not required for minimal Option B):
- backend/routes/daemon.ts — Express route for HTTP control (/api/daemon/*)
if you want agents to start/stop the daemon without shell access
What daemon.ts does differently from Option A's WebSocket client
Instead of:
// Option A: WebSocket client
const ws = new WebSocket('ws://127.0.0.1:3000/ws');
ws.on('message', (event) => onEvent(JSON.parse(event)));
ws.on('close', () => reconnect());
Option B does:
// Option B: In-process polling (minimal approach)
import { tradeStore } from './tradeStore.js';

let lastState: any = null;

async function poll() {
  const state = tradeStore.getState();
  const serialized = JSON.stringify(state);
  if (serialized !== lastState) {
    // Diff and emit derived events
    if (lastState) {
      // Detect position opened/closed, tick changes, etc.
    }
    lastState = serialized;
  }
}

setInterval(poll, 250); // EA sync runs at ~500ms, so 250ms is sufficient
Key difference: Option B's daemon.ts does not open a socket. It:
1. Calls tradeStore.getState() directly for the initial snapshot (no init event needed)
2. Polls at 250ms to detect state changes (no broadcast() subscription needed)
3. Dispatches commands by calling tradeStore.enqueueCommand() directly (no HTTP POST)
If you want true push events later: Replace polling with an EventEmitter
in tradeStore.ts (1 file change). The daemon subscribes to it instead of polling.
But polling is simpler and requires zero changes to existing files.
Changes needed
Minimal (2 file changes)
1. backend/services/daemon.ts — new file (the entire daemon)
Create this file. It's self-contained — no imports from other new files.
Exports start() and stop().
2. server.ts — add one import line
// server.ts — add after setupWebSocketServer (line 47)
import { startDaemon } from './services/daemon.js';
startDaemon();
That's it. No route file, no WebSocket changes, no tradeStore changes,
no package.json script. The daemon starts when the server starts.
Optional additions
3. websocketServer.ts — no changes needed (for minimal Option B)
The existing broadcast() function (websocketServer.ts:44) already sends to all
WebSocket clients. The minimal daemon polls tradeStore.getState() instead of
subscribing to broadcast(). No changes required.
If you want the daemon to receive push events, you can later add an
EventEmitter to tradeStore.ts and have the daemon subscribe to it — but
polling at 250ms is functionally equivalent since the EA sync itself runs at ~500ms.
4. tradeStore.ts — no changes needed (for minimal Option B)
tradeStore.getState() (tradeStore.ts:534-552) already returns everything the
daemon needs: eaConnected, account, positions, ticks, tickHistory,
chartHistory, indicators, pendingOrders, marketDepth, commandQueue,
riskGuard, logs. No changes needed.
5. backend/routes/daemon.ts — new file (optional)
If you want HTTP control of the daemon (start/stop/status without shell access),
create this route. It's a thin wrapper around the daemon module:
import { Router } from 'express';
import { daemon } from '../services/daemon.js';

export const daemonRouter = Router();

daemonRouter.get('/status', (req, res) => {
  res.json(daemon.getStatus());
});

daemonRouter.post('/start', (req, res) => {
  daemon.start();
  res.json({ status: 'started' });
});

daemonRouter.post('/stop', (req, res) => {
  daemon.stop();
  res.json({ status: 'stopped' });
});
Then mount it in server.ts:42: app.use('/api/daemon', daemonRouter);
6. package.json — no script needed
Option B runs inside the server process, so there's no separate npm run daemon
script. The daemon starts when the server starts. This is actually a pro —
one process, one startup, no coordination needed.
Pros
- Lowest latency — commands call tradeStore directly, no HTTP round-trip
- Full access to internal state — getState(), enqueueCommand(), getRiskGuard(),
updateTick(), etc. are all available
- Single process — no coordination between daemon and server, no PID file, no
auto-reconnect needed (the daemon dies when the server dies, which is correct)
- No new dependencies — uses tradeStore, broadcast, and Express, all already in use
- Minimal footprint — 1 new file + 1 import line in server.ts
Cons
- Couples the daemon to the server — a daemon bug can crash the bridge
- Requires server code changes (at minimum server.ts, plus optionally daemon.ts)
- Harder to develop/debug — you can't run the daemon standalone; you must start
the full server (npm run dev) to test it
- If the server crashes, the daemon crashes with it — no isolation
- TradeStore is a singleton (tradeStore.ts:650 — export const tradeStore = new TradeStore()).
The daemon shares this singleton with the server, so any state the daemon sets
is visible to the server and vice versa. This is usually desirable but means
the daemon must be careful not to corrupt state.
TO-DO
Implementation sequence
1. Create backend/services/daemon.ts. Self-contained service file.
Imports tradeStore, polls getState() at 250ms, dispatches commands directly.
Exports start() and stop().
2. Wire into server.ts. Add import { startDaemon } from './services/daemon.js';
after setupWebSocketServer(server) (line 47).
3. Test end-to-end. Start the server with npm run dev, verify the daemon
polls state and dispatches commands correctly.
4. (Optional) Add Express route. Create backend/routes/daemon.ts for HTTP control.
5. (Optional) Switch to push events. Add EventEmitter to tradeStore.ts,
have the daemon subscribe instead of polling.
Detailed task list
- Create backend/services/daemon.ts — self-contained daemon service
- Implement daemon start — poll tradeStore.getState(), print snapshot, stream derived events to stdout and NDJSON buffer
- Implement daemon stop — clear poll interval, close buffer file
- Implement daemon status — is the daemon running? last event time?
- Implement command dispatch via direct tradeStore calls (no HTTP)
- Wire into server.ts — add one import line after setupWebSocketServer
- Write events to a configurable NDJSON file (default data/daemon-events.jsonl)
- Add buffer rotation at 10,000 lines
- (Optional) Create backend/routes/daemon.ts with /api/daemon/status, /api/daemon/start, /api/daemon/stop
- (Optional) Mount daemonRouter in server.ts (app.use('/api/daemon', daemonRouter))
- Test that a daemon bug does not corrupt tradeStore state
Success criteria
- Agent runs daemon start (server starts) and immediately sees the full account state.
- Agent issues buy "Step Index" 0.10 7330 7360 "AI" and sees command:queued
then command:result then position:opened as derived events — no polling.
- Agent sees tick events for tracked symbols in real time (sub-second latency via polling).
- Daemon survives server restart (it dies with the server — which is correct for in-process).
- Agent can read event history from the NDJSON buffer after disconnect.
- daemon status reports accurate state.
- The daemon is stoppable and restartable with the server — no zombie processes.

Then for `readme.md`, here's the corrected Architecture section (replace lines 24-50) and the corrected "Running in-process vs. subprocess" section (replace lines 96-101):

**Architecture section (replace lines 24-50):**
```markdown
Architecture
Where it lives
Option A (subprocess): New folder `backend/mcp-tool/daemon/` — separate from `cli.js`. Rationale:
- cli.js is a one-shot command runner. Mixing daemon lifecycle (start/stop/attach) into it would bloat it.
- The daemon has different concerns: connection management, event buffering, command dispatch, log rotation.
- Keeping it separate means the CLI stays simple and the daemon can evolve independently.

Note: `mcp-tool` is named for its existing contents (cli.js is an MCP client). The daemon is NOT an MCP tool — it communicates via WebSocket + HTTP directly. If the folder is meant for client-side tools generally, consider renaming to `backend/tools/` or `backend/cli/`.

Option B (in-process): `backend/services/daemon.ts` — same folder as `tradeStore.ts`, `mcpServer.ts`, `indicatorEngine.ts`. Rationale:
- It's a server service, not a client tool. It imports tradeStore directly and runs in-process.
- Consistent with existing pattern: every server-side component lives in `backend/services/`.
- No new folder to design — it's just another service file, imported by server.ts.

Option C (worker thread): `backend/services/daemon.ts` + `backend/services/daemon-worker.ts` — same folder as tradeStore.ts. The daemon runs in a Node Worker Thread, communicating via postMessage. It gets Option B's latency with Option A's isolation (crash-safe, cannot corrupt tradeStore).

Shared code: Option A's `commands.js` (friendly command router) and `event-buffer.js` (NDJSON log) can be extracted into shared modules that all three options import. Only the connection layer differs (WebSocket client vs. in-process polling vs. worker thread messaging).
Running in-process vs. subprocess section (replace lines 96-101):
Running in-process vs. subprocess
Option A — subprocess (simpler): The daemon is a standalone Node process in backend/mcp-tool/daemon/. The agent reads its stdout and NDJSON buffer. Commands are dispatched via HTTP. Pro: simple, no server code changes. Con: per-command HTTP latency, cannot access tradeStore directly, two failure domains to monitor (daemon process + server process).

Option B — in-process (fastest): The daemon lives in backend/services/daemon.ts and runs inside the server process. Commands call tradeStore directly — no HTTP round-trip. Pro: lowest latency, full access to internal state, single process, minimal footprint (1 new file + 1 import line). Con: couples the daemon to the server; requires server code changes; a daemon bug could affect the server.

Option C — worker thread (best of both): The daemon runs in a Node Worker Thread inside the server process. It communicates via postMessage — no HTTP, no shared memory. Pro: Option B's latency with Option A's isolation (crash-safe, cannot corrupt tradeStore). Con: more complex than Option B, requires ~30 lines of server wiring.

Recommendation: Start with Option A (subprocess, HTTP). It's isolated and safe. Add Option C later if you want isolation without sacrificing latency. Both options can share the same command router and event buffer — only the connection layer differs.
And update the TO-DO section in readme.md (lines 119-135) to add Option C items:
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
- (Option C only) Create backend/services/daemon-worker.ts — worker thread script
- (Option C only) Create backend/services/daemon.ts — worker manager with message router
- (Option C only) Wire into server.ts — add ~30 lines for worker lifecycle management