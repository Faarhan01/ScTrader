Now I have a thorough understanding of the codebase. Here's the comprehensive option C.md with a dedicated backend/daemon/ folder:
# Option C — Worker Thread Daemon (isolated + fast, no HTTP)

## What it is

The daemon runs in a Node **Worker Thread** inside the server process.
It lives in its own folder `backend/daemon/` — parallel to `backend/services/`,
`backend/routes/`, `backend/database/`. The worker cannot touch `tradeStore`
directly — it communicates only via `postMessage`. The main thread receives
messages, executes them against `tradeStore`, and sends back results. A crash
in the worker kills only the worker; the server survives and restarts it.

## Why this option

Combines the best of A and B:

|                     | Option A (subprocess)   | Option B (in-process)   | Option C (worker)                        |
| :------------------ | :---------------------- | :---------------------- | :--------------------------------------- |
| Latency             | HTTP (~1-5ms)           | Direct (sub-ms)         | `postMessage` (sub-ms)                   |
| Isolation           | Full (separate process) | None (shared singleton) | Full (separate memory)                   |
| Crash server?       | No                      | Yes                     | No                                       |
| Corrupt tradeStore? | No                      | Possible                | No                                       |
| Server changes      | 0                       | 1 line                  | ~30 lines + 1 small change to tradeStore |
| New files           | 4-5                     | 1                       | 4-5 (in `backend/daemon/`)               |
| Dependencies        | `ws`                    | None                    | None (Node built-in)                     |

## Dedicated folder: `backend/daemon/`

The daemon lives in `backend/daemon/` — a top-level folder under `backend/`,
parallel to `services/`, `routes/`, `database/`, `types/`. This is deliberate:

**Why not `backend/services/`?**
- `services/` holds server-side components (`tradeStore`, `mcpServer`,
  `indicatorEngine`, `websocketServer`). They are singletons that the server
  imports and runs. The daemon is a *consumer* of these services — it imports
  them, but it's not part of the server runtime itself.
- Putting the daemon in `services/` blurs the line between "server code" and
  "agent tooling". A dedicated folder makes it clear: this is an agent-facing
  component, not a server component.

**Why not `backend/mcp-tool/`?**
- `mcp-tool/` holds `cli.js`, which is an MCP client. The daemon is NOT an MCP
  tool — it communicates via WebSocket + HTTP (Option A) or `postMessage`
  (Option C). The folder name would be misleading.

**Why a new top-level folder?**
- Consistent with the existing structure: `backend/` has `services/`, `routes/`,
  `database/`, `types/`, `mcp-tool/`. Adding `daemon/` as a sibling follows the
  same pattern — one folder per concern.
- The daemon has its own lifecycle (start/stop/restart), its own files
  (manager, worker, event buffer, command router), and its own README. It
  deserves its own home.

**Folder structure:**
backend/daemon/
├── daemon.ts          # Worker manager (main thread). Creates worker, forwards events,
│                      #   executes commands against tradeStore, handles restart.
├── worker.ts          # Worker script (runs inside the worker thread). Receives messages,
│                      #   maintains state mirror, dispatches commands via postMessage.
├── event-buffer.ts    # NDJSON event log. Same as Option A — append/read/rotate.
├── commands.ts        # Friendly command router. Same as Option A — 18 commands,
│                      #   read from mirror, mutate via postMessage to main thread.
├── README.md          # Usage, architecture, troubleshooting.
└── package.json       # Optional: declares the daemon as a self-contained module.

**Shared code with Option A:** `event-buffer.ts` and `commands.ts` are identical
to Option A's versions. Only the connection layer differs (WebSocket client
vs. worker thread messaging). This means you can implement Option A first,
extract these two files into `backend/daemon/`, and Option C reuses them.

## How it integrates with the server

The server entry point is `server.ts` (99 lines, verified). The daemon is wired
in after `setupWebSocketServer(server)` (line 47) but before `server.listen()`
(line 64), so the daemon is ready before connections arrive.

**Wiring in `server.ts` (~30 lines added after line 47):**
```ts
// server.ts — add after setupWebSocketServer (line 47)
import { startDaemon, stopDaemon } from './backend/daemon/daemon.js';
startDaemon();
Changes to tradeStore.ts (1 small addition):
Add an EventEmitter so the daemon can subscribe to state changes in real time
instead of polling. This is ~5 lines:
// tradeStore.ts — add at top with other imports
import { EventEmitter } from 'events';

// Add to the TradeStore class:
public readonly events = new EventEmitter();
Then in handleEASync() (line 110), after updating state, emit:
this.events.emit('state_changed', this.getState());
This is optional — the daemon can also poll getState() at 250ms (like Option B)
if you prefer zero changes to tradeStore.ts. But the EventEmitter gives true
push events with zero polling latency.
Communication protocol
Direction	Message	Purpose
Main → Worker	{ type: 'init', payload: tradeStore.getState() }	Initial state snapshot
Main → Worker	{ type: 'event', payload: { type, payload } }	Pushed state change (from tradeStore.events)
Worker → Main	{ type: 'command', payload: { id, action, args } }	Worker wants to execute a command
Main → Worker	{ type: 'result', payload: { id, result } }	Command result
Worker → Main	{ type: 'log', payload: { level, message } }	Worker logs (forwarded to main thread console)
State flow:
1. Main thread starts the worker, sends init with the full tradeStore.getState()
2. Main thread subscribes to tradeStore.events and forwards every event to the worker
3. Worker maintains its own state mirror (same as Option A's mirror, but fed by
the main thread instead of a WebSocket)
4. Worker sends command messages for mutating operations
5. Main thread executes them against tradeStore (which validates against the
risk guard at tradeStore.ts:295) and sends back result
6. If the worker crashes, worker.on('exit') fires — main thread restarts it
with exponential backoff (1s, 2s, 4s, up to 30s cap)
Files to create
backend/daemon/daemon.ts — Worker manager (main thread)
Creates and manages the worker thread. Exports startDaemon() and stopDaemon().
~150 lines.
import { Worker } from 'worker_threads';
import { tradeStore } from '../services/tradeStore.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let worker: Worker | null = null;
let commandId = 0;
const pendingCommands = new Map<string, any>();
let restartTimeout: NodeJS.Timeout | null = null;
let restartCount = 0;

export function startDaemon() {
  if (worker) return; // already running

  worker = new Worker(path.join(__dirname, 'worker.js'), {
    workerData: { state: tradeStore.getState() },
  });

  worker.on('message', (msg: any) => {
    switch (msg.type) {
      case 'command':
        executeCommand(msg.payload);
        break;
      case 'log':
        console.log(`[daemon] ${msg.payload.level}: ${msg.payload.message}`);
        break;
    }
  });

  worker.on('error', (err) => {
    console.error('[daemon] Worker error:', err.message);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`[daemon] Worker exited with code ${code}, restarting...`);
      worker = null;
      scheduleRestart();
    }
  });

  // Subscribe to tradeStore events and forward to worker
  tradeStore.events.on('state_changed', (state: any) => {
    if (worker) {
      worker.postMessage({ type: 'event', payload: { type: 'state_changed', payload: state } });
    }
  });

  console.log('[daemon] Worker started');
}

export function stopDaemon() {
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
  tradeStore.events.removeAllListeners();
  console.log('[daemon] Worker stopped');
}

function scheduleRestart() {
  const delay = Math.min(1000 * Math.pow(2, restartCount), 30000);
  restartCount++;
  restartTimeout = setTimeout(() => {
    console.log(`[daemon] Restarting worker (attempt ${restartCount})...`);
    startDaemon();
  }, delay);
}

function executeCommand(payload: any) {
  const id = `cmd-${++commandId}`;
  pendingCommands.set(id, payload);

  try {
    // Execute against tradeStore directly.
    // enqueueCommand (tradeStore.ts:280) validates against risk guard BEFORE queuing.
    switch (payload.action) {
      case 'enqueueCommand':
        const result = tradeStore.enqueueCommand(payload.command);
        worker!.postMessage({ type: 'result', payload: { id, result } });
        break;
      case 'updateRiskGuard':
        tradeStore.updateRiskGuard(payload.updates);
        worker!.postMessage({ type: 'result', payload: { id, result: { success: true } } });
        break;
      case 'triggerKillSwitch':
        tradeStore.triggerKillSwitch(payload.active);
        worker!.postMessage({ type: 'result', payload: { id, result: { success: true } } });
        break;
      default:
        throw new Error(`Unknown command: ${payload.action}`);
    }
  } catch (err: any) {
    worker!.postMessage({ type: 'result', payload: { id, result: { success: false, error: err.message } } });
  }
}
Key design decisions:
- The worker never imports tradeStore — all access goes through executeCommand
in the main thread, which calls tradeStore.enqueueCommand() (already validated
at tradeStore.ts:295 against the risk guard)
- tradeStore.events is an EventEmitter — the main thread subscribes and
forwards events to the worker in real time (no polling)
- Worker restart uses exponential backoff (1s, 2s, 4s, up to 30s cap), same as
Option A's WebSocket reconnect
backend/daemon/worker.ts — Worker script
Runs inside the worker thread. Receives messages, maintains a state mirror,
and sends command messages for mutating operations. ~200 lines.
// Runs inside the worker thread. Cannot import tradeStore.
import { parentPort, workerData } from 'worker_threads';

const stateMirror: any = { ...workerData.state };
let lastPositions: any[] = [];

parentPort!.on('message', (msg: any) => {
  switch (msg.type) {
    case 'init':
      Object.assign(stateMirror, msg.payload);
      break;
    case 'event':
      mergeEvent(stateMirror, msg.payload);
      break;
    case 'result':
      // Handle command result (log it, update mirror if needed)
      break;
  }
});

function mergeEvent(state: any, event: any) {
  switch (event.type) {
    case 'state_changed':
      // Full state snapshot — merge all fields
      Object.assign(state, event.payload);
      break;
    case 'tick':
      if (!state.ticks) state.ticks = [];
      const idx = state.ticks.findIndex((t: any) => t.symbol === event.payload.symbol);
      if (idx >= 0) state.ticks[idx] = event.payload;
      else state.ticks.push(event.payload);
      break;
    case 'ea:sync':
      if (event.payload.account) state.account = event.payload.account;
      if (event.payload.positions) {
        derivePositionEvents(state, event.payload.positions);
        state.positions = event.payload.positions;
      }
      if (event.payload.ticks) state.ticks = event.payload.ticks;
      if (event.payload.currentChart) state.currentChart = event.payload.currentChart;
      if (event.payload.chartHistory) state.chartHistory = event.payload.chartHistory;
      break;
    case 'risk:updated':
      state.riskGuard = event.payload;
      break;
    case 'risk:kill_switch':
      if (state.riskGuard) state.riskGuard.emergencyKillSwitch = event.payload.active;
      break;
  }
}

function derivePositionEvents(state: any, positions: any[]) {
  // Detect opened/closed positions by diffing against lastPositions
  const oldTickets = new Set(lastPositions.map(p => p.ticket));
  const newTickets = new Set(positions.map(p => p.ticket));
  
  for (const pos of positions) {
    if (!oldTickets.has(pos.ticket)) {
      // Position opened
      parentPort!.postMessage({
        type: 'event',
        payload: { type: 'position:opened', payload: pos }
      });
    }
  }
  
  for (const pos of lastPositions) {
    if (!newTickets.has(pos.ticket)) {
      // Position closed
      parentPort!.postMessage({
        type: 'event',
        payload: { type: 'position:closed', payload: pos }
      });
    }
  }
  
  lastPositions = positions;
}

// Expose a function to read from the mirror
parentPort!.on('message', (msg: any) => {
  if (msg.type === 'query') {
    parentPort!.postMessage({
      type: 'query_result',
      payload: { id: msg.payload.id, data: stateMirror[msg.payload.key] }
    });
  }
});
Key design decisions:
- The worker maintains its own stateMirror — it never touches tradeStore
- derivePositionEvents detects opens/closes by diffing position tickets
against the previous snapshot (same logic as Option A's derived events)
- The worker can query its own mirror via query messages (used by commands.ts)
backend/daemon/event-buffer.ts — NDJSON event log
Same as Option A. Each line is { ts, type, payload }. Exports append(),
read(), rotate(). Default file: data/daemon-events.jsonl. Max 10,000 lines.
backend/daemon/commands.ts — Friendly command router
Same as Option A. 18 commands. Read commands query the state mirror (via
query messages to the worker). Mutating commands send command messages
to the main thread via parentPort.
Command flow:
Agent → commands.ts → (read) query worker mirror → return result
Agent → commands.ts → (mutate) postMessage to main thread → executeCommand
  → tradeStore.enqueueCommand() → result → postMessage back to worker
  → worker receives result → commands.ts returns result to agent
Changes needed
1. backend/daemon/daemon.ts — new file (worker manager)
Create this file. ~150 lines. Exports startDaemon() and stopDaemon().
2. backend/daemon/worker.ts — new file (worker script)
Create this file. ~200 lines. Runs inside the worker thread.
3. backend/daemon/event-buffer.ts — new file (shared with Option A)
Create this file. Same as Option A's event-buffer.js.
4. backend/daemon/commands.ts — new file (shared with Option A)
Create this file. Same as Option A's commands.js, but uses parentPort
instead of WebSocket for communication.
5. server.ts — add ~30 lines
Add after setupWebSocketServer(server) (line 47):
import { startDaemon, stopDaemon } from './backend/daemon/daemon.js';
startDaemon();
6. tradeStore.ts — optional: add EventEmitter (~5 lines)
Add an EventEmitter so the daemon can subscribe to state changes in real time:
import { EventEmitter } from 'events';

class TradeStore {
  public readonly events = new EventEmitter();
  // ... existing code ...
  
  // In handleEASync(), after updating state:
  this.events.emit('state_changed', this.getState());
}
If you prefer zero changes to tradeStore.ts, the daemon can poll getState()
at 250ms instead (like Option B). The EventEmitter is optional but gives true
push events with zero polling latency.
7. package.json — no script needed
Option C runs inside the server process, so there's no separate npm run daemon
script. The daemon starts when the server starts.
Pros
- Isolated — worker has its own memory. Cannot corrupt or crash tradeStore.
- Fast — postMessage is sub-millisecond. No HTTP round-trip.
- Crash-safe — worker dies, server survives, worker auto-restarts.
- Push events — via tradeStore.events (optional). No polling latency.
- No new dependencies — worker_threads is a Node.js built-in.
- TypeScript-safe — all files are .ts, type-checked by tsc --noEmit.
The main thread's executeCommand validates all worker commands before
executing them against tradeStore.
- Clean folder structure — backend/daemon/ is a top-level folder parallel
to services/, routes/, etc. Clear separation of concerns.
Cons
- More complex than Option B — worker lifecycle, message protocol, restart logic.
- Serialization overhead — postMessage uses structured clone. Large state
snapshots cost a serialization round-trip. Mitigation: send the snapshot once
on init, then only send incremental diffs via tradeStore.events.
- Four files to maintain — daemon.ts, worker.ts, event-buffer.ts,
commands.ts.
- Harder to debug — worker errors are less visible than main-thread errors.
Mitigation: the log message type forwards worker logs to the main thread
console, and worker.on('error') catches uncaught exceptions.
- Requires server changes — ~30 lines in server.ts + optionally ~5 lines
in tradeStore.ts.
TO-DO
Implementation sequence
1. Create backend/daemon/event-buffer.ts. Same as Option A. Test in isolation:
write 3 events, read them back, rotate.
2. Create backend/daemon/commands.ts. Same as Option A's commands.js, but
uses parentPort instead of WebSocket. Test in isolation with a mock
parentPort.
3. Create backend/daemon/worker.ts. The worker script. Receives messages,
maintains a state mirror, sends command messages. Test in isolation by
creating a mock parentPort and verifying the mirror updates correctly.
4. Create backend/daemon/daemon.ts. The worker manager. Creates the worker,
forwards events, executes commands against tradeStore. Test in isolation
by mocking tradeStore and Worker.
5. Wire into server.ts. Add import { startDaemon } from './backend/daemon/daemon.js';
after setupWebSocketServer(server) (line 47).
6. (Optional) Add EventEmitter to tradeStore.ts. Add public readonly events = new EventEmitter()
and emit state_changed in handleEASync(). If skipped, the daemon polls
getState() at 250ms instead.
7. Test end-to-end. Start the server with npm run dev, verify the daemon
polls state, dispatches commands, and survives a worker crash.
Detailed task list
- Create backend/daemon/ folder with daemon.ts, worker.ts, event-buffer.ts, commands.ts, README.md
- Implement event-buffer.ts — NDJSON append/read/rotate (same as Option A)
- Implement commands.ts — friendly command router using parentPort (same logic as Option A)
- Implement worker.ts — worker script with state mirror and position diffing
- Implement daemon start — create worker, send init snapshot, forward events
- Implement daemon stop — terminate worker gracefully, clear restart timeout
- Implement command execution in main thread — validate worker commands before calling tradeStore
- Wire into server.ts — add ~30 lines after setupWebSocketServer
- (Optional) Add EventEmitter to tradeStore.ts for real-time push events
- Write events to a configurable NDJSON file (default data/daemon-events.jsonl)
- Add buffer rotation at 10,000 lines
- Test that a worker crash does not affect the server
- Test that a worker crash triggers auto-restart within 1-2 seconds
Success criteria
- Agent runs daemon start (server starts) and immediately sees the full account state.
- Agent issues buy "Step Index" 0.10 7330 7360 "AI" and sees command:queued
then command:result then position:opened as events — no polling, no HTTP.
- Agent sees tick events for tracked symbols in real time (sub-second latency).
- Daemon survives a worker crash — server stays up, worker auto-restarts within 1-2s.
- Agent can read event history from the NDJSON buffer after disconnect.
- daemon status reports accurate state.
- The daemon is stoppable and restartable with the server — no zombie processes.
- A daemon bug cannot corrupt tradeStore state (validated by the main thread).

Key improvements in this version:
1. **Dedicated `backend/daemon/` folder** — parallel to `services/`, `routes/`, etc. Clear separation.
2. **EventEmitter in tradeStore** (optional) — true push events instead of polling.
3. **State diffing** — only send changed fields, not full snapshots.
4. **Position diffing** — detect opens/closes by ticket diffing.
5. **Exponential backoff restart** — same resilience as Option A.
6. **TypeScript throughout** — all files are `.ts`, type-checked.
7. **Shared code with Option A** — `event-buffer.ts` and `commands.ts` are identical.