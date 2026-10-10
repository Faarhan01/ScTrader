// Worker script — runs inside the worker thread.
// Cannot import tradeStore. Maintains a state mirror fed by the main thread
// and dispatches commands via parentPort.
import { parentPort, workerData } from 'worker_threads';
import { executeCommand, handleResult, handleQueryResult } from './commands.js';
import { append } from './event-buffer.js';

const stateMirror: any = { ...(workerData?.state || {}) };
let lastPositions: any[] = [];

// Expose the mirror for read commands.
Object.defineProperty(globalThis, '__daemonMirror', {
  get: () => stateMirror,
  enumerable: true,
});

parentPort!.on('message', (msg: any) => {
  switch (msg.type) {
    case 'init':
      Object.assign(stateMirror, msg.payload);
      break;
    case 'event':
      mergeEvent(stateMirror, msg.payload);
      break;
    case 'result':
      // Command result from main thread — forward to commands.ts handler
      handleResult(msg.payload.id, msg.payload.result);
      break;
    case 'query_result':
      handleQueryResult(msg.payload.id, msg.payload.data);
      break;
    case 'log':
      append({ type: 'daemon_log', payload: msg.payload });
      break;
  }
});

function mergeEvent(state: any, event: any) {
  switch (event.type) {
    case 'state_changed':
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
      if (event.payload.pendingOrders) state.pendingOrders = event.payload.pendingOrders;
      if (event.payload.ticks) state.ticks = event.payload.ticks;
      if (event.payload.currentChart) state.currentChart = event.payload.currentChart;
      if (event.payload.chartHistory) state.chartHistory = event.payload.chartHistory;
      if (event.payload.indicators) state.indicators = event.payload.indicators;
      if (event.payload.riskGuard) state.riskGuard = event.payload.riskGuard;
      if (event.payload.commandQueue) state.commandQueue = event.payload.commandQueue;
      break;
    case 'risk:updated':
      state.riskGuard = event.payload;
      break;
    case 'risk:kill_switch':
      if (state.riskGuard) state.riskGuard.emergencyKillSwitch = event.payload.active;
      break;
    case 'command:queued':
      if (!state.commandQueue) state.commandQueue = [];
      state.commandQueue.unshift(event.payload);
      break;
    case 'command:result':
      if (state.commandQueue) {
        const cmd = state.commandQueue.find((c: any) => c.id === event.payload.commandId);
        if (cmd) {
          cmd.status = event.payload.success ? 'executed' : 'failed';
          cmd.result = event.payload;
        }
      }
      break;
  }
  append({ type: event.type, payload: event.payload });
}

function derivePositionEvents(state: any, positions: any[]) {
  const oldTickets = new Set(lastPositions.map((p) => p.ticket));
  const newTickets = new Set(positions.map((p) => p.ticket));

  for (const pos of positions) {
    if (!oldTickets.has(pos.ticket)) {
      parentPort!.postMessage({
        type: 'event',
        payload: { type: 'position:opened', payload: pos },
      });
    }
  }
  for (const pos of lastPositions) {
    if (!newTickets.has(pos.ticket)) {
      parentPort!.postMessage({
        type: 'event',
        payload: { type: 'position:closed', payload: pos },
      });
    }
  }
  lastPositions = positions;
}