// Worker manager — runs in the main thread. Creates the worker, polls
// tradeStore.getState() for state changes (no tradeStore.ts changes needed),
// executes commands against tradeStore (validated by the risk guard at
// tradeStore.ts:295), and restarts the worker on crash.
import { Worker } from 'worker_threads';
import { tradeStore } from '../services/tradeStore.js';
import { configureEventBuffer } from './event-buffer.js';

let worker: Worker | null = null;
let started = false;
let pollTimer: NodeJS.Timeout | null = null;
let restartCount = 0;
let restartTimeout: NodeJS.Timeout | null = null;

const MAX_RESTART_DELAY = 30000;
const POLL_INTERVAL_MS = 250;

function workerPath(): URL {
  return new URL('./worker.js', import.meta.url);
}

export function startDaemon() {
  if (worker || started) return;
  started = true;
  configureEventBuffer();

  const workerFile = workerPath();
  worker = new Worker(workerFile, {
    workerData: { state: tradeStore.getState() },
  });

  worker.on('message', (msg: any) => {
    switch (msg.type) {
      case 'command':
        executeCommand(msg.payload);
        break;
      case 'query':
        handleDbQuery(msg.payload);
        break;
      case 'log':
        console.log(`[daemon] ${msg.payload.level}: ${msg.payload.message}`);
        break;
    }
  });

  worker.on('error', (err: any) => {
    console.error('[daemon] Worker error:', err.message);
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`[daemon] Worker exited with code ${code}, restarting...`);
      worker = null;
      stopPolling();
      scheduleRestart();
    } else {
      worker = null;
      stopPolling();
    }
  });

  // Poll tradeStore.getState() and forward any change to the worker.
  // No tradeStore.ts changes needed — getState() is already public.
  let lastStateJson = '';
  pollTimer = setInterval(() => {
    if (!worker) return;
    const state = tradeStore.getState();
    const json = JSON.stringify(state);
    if (json !== lastStateJson) {
      lastStateJson = json;
      worker.postMessage({ type: 'event', payload: { type: 'state_changed', payload: state } });
    }
  }, POLL_INTERVAL_MS);

  console.log('[daemon] Worker started');
}

export function stopDaemon() {
  if (restartTimeout) {
    clearTimeout(restartTimeout);
    restartTimeout = null;
  }
  stopPolling();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  started = false;
  restartCount = 0;
  console.log('[daemon] Worker stopped');
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function scheduleRestart() {
  const delay = Math.min(1000 * Math.pow(2, restartCount), MAX_RESTART_DELAY);
  restartCount++;
  restartTimeout = setTimeout(() => {
    console.log(`[daemon] Restarting worker (attempt ${restartCount})...`);
    startDaemon();
  }, delay);
}

async function handleDbQuery(payload: any) {
  const { id, key, args } = payload;
  try {
    let data: any;
    switch (key) {
      case 'strategies': {
        const { dbGetStrategies } = await import('../database/db.js');
        data = await dbGetStrategies(args?.symbol);
        break;
      }
      case 'signals': {
        const { evaluateAllActiveStrategies, evaluateLiveSignal } = await import('../services/strategyEngine.js');
        const { dbGetStrategyById, dbGetCandles } = await import('../database/db.js');
        if (args?.strategyId) {
          const strategy = await dbGetStrategyById(args.strategyId);
          if (!strategy) throw new Error('Strategy not found');
          let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, 100);
          if (candles.length < 15) {
            const liveHistory = tradeStore.getChartHistory();
            if (liveHistory && liveHistory.length >= 15) candles = liveHistory;
          }
          const tick = tradeStore.getTicks().find((t: any) => t.symbol === strategy.symbol);
          data = [evaluateLiveSignal(strategy, candles, tick ? { bid: tick.bid, ask: tick.ask } : undefined)];
        } else {
          data = await evaluateAllActiveStrategies();
        }
        break;
      }
      case 'observations': {
        const { dbGetObservations } = await import('../database/db.js');
        data = await dbGetObservations(args?.category);
        break;
      }
      default:
        throw new Error(`Unknown DB query: ${key}`);
    }
    worker!.postMessage({ type: 'query_result', payload: { id, data } });
  } catch (err: any) {
    worker!.postMessage({ type: 'query_result', payload: { id, data: null, error: err.message } });
  }
}

function executeCommand(payload: any) {
  const { id, action, args } = payload;
  try {
    switch (action) {
      case 'enqueueCommand': {
        const result = tradeStore.enqueueCommand(args);
        worker!.postMessage({ type: 'result', payload: { id, result } });
        break;
      }
      case 'updateRiskGuard': {
        tradeStore.updateRiskGuard(args);
        worker!.postMessage({ type: 'result', payload: { id, result: { success: true } } });
        break;
      }
      case 'triggerKillSwitch': {
        tradeStore.triggerKillSwitch(args.active);
        worker!.postMessage({ type: 'result', payload: { id, result: { success: true } } });
        break;
      }
      case 'prune': {
        tradeStore.pruneStaleOrders();
        worker!.postMessage({ type: 'result', payload: { id, result: { success: true } } });
        break;
      }
      case 'requestHistoryFromEA': {
        const result = tradeStore.requestHistoryFromEA(args.symbol, args.timeframe, args.count);
        worker!.postMessage({ type: 'result', payload: { id, result } });
        break;
      }
      case 'simulateTick': {
        tradeStore.updateTick({
          symbol: args.symbol,
          bid: Number(args.bid),
          ask: Number(args.ask),
          last: Number(args.bid),
          spread: args.spread || 15,
          volume: args.volume || 500,
          time: Math.floor(Date.now() / 1000),
        });
        worker!.postMessage({ type: 'result', payload: { id, result: { success: true } } });
        break;
      }
      case 'simulateCandles': {
        tradeStore.seedCandles(args.symbol, args.timeframe, args.count, args.basePrice).then((r) => {
          worker!.postMessage({ type: 'result', payload: { id, result: r } });
        });
        break;
      }
      default:
        throw new Error(`Unknown command: ${action}`);
    }
  } catch (err: any) {
    worker!.postMessage({ type: 'result', payload: { id, result: { success: false, error: err.message } } });
  }
}