import { Router } from 'express';
import { tradeStore } from '../services/tradeStore.js';
import { MCP_TOOLS, executeMcpTool, handleMcpJsonRpc } from '../services/mcpServer.js';
import { broadcast } from '../services/websocketServer.js';
import fs from 'fs';
import path from 'path';

export const apiRouter = Router();

// Full state snapshot
apiRouter.get('/state', (req, res) => {
  res.json(tradeStore.getState());
});

// Enqueue order command from UI or API
apiRouter.post('/commands', (req, res) => {
  const { action, symbol, orderType, volume, sl, tp, ticket, magic, comment, source } = req.body;

  const result = tradeStore.enqueueCommand({
    action: action || 'EXECUTE_TRADE',
    symbol,
    orderType,
    volume,
    sl,
    tp,
    ticket,
    magic,
    comment,
    source: source || 'MANUAL_UI',
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  broadcast({
    type: 'command:queued',
    payload: tradeStore.getState().commandQueue[0],
  });

  res.json(result);
});

// Update risk guard parameters
apiRouter.post('/risk', (req, res) => {
  const updates = req.body;
  tradeStore.updateRiskGuard(updates);

  broadcast({
    type: 'risk:updated',
    payload: tradeStore.getRiskGuard(),
  });

  res.json({
    status: 'ok',
    riskGuard: tradeStore.getRiskGuard(),
  });
});

// Toggle emergency kill switch
apiRouter.post('/kill-switch', (req, res) => {
  const { active } = req.body;
  tradeStore.triggerKillSwitch(Boolean(active));

  broadcast({
    type: 'risk:kill_switch',
    payload: { active: Boolean(active) },
  });

  res.json({
    status: 'ok',
    emergencyKillSwitch: tradeStore.getRiskGuard().emergencyKillSwitch,
  });
});

// Active SSE clients for MCP protocol
const mcpSseClients = new Map<string, any>();

// MCP SSE Transport
apiRouter.get('/mcp/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sessionId = `mcp-session-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  mcpSseClients.set(sessionId, res);

  // Send endpoint event with session URI per MCP specification
  res.write(`event: endpoint\ndata: /api/mcp/messages?sessionId=${sessionId}\n\n`);

  req.on('close', () => {
    mcpSseClients.delete(sessionId);
  });
});

// MCP Messages handler for SSE session
apiRouter.post('/mcp/messages', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const sseClient = mcpSseClients.get(sessionId);

  try {
    const rpcResponse = await handleMcpJsonRpc(req.body);
    if (sseClient) {
      sseClient.write(`event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`);
      res.status(202).json({ status: 'accepted' });
    } else {
      res.json(rpcResponse);
    }
  } catch (err: any) {
    const errPayload = {
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32603, message: err?.message || 'Internal RPC error' },
    };
    if (sseClient) {
      sseClient.write(`event: message\ndata: ${JSON.stringify(errPayload)}\n\n`);
      res.status(202).json({ status: 'accepted' });
    } else {
      res.status(500).json(errPayload);
    }
  }
});

// MCP JSON-RPC 2.0 Direct POST Handler
apiRouter.post('/mcp', async (req, res) => {
  try {
    const rpcResponse = await handleMcpJsonRpc(req.body);
    res.json(rpcResponse);
  } catch (err: any) {
    res.status(500).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32603, message: err?.message || 'Internal RPC error' },
    });
  }
});

// MCP Tool List
apiRouter.get('/mcp/tools', (req, res) => {
  res.json({
    tools: MCP_TOOLS,
  });
});

// Execute specific MCP tool directly via REST
apiRouter.post('/mcp/tools/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const result = await executeMcpTool(name, req.body);
    res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err?.message || String(err),
    });
  }
});

// Get MQL5 source code text
apiRouter.get('/ea/code', (req, res) => {
  try {
    const eaPath = path.resolve(process.cwd(), 'backend/ea/AIMT5Bridge.mq5');
    if (fs.existsSync(eaPath)) {
      const code = fs.readFileSync(eaPath, 'utf-8');
      return res.json({ code });
    }
    res.status(404).json({ error: 'EA source file not found' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Download MQL5 file directly
apiRouter.get('/ea/download', (req, res) => {
  const eaPath = path.resolve(process.cwd(), 'backend/ea/AIMT5Bridge.mq5');
  if (fs.existsSync(eaPath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="AIMT5Bridge.mq5"');
    res.setHeader('Content-Type', 'text/plain');
    fs.createReadStream(eaPath).pipe(res);
  } else {
    res.status(404).send('File not found');
  }
});

// Get database analytics & statistics
apiRouter.get('/database/analytics', async (req, res) => {
  try {
    const { dbGetAnalytics } = await import('../database/db.js');
    const analytics = await dbGetAnalytics();
    res.json(analytics);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query orders history from SQLite database
apiRouter.get('/database/orders', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const { dbGetOrders } = await import('../database/db.js');
    const orders = await dbGetOrders(limit);
    res.json({ orders });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Explicitly prune database & purge unexecuted orders older than 24 hours
apiRouter.post('/database/prune', async (req, res) => {
  try {
    tradeStore.pruneStaleOrders();
    const { dbPruneDatabase } = await import('../database/db.js');
    const result = await dbPruneDatabase();
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query candles history from SQLite database
apiRouter.get('/database/candles', async (req, res) => {
  try {
    const symbol = (req.query.symbol as string) || 'EURUSD';
    const timeframe = (req.query.timeframe as string) || 'M1';
    const limit = Number(req.query.limit) || 100;
    const { dbGetCandles } = await import('../database/db.js');
    const candles = await dbGetCandles(symbol, timeframe, limit);
    res.json({ symbol, timeframe, count: candles.length, candles });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query ticks history from SQLite database
apiRouter.get('/database/ticks', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const limit = Number(req.query.limit) || 100;
    const { dbGetTicksHistory } = await import('../database/db.js');
    const ticks = await dbGetTicksHistory(symbol, limit);
    res.json({ count: ticks.length, ticks });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query account history snapshots from SQLite database
apiRouter.get('/database/account-history', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const { dbGetAccountHistory } = await import('../database/db.js');
    const history = await dbGetAccountHistory(limit);
    res.json({ count: history.length, history });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Simulate synthetic candles for strategy backtesting without waiting for live ticks
apiRouter.post('/candles/simulate', async (req, res) => {
  try {
    const { symbol, timeframe, count, basePrice } = req.body;
    const result = await tradeStore.seedCandles(
      symbol || 'EURUSD',
      timeframe || 'M1',
      Number(count) || 60,
      Number(basePrice) || 1.085
    );
    broadcast({
      type: 'ea:sync',
      payload: {
        chartHistory: result.candles,
      },
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Request historical candles from EA on demand
apiRouter.post('/candles/request', (req, res) => {
  try {
    const { symbol, timeframe, count } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });
    const result = tradeStore.requestHistoryFromEA(
      symbol,
      timeframe || 'M1',
      Number(count) || 100
    );
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Download raw SQLite database file
apiRouter.get('/database/download', (req, res) => {
  const dbPath = path.resolve(process.cwd(), 'data/mt5_bridge.sqlite');
  if (fs.existsSync(dbPath)) {
    res.setHeader('Content-Disposition', 'attachment; filename="mt5_bridge.sqlite"');
    res.setHeader('Content-Type', 'application/x-sqlite3');
    fs.createReadStream(dbPath).pipe(res);
  } else {
    res.status(404).json({ error: 'Database file has not been initialized yet' });
  }
});

// Trigger a live tick update for testing
apiRouter.post('/simulate-tick', (req, res) => {
  const { symbol, bid, ask } = req.body;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const current = tradeStore.getTicks().find((t) => t.symbol === symbol);
  const newBid = bid || (current ? current.bid * (1 + (Math.random() - 0.5) * 0.001) : 1.085);
  const newAsk = ask || newBid + 0.00015;

  tradeStore.updateTick({
    symbol,
    bid: Number(newBid.toFixed(5)),
    ask: Number(newAsk.toFixed(5)),
    last: Number(newBid.toFixed(5)),
    spread: 15,
    volume: 500,
    time: Math.floor(Date.now() / 1000),
  });

  broadcast({
    type: 'tick',
    payload: tradeStore.getTicks().find((t) => t.symbol === symbol),
  });

  res.json({ success: true, tick: tradeStore.getTicks().find((t) => t.symbol === symbol) });
});

// ==========================================
// Strategies Knowledge Base Endpoints
// ==========================================

// Get all strategies
apiRouter.get('/strategies', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    const { dbGetStrategies } = await import('../database/db.js');
    const strategies = await dbGetStrategies(symbol);
    res.json({ strategies });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Evaluate real-time signals for active strategies (must be before /strategies/:id)
apiRouter.get(['/strategies-evaluate', '/strategies/evaluate'], async (req, res) => {
  try {
    const { evaluateAllActiveStrategies, evaluateLiveSignal } = await import('../services/strategyEngine.js');
    const { dbGetStrategyById, dbGetCandles } = await import('../database/db.js');

    const strategyId = req.query.strategyId as string;
    if (strategyId) {
      const strategy = await dbGetStrategyById(strategyId);
      if (!strategy) return res.status(404).json({ error: 'Strategy not found' });
      let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, 100);
      if (candles.length < 15) {
        const liveHistory = tradeStore.getChartHistory();
        if (liveHistory && liveHistory.length >= 15) candles = liveHistory;
      }
      const tick = tradeStore.getTicks()[strategy.symbol];
      const signal = evaluateLiveSignal(strategy, candles, tick ? { bid: tick.bid, ask: tick.ask } : undefined);
      return res.json({ signals: [signal] });
    }

    const signals = await evaluateAllActiveStrategies();
    res.json({ signals });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Get strategy by ID
apiRouter.get('/strategies/:id', async (req, res) => {
  try {
    const { dbGetStrategyById } = await import('../database/db.js');
    const strategy = await dbGetStrategyById(req.params.id);
    if (!strategy) return res.status(404).json({ error: 'Strategy not found' });
    res.json(strategy);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Create or update strategy
apiRouter.post('/strategies', async (req, res) => {
  try {
    const { id, name, description, type, symbol, timeframe, parameters, status, tags, author, notes } = req.body;
    if (!name || !symbol) {
      return res.status(400).json({ error: 'Strategy name and symbol are required' });
    }

    const stratId = id || `strat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const strategyData = {
      id: stratId,
      name,
      description: description || '',
      type: type || 'RSI_REVERSAL',
      symbol: (symbol || 'EURUSD').toUpperCase(),
      timeframe: (timeframe || 'M1').toUpperCase(),
      parameters: parameters || {},
      status: status || 'active',
      tags: tags || [],
      author: author || 'User',
      notes: notes || '',
      createdAt: req.body.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const { dbSaveStrategy } = await import('../database/db.js');
    await dbSaveStrategy(strategyData);

    tradeStore.addLog(
      'info',
      'Strategy Saved',
      `Saved strategy "${name}" [${strategyData.type}] for ${strategyData.symbol} ${strategyData.timeframe}`,
      'STRATEGY_ENGINE'
    );

    res.json({ success: true, strategy: strategyData });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Delete strategy
apiRouter.delete('/strategies/:id', async (req, res) => {
  try {
    const { dbDeleteStrategy } = await import('../database/db.js');
    await dbDeleteStrategy(req.params.id);
    res.json({ success: true, message: `Strategy ${req.params.id} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Run backtest for strategy
apiRouter.post('/strategies/:id/backtest', async (req, res) => {
  try {
    const { dbGetStrategyById, dbGetCandles, dbSaveBacktestResult } = await import('../database/db.js');
    const { runStrategyBacktest } = await import('../services/strategyEngine.js');

    const strategy = await dbGetStrategyById(req.params.id);
    if (!strategy) return res.status(404).json({ error: 'Strategy not found' });

    // Allow overriding test parameters or candle limits in request body
    const candleCount = Number(req.body.candleLimit) || 300;
    const initialDeposit = Number(req.body.initialDeposit) || 10000;

    // Pull historical candles from SQLite (collected from MT5 EA)
    let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, candleCount);

    // If local DB doesn't have enough candles, fall back to currently active chart history or generate synthetic candles
    if (candles.length < 20) {
      const liveHistory = tradeStore.getChartHistory();
      if (liveHistory && liveHistory.length >= 20) {
        candles = liveHistory;
      } else {
        // Generate realistic test bars so backtesting always works immediately
        const { dbInsertCandles } = await import('../database/db.js');
        const synthCandles = [];
        let price = strategy.symbol.includes('JPY') ? 154.5 : strategy.symbol.includes('XAU') ? 2650.0 : 1.085;
        const now = Math.floor(Date.now() / 1000);
        for (let i = 100; i >= 0; i--) {
          const t = now - i * 60;
          const open = price;
          const delta = (Math.random() - 0.49) * (price * 0.0008);
          const close = open + delta;
          const high = Math.max(open, close) + Math.random() * (price * 0.0004);
          const low = Math.min(open, close) - Math.random() * (price * 0.0004);
          const vol = Math.floor(50 + Math.random() * 200);
          synthCandles.push({
            time: t,
            timeIso: new Date(t * 1000).toISOString(),
            open: Number(open.toFixed(5)),
            high: Number(high.toFixed(5)),
            low: Number(low.toFixed(5)),
            close: Number(close.toFixed(5)),
            volume: vol,
          });
          price = close;
        }
        await dbInsertCandles(strategy.symbol, strategy.timeframe, synthCandles);
        candles = synthCandles;
      }
    }

    const result = runStrategyBacktest(strategy, candles, initialDeposit);
    await dbSaveBacktestResult(result);

    tradeStore.addLog(
      'trade',
      'Strategy Backtest Completed',
      `Backtested "${strategy.name}" on ${strategy.symbol} (${candles.length} bars). Net Profit: $${result.netProfit}, Win Rate: ${result.winRatePct}%, Trades: ${result.totalTrades}`,
      'STRATEGY_ENGINE'
    );

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ==========================================
// Observations Knowledge Base Endpoints
// ==========================================

// Get observations
apiRouter.get('/observations', async (req, res) => {
  try {
    const category = req.query.category as string;
    const { dbGetObservations } = await import('../database/db.js');
    const observations = await dbGetObservations(category);
    res.json({ observations });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Create observation
apiRouter.post('/observations', async (req, res) => {
  try {
    const { title, content, symbol, timeframe, strategyId, category, tags, metrics } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const obsId = req.body.id || `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const observation = {
      id: obsId,
      title,
      content,
      symbol: symbol || null,
      timeframe: timeframe || null,
      strategyId: strategyId || null,
      category: category || 'market_insight',
      tags: tags || [],
      metrics: metrics || {},
      createdAt: req.body.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    const { dbSaveObservation } = await import('../database/db.js');
    await dbSaveObservation(observation);

    tradeStore.addLog(
      'info',
      'Observation Recorded',
      `Added observation "${title}" in category [${observation.category}]`,
      'KNOWLEDGE_BASE'
    );

    res.json({ success: true, observation });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Delete observation
apiRouter.delete('/observations/:id', async (req, res) => {
  try {
    const { dbDeleteObservation } = await import('../database/db.js');
    await dbDeleteObservation(req.params.id);
    res.json({ success: true, message: `Observation ${req.params.id} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Get backtest results history
apiRouter.get('/backtests', async (req, res) => {
  try {
    const strategyId = req.query.strategyId as string;
    const limit = Number(req.query.limit) || 50;
    const { dbGetBacktestResults } = await import('../database/db.js');
    const results = await dbGetBacktestResults(strategyId, limit);
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Get single backtest result
apiRouter.get('/backtests/:id', async (req, res) => {
  try {
    const { dbGetBacktestById } = await import('../database/db.js');
    const result = await dbGetBacktestById(req.params.id);
    if (!result) return res.status(404).json({ error: 'Backtest not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Execute strategy live signal through the command queue to MT5
apiRouter.post('/strategies/:id/execute-signal', async (req, res) => {
  try {
    const { executeStrategySignal } = await import('../services/strategyEngine.js');
    const customVolume = req.body?.volume ? Number(req.body.volume) : undefined;
    const result = await executeStrategySignal(req.params.id, customVolume);

    if (result.success && result.commandId) {
      broadcast({
        type: 'command:queued',
        payload: tradeStore.getState().commandQueue[0],
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query candles for a symbol and timeframe
apiRouter.get('/candles/:symbol/:timeframe', async (req, res) => {
  try {
    const { dbGetCandles } = await import('../database/db.js');
    const limit = Number(req.query.limit) || 200;
    const candles = await dbGetCandles(req.params.symbol.toUpperCase(), req.params.timeframe.toUpperCase(), limit);
    res.json({ candles });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// Query table records for Database Explorer
apiRouter.get('/database/table/:name', async (req, res) => {
  try {
    const tableName = req.params.name.toLowerCase();
    const allowed = ['orders', 'strategies', 'observations', 'backtest_results', 'candles_history', 'ticks_history', 'audit_logs', 'account_history'];
    if (!allowed.includes(tableName)) {
      return res.status(400).json({ error: `Table "${tableName}" not permitted` });
    }
    const limit = Number(req.query.limit) || 100;
    const { getDatabase } = await import('../database/db.js');
    const db = await getDatabase();
    const result = db.exec(`SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT ${limit}`);
    if (result.length === 0) {
      return res.json({ columns: [], rows: [] });
    }
    const columns = result[0].columns;
    const rows = result[0].values.map((val) => {
      const obj: Record<string, any> = {};
      columns.forEach((col, i) => (obj[col] = val[i]));
      return obj;
    });
    res.json({ columns, rows, total: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

