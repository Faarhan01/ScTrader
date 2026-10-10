// Friendly command router for the daemon worker.
// Runs inside the worker thread. Read commands query the local state mirror
// (via query messages to the main thread). Mutating commands send command
// messages to the main thread via parentPort and wait for the result.
import { parentPort } from 'worker_threads';
import { append, read } from './event-buffer.js';

let commandId = 0;
const pendingMutations = new Map<string, any>();

function nextId() {
  return `cmd-${++commandId}`;
}

function queryMain(key: string, args?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextId();
    pendingMutations.set(id, { resolve, reject });
    parentPort!.postMessage({ type: 'query', payload: { id, key, args } });
    setTimeout(() => {
      if (pendingMutations.has(id)) {
        pendingMutations.delete(id);
        reject(new Error('Query timeout'));
      }
    }, 5000);
  });
}

function sendCommand(action: string, args: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = nextId();
    pendingMutations.set(id, { resolve, reject });
    parentPort!.postMessage({ type: 'command', payload: { id, action, args } });
    setTimeout(() => {
      if (pendingMutations.has(id)) {
        pendingMutations.delete(id);
        reject(new Error('Command timeout'));
      }
    }, 10000);
  });
}

export function handleResult(id: string, result: any) {
  const entry = pendingMutations.get(id);
  if (entry) {
    pendingMutations.delete(id);
    if (result.success === false) {
      entry.reject(new Error(result.error || 'Command failed'));
    } else {
      entry.resolve(result);
    }
  }
}

export function handleQueryResult(id: string, data: any) {
  const entry = pendingMutations.get(id);
  if (entry) {
    pendingMutations.delete(id);
    entry.resolve(data);
  }
}

// Read commands — query the state mirror directly (synchronous, no IPC needed
// because the mirror lives in the worker's own memory).
export const readCommands: Record<string, (args: any) => any> = {
  status: (_args) => {
    const state = (globalThis as any).__daemonMirror;
    return state ? state.account : null;
  },
  positions: (args) => {
    const state = (globalThis as any).__daemonMirror;
    if (!state) return [];
    let positions = state.positions || [];
    if (args?.symbol) {
      positions = positions.filter((p: any) => p.symbol.toUpperCase() === args.symbol.toUpperCase());
    }
    return positions;
  },
  orders: (args) => {
    const state = (globalThis as any).__daemonMirror;
    if (!state) return [];
    let orders = state.pendingOrders || [];
    if (args?.symbol) {
      orders = orders.filter((o: any) => o.symbol.toUpperCase() === args.symbol.toUpperCase());
    }
    return orders;
  },
  quote: async (args) => {
    if (!args?.symbol) throw new Error('quote requires a symbol');
    const state = (globalThis as any).__daemonMirror;
    const tick = (state?.ticks || []).find((t: any) => t.symbol.toUpperCase() === args.symbol.toUpperCase());
    if (!tick) throw new Error(`No tick data for ${args.symbol}`);
    return tick;
  },
  indicators: async (args) => {
    const state = (globalThis as any).__daemonMirror;
    return state?.indicators || null;
  },
  candles: async (args) => {
    const state = (globalThis as any).__daemonMirror;
    let candles = state?.chartHistory || [];
    if (args?.limit) candles = candles.slice(-args.limit);
    return candles;
  },
  strategies: async (_args) => {
    // Strategies live in the DB, not the mirror. Query via main thread.
    return queryMain('strategies');
  },
  signals: async (args) => {
    return queryMain('signals', args);
  },
  observations: async (_args) => {
    return queryMain('observations');
  },
  events: async (args) => {
    return read(args?.limit);
  },
  risk: async (_args) => {
    const state = (globalThis as any).__daemonMirror;
    return state?.riskGuard || null;
  },
  kill_switch: async (_args) => {
    const state = (globalThis as any).__daemonMirror;
    return state?.riskGuard ? { active: state.riskGuard.emergencyKillSwitch } : { active: false };
  },
};

// Mutating commands — send to main thread, which validates against tradeStore
export const mutateCommands: Record<string, (args: any) => Promise<any>> = {
  buy: (args) => sendCommand('enqueueCommand', {
    action: 'EXECUTE_TRADE',
    symbol: args.symbol,
    orderType: 'BUY',
    volume: args.lots,
    sl: args.sl,
    tp: args.tp,
    comment: args.comment || 'DAEMON_BUY',
    source: 'AI_MCP',
  }),
  sell: (args) => sendCommand('enqueueCommand', {
    action: 'EXECUTE_TRADE',
    symbol: args.symbol,
    orderType: 'SELL',
    volume: args.lots,
    sl: args.sl,
    tp: args.tp,
    comment: args.comment || 'DAEMON_SELL',
    source: 'AI_MCP',
  }),
  close: (args) => sendCommand('enqueueCommand', {
    action: 'CLOSE_POSITION',
    ticket: args.ticket,
    volume: args.lots,
    source: 'AI_MCP',
  }),
  cancel: (args) => sendCommand('enqueueCommand', {
    action: 'CANCEL_PENDING',
    ticket: args.ticket,
    source: 'AI_MCP',
  }),
  close_all: (_args) => sendCommand('enqueueCommand', {
    action: 'CLOSE_ALL',
    source: 'AI_MCP',
  }),
  update_risk: (args) => sendCommand('updateRiskGuard', args),
  toggle_kill_switch: (args) => sendCommand('triggerKillSwitch', { active: args.active }),
  prune: (_args) => sendCommand('prune', {}),
  request_history: (args) => sendCommand('requestHistoryFromEA', {
    symbol: args.symbol,
    timeframe: args.timeframe,
    count: args.count,
  }),
  simulate_tick: (args) => sendCommand('simulateTick', args),
  simulate_candles: (args) => sendCommand('simulateCandles', args),
};

export function executeCommand(name: string, args: any): Promise<any> {
  const readFn = readCommands[name];
  if (readFn) {
    return Promise.resolve(readFn(args));
  }
  const mutateFn = mutateCommands[name];
  if (mutateFn) {
    return mutateFn(args);
  }
  return Promise.reject(new Error(`Unknown command: ${name}`));
}