import {
  AccountInfo,
  CandleData,
  ChartSymbolInfo,
  CommandStatus,
  DetailedSymbolInfo,
  EASyncPayload,
  ExecutionLog,
  MarketDepthItem,
  PendingOrder,
  Position,
  RiskGuardConfig,
  TechnicalIndicatorsResult,
  TickData,
  TradeCommand,
} from '../types/mt5.js';
import {
  getDatabase,
  dbInsertOrder,
  dbInsertLog,
  dbSaveRiskSettings,
  dbGetOrders,
  dbGetAnalytics,
  dbInsertAccountSnapshot,
  dbInsertCandles,
  dbInsertTicks,
  dbGetCandles,
  dbGetTicksHistory,
  dbGetAccountHistory,
  pruneDatabase,
} from '../database/db.js';
import { calculateIndicators } from './indicatorEngine.js';

class TradeStore {
  private account: AccountInfo = {
    login: 0,
    tradeMode: 'PENDING_MT5',
    balance: 0,
    equity: 0,
    margin: 0,
    freeMargin: 0,
    marginLevel: 0,
    leverage: 0,
    currency: 'USD',
    server: 'Awaiting MT5 EA Connection',
    company: 'MetaTrader 5',
    profit: 0,
    lastUpdate: 0,
  };

  // Open positions received purely from real MT5 EA (NO fake simulated positions)
  private positions: Map<number, Position> = new Map();

  private ticks: Map<string, TickData> = new Map();

  private commandQueue: TradeCommand[] = [];
  private logs: ExecutionLog[] = [
    {
      id: 'log-init-1',
      timestamp: Date.now(),
      level: 'info',
      title: 'MT5 Bridge Hub Initialized',
      details: 'Bridge endpoint listening at http://127.0.0.1:7777 and MCP endpoint at /api/mcp. Awaiting MetaTrader 5 EA connection.',
      source: 'SYSTEM',
    },
  ];

  private riskGuard: RiskGuardConfig = {
    globalTakeProfitUSD: 1500,
    globalStopLossUSD: 800,
    maxDrawdownPercent: 5.0,
    emergencyKillSwitch: false,
    trailingStopEnabled: true,
    trailingStopDistancePoints: 150,
    trailingStopStepPoints: 30,
    maxLotSizePerTrade: 2.0,
    maxOpenPositions: 5,
    allowedSymbols: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD'],
    autoCloseOnMarginLevelBelow: 100, // 100% margin call safety
  };

  private eaConnected: boolean = false;
  private lastEaSync: number = 0;
  private eaVersion: string = '2.10';
  private mt5ServerTime: number = 0;
  private terminalName: string = '';
  private terminalCompany: string = '';
  private terminalBuild: number = 0;
  private currentChart: ChartSymbolInfo | null = null;
  private allSymbols: DetailedSymbolInfo[] = [];
  private chartHistory: CandleData[] = [];
  private pendingOrders: Map<number, PendingOrder> = new Map();
  private marketDepth: Record<string, { bids: MarketDepthItem[]; asks: MarketDepthItem[] }> = {};
  private indicators: TechnicalIndicatorsResult | null = null;

  // Track tick movement history for charts (populated by live MT5 tick updates)
  private tickHistory: Map<string, { time: number; bid: number; ask: number }[]> = new Map();

  constructor() {
    // Initialize SQLite Database asynchronously
    getDatabase().catch((err) => console.error('Failed to init SQLite DB:', err));
  }

  // Handle EA sync from MT5 WebRequest
  public handleEASync(payload: EASyncPayload): TradeCommand[] {
    const wasConnected = this.eaConnected && Date.now() - this.lastEaSync < 5000;
    this.eaConnected = true;
    this.lastEaSync = Date.now();
    this.eaVersion = payload.eaVersion || this.eaVersion;
    this.mt5ServerTime = payload.mt5Time || Math.floor(Date.now() / 1000);

    if (payload.terminalName) this.terminalName = payload.terminalName;
    if (payload.terminalCompany) this.terminalCompany = payload.terminalCompany;
    if (payload.terminalBuild) this.terminalBuild = payload.terminalBuild;

    // Log connection pickup if first time or reconnected
    if (!wasConnected) {
      this.addLog(
        'info',
        'MetaTrader 5 EA Attached & Connected',
        `Terminal: ${payload.terminalName || 'MT5'} (${payload.terminalCompany || 'Broker'}) • Chart: ${payload.currentChart?.symbol || 'Active'} [${payload.currentChart?.timeframe || 'TF'}]`,
        'MT5_EA'
      );
    }

    // 0. Update Current Chart & All Symbols
    if (payload.currentChart) {
      this.currentChart = payload.currentChart;
    }
    if (Array.isArray(payload.allSymbols)) {
      this.allSymbols = payload.allSymbols;
    }
    if (Array.isArray(payload.chartHistory) && payload.chartHistory.length > 0) {
      this.chartHistory = payload.chartHistory;
      const currentSym = this.currentChart?.symbol || 'EURUSD';
      const currentTf = this.currentChart?.timeframe || 'M1';
      dbInsertCandles(currentSym, currentTf, payload.chartHistory).catch((e) =>
        console.error('DB insert candles error:', e)
      );
      // Auto-compute indicators server-side
      this.indicators = calculateIndicators(this.chartHistory, currentSym, currentTf);
    }

    // Process on-demand historical payload if returned from EA
    if (payload.historyPayload && Array.isArray(payload.historyPayload.candles)) {
      dbInsertCandles(
        payload.historyPayload.symbol,
        payload.historyPayload.timeframe,
        payload.historyPayload.candles
      ).catch((e) => console.error('DB insert on-demand history error:', e));
    }

    // 1. Update Account Info & Persist Snapshot
    if (payload.account) {
      this.account = {
        ...payload.account,
        lastUpdate: Date.now(),
      };
      dbInsertAccountSnapshot(this.account).catch((e) =>
        console.error('DB account snapshot error:', e)
      );
    }

    // 2. Update Open Positions
    if (Array.isArray(payload.positions)) {
      this.positions.clear();
      for (const pos of payload.positions) {
        this.positions.set(pos.ticket, pos);
      }
    }

    // 3. Update Pending Orders
    if (Array.isArray(payload.pendingOrders)) {
      this.pendingOrders.clear();
      for (const po of payload.pendingOrders) {
        this.pendingOrders.set(po.ticket, {
          ...po,
          timeSetupIso: po.timeSetupIso || new Date(po.timeSetup * 1000).toISOString(),
        });
      }
    }

    // 4. Update Market Depth
    if (payload.marketDepth) {
      this.marketDepth = payload.marketDepth;
    }

    // 5. Update Live Ticks & Persist to SQLite
    if (Array.isArray(payload.ticks)) {
      dbInsertTicks(payload.ticks).catch((e) => console.error('DB insert ticks error:', e));
      pruneDatabase().catch((e) => console.error('DB prune error:', e));
      for (const tick of payload.ticks) {
        const existing = this.ticks.get(tick.symbol);
        const updated: TickData = {
          ...tick,
          high24h: existing ? Math.max(existing.high24h || tick.ask, tick.ask) : tick.ask,
          low24h: existing ? Math.min(existing.low24h || tick.bid, tick.bid) : tick.bid,
        };
        this.ticks.set(tick.symbol, updated);

        // Update history
        let hist = this.tickHistory.get(tick.symbol);
        if (!hist) {
          hist = [];
          this.tickHistory.set(tick.symbol, hist);
        }
        hist.push({ time: Date.now(), bid: tick.bid, ask: tick.ask });
        if (hist.length > 100) hist.shift();
      }
    }

    // 4. Resolve Execution Results reported by EA
    if (Array.isArray(payload.pendingExecutionResults)) {
      for (const res of payload.pendingExecutionResults) {
        this.resolveExecutionResult(res);
      }
    }

    // 5. Evaluate Risk Guard Rules
    this.evaluateRiskGuard();

    // 6. Return pending commands to EA
    return this.dispatchPendingCommands();
  }

  // Update a single live tick (used by EA or simulation)
  public updateTick(tick: TickData) {
    const existing = this.ticks.get(tick.symbol);
    const updated: TickData = {
      ...tick,
      high24h: existing ? Math.max(existing.high24h || tick.ask, tick.ask) : tick.ask,
      low24h: existing ? Math.min(existing.low24h || tick.bid, tick.bid) : tick.bid,
    };
    this.ticks.set(tick.symbol, updated);

    let hist = this.tickHistory.get(tick.symbol);
    if (!hist) {
      hist = [];
      this.tickHistory.set(tick.symbol, hist);
    }
    hist.push({ time: Date.now(), bid: tick.bid, ask: tick.ask });
    if (hist.length > 100) hist.shift();

    // Recalculate floating profit on open positions for this symbol
    for (const [ticket, pos] of this.positions.entries()) {
      if (pos.symbol === tick.symbol) {
        let profit = 0;
        const diff = pos.type === 'BUY' ? tick.bid - pos.openPrice : pos.openPrice - tick.ask;
        if (tick.symbol === 'XAUUSD') {
          profit = diff * pos.volume * 100;
        } else if (tick.symbol === 'BTCUSD') {
          profit = diff * pos.volume;
        } else {
          profit = diff * pos.volume * 100000;
        }
        pos.currentPrice = pos.type === 'BUY' ? tick.bid : tick.ask;
        pos.profit = Number(profit.toFixed(2));
        this.positions.set(ticket, pos);
      }
    }

    // Recompute total account floating equity
    let totalProfit = 0;
    for (const pos of this.positions.values()) {
      totalProfit += pos.profit;
    }
    this.account.profit = Number(totalProfit.toFixed(2));
    this.account.equity = Number((this.account.balance + totalProfit).toFixed(2));
    if (this.account.margin > 0) {
      this.account.marginLevel = Number(((this.account.equity / this.account.margin) * 100).toFixed(2));
    }
  }

  // Enqueue a trade command
  public enqueueCommand(params: {
    action: TradeCommand['action'];
    symbol?: string;
    orderType?: TradeCommand['orderType'];
    volume?: number;
    price?: number;
    sl?: number;
    tp?: number;
    ticket?: number;
    magic?: number;
    comment?: string;
    slippage?: number;
    source: TradeCommand['source'];
  }): { success: boolean; commandId?: string; error?: string } {
    // Risk Guard pre-validation
    if (this.riskGuard.emergencyKillSwitch && params.action !== 'CLOSE_ALL' && params.action !== 'CLOSE_POSITION') {
      return { success: false, error: 'Emergency Kill Switch is ACTIVE. New orders are blocked.' };
    }

    if (params.action === 'EXECUTE_TRADE') {
      if (params.volume && params.volume > this.riskGuard.maxLotSizePerTrade) {
        return {
          success: false,
          error: `Requested lot size (${params.volume}) exceeds risk limit of ${this.riskGuard.maxLotSizePerTrade} lots.`,
        };
      }
      if (this.positions.size >= this.riskGuard.maxOpenPositions) {
        return {
          success: false,
          error: `Max open positions limit (${this.riskGuard.maxOpenPositions}) reached.`,
        };
      }
      if (params.symbol && this.riskGuard.allowedSymbols.length > 0) {
        if (!this.riskGuard.allowedSymbols.includes(params.symbol)) {
          return {
            success: false,
            error: `Symbol ${params.symbol} is not permitted by Risk Guard policy.`,
          };
        }
      }
    }

    const id = `cmd-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const command: TradeCommand = {
      id,
      action: params.action,
      symbol: params.symbol,
      orderType: params.orderType,
      volume: params.volume,
      price: params.price,
      sl: params.sl,
      tp: params.tp,
      ticket: params.ticket,
      magic: params.magic || 889900,
      comment: params.comment || `${params.source}_CMD`,
      slippage: params.slippage || 10,
      status: 'pending',
      createdAt: Date.now(),
      source: params.source,
    };

    this.commandQueue.unshift(command);
    if (this.commandQueue.length > 50) this.commandQueue.pop();

    // Persist to SQLite Database
    dbInsertOrder(command).catch((e) => console.error('DB insert order error:', e));

    this.addLog(
      'info',
      `Queued [${params.action}] via ${params.source}`,
      `${params.action} ${params.symbol || ''} ${params.orderType || ''} ${params.volume ? params.volume + ' lots' : ''} (ID: ${id})`,
      params.source,
      params.ticket
    );

    return { success: true, commandId: id };
  }

  // Prune any unexecuted orders older than 24 hours
  public pruneStaleOrders() {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.commandQueue = this.commandQueue.filter((cmd) => {
      const isUnexecuted = cmd.status === 'pending' || cmd.status === 'dispatched';
      const isExpired = isUnexecuted && cmd.createdAt < twentyFourHoursAgo;
      return !isExpired;
    });
  }

  private dispatchPendingCommands(): TradeCommand[] {
    this.pruneStaleOrders();
    const toDispatch: TradeCommand[] = [];
    for (const cmd of this.commandQueue) {
      if (cmd.status === 'pending') {
        cmd.status = 'dispatched';
        cmd.dispatchedAt = Date.now();
        toDispatch.push(cmd);
      }
    }
    return toDispatch;
  }

  public resolveExecutionResult(res: {
    commandId: string;
    success: boolean;
    dealTicket?: number;
    orderTicket?: number;
    executionPrice?: number;
    errorCode?: number;
    errorMessage?: string;
    executionTimeMs?: number;
  }) {
    const cmd = this.commandQueue.find((c) => c.id === res.commandId);
    if (cmd) {
      cmd.status = res.success ? 'executed' : 'failed';
      cmd.executedAt = Date.now();
      cmd.result = res;

      // Update SQLite Database with execution results
      dbInsertOrder(cmd).catch((e) => console.error('DB update order error:', e));

      this.addLog(
        res.success ? 'trade' : 'error',
        res.success ? `MT5 Execution Confirmed (${cmd.action})` : `MT5 Execution Failed (${cmd.action})`,
        res.success
          ? `Deal #${res.dealTicket || res.orderTicket} @ ${res.executionPrice || 'market'} (${res.executionTimeMs}ms)`
          : `Error: ${res.errorMessage || 'RetCode ' + res.errorCode}`,
        'MT5_EA',
        res.orderTicket || cmd.ticket
      );
    }
  }

  private evaluateRiskGuard() {
    const profit = this.account.profit;
    const balance = this.account.balance;

    // 1. Global Take Profit in USD
    if (this.riskGuard.globalTakeProfitUSD > 0 && profit >= this.riskGuard.globalTakeProfitUSD) {
      this.addLog(
        'warn',
        'Global Take Profit Reached!',
        `Floating profit $${profit.toFixed(2)} reached target $${this.riskGuard.globalTakeProfitUSD}. Triggering emergency closure.`,
        'RISK_GUARD'
      );
      this.enqueueCommand({
        action: 'CLOSE_ALL',
        source: 'RISK_GUARD',
        comment: 'GLOBAL_TP_REACHED',
      });
    }

    // 2. Global Stop Loss in USD
    if (this.riskGuard.globalStopLossUSD > 0 && profit <= -this.riskGuard.globalStopLossUSD) {
      this.addLog(
        'error',
        'Global Stop Loss Breach!',
        `Floating loss -$${Math.abs(profit).toFixed(2)} hit stop limit -$${this.riskGuard.globalStopLossUSD}. Liquidating positions.`,
        'RISK_GUARD'
      );
      this.enqueueCommand({
        action: 'CLOSE_ALL',
        source: 'RISK_GUARD',
        comment: 'GLOBAL_SL_BREACH',
      });
    }

    // 3. Margin Level Protection
    if (
      this.riskGuard.autoCloseOnMarginLevelBelow > 0 &&
      this.account.marginLevel > 0 &&
      this.account.marginLevel < this.riskGuard.autoCloseOnMarginLevelBelow
    ) {
      this.addLog(
        'error',
        'Critical Margin Level Protection Triggered',
        `Margin level ${this.account.marginLevel.toFixed(1)}% dropped below ${this.riskGuard.autoCloseOnMarginLevelBelow}%. Liquidation started.`,
        'RISK_GUARD'
      );
      this.enqueueCommand({
        action: 'CLOSE_ALL',
        source: 'RISK_GUARD',
        comment: 'MARGIN_LEVEL_SAFETY',
      });
    }
  }

  public updateRiskGuard(updated: Partial<RiskGuardConfig>) {
    this.riskGuard = {
      ...this.riskGuard,
      ...updated,
    };
    dbSaveRiskSettings(this.riskGuard).catch((e) => console.error('DB save risk error:', e));
    this.addLog(
      'info',
      'Risk Guard Parameters Updated',
      `TP: $${this.riskGuard.globalTakeProfitUSD} | SL: $${this.riskGuard.globalStopLossUSD} | Trailing: ${this.riskGuard.trailingStopEnabled ? 'ON' : 'OFF'}`,
      'USER_CONTROL'
    );
  }

  public triggerKillSwitch(active: boolean) {
    this.riskGuard.emergencyKillSwitch = active;
    dbSaveRiskSettings(this.riskGuard).catch((e) => console.error('DB save risk error:', e));
    if (active) {
      this.addLog('warn', 'EMERGENCY KILL SWITCH ENGAGED', 'Halting all operations & closing all active positions', 'EMERGENCY');
      this.enqueueCommand({
        action: 'CLOSE_ALL',
        source: 'RISK_GUARD',
        comment: 'EMERGENCY_KILL_SWITCH',
      });
    } else {
      this.addLog('info', 'Emergency Kill Switch Disengaged', 'Normal trading operations resumed', 'USER_CONTROL');
    }
  }

  public addLog(
    level: ExecutionLog['level'],
    title: string,
    details: string,
    source: string,
    ticket?: number
  ) {
    const log: ExecutionLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      level,
      title,
      details,
      source,
      ticket,
    };
    this.logs.unshift(log);
    if (this.logs.length > 100) this.logs.pop();

    dbInsertLog(log).catch((e) => console.error('DB insert log error:', e));
  }

  public getState() {
    this.pruneStaleOrders();
    // Check if EA timed out (no sync in 5 seconds)
    const isEaActive = this.eaConnected && Date.now() - this.lastEaSync < 5000;

    return {
      connection: {
        isEaConnected: isEaActive,
        lastEaSync: this.lastEaSync,
        eaVersion: this.eaVersion,
        bridgeEndpoint: 'http://127.0.0.1:7777',
        fallbackEndpoint: 'http://127.0.0.1:3000/api/mt5',
        serverTime: Date.now(),
        mt5ServerTime: this.mt5ServerTime,
        terminalName: this.terminalName,
        terminalCompany: this.terminalCompany,
        terminalBuild: this.terminalBuild,
        chartSymbol: this.currentChart?.symbol,
        chartTimeframe: this.currentChart?.timeframe,
      },
      currentChart: this.currentChart,
      allSymbols: this.allSymbols,
      chartHistory: this.chartHistory,
      indicators: this.indicators,
      account: this.account,
      positions: Array.from(this.positions.values()),
      pendingOrders: Array.from(this.pendingOrders.values()),
      ticks: Array.from(this.ticks.values()),
      tickHistory: Object.fromEntries(this.tickHistory.entries()),
      marketDepth: this.marketDepth,
      commandQueue: this.commandQueue,
      riskGuard: this.riskGuard,
      logs: this.logs,
    };
  }

  public getCurrentChart() {
    return this.currentChart;
  }

  public getAllSymbols() {
    return this.allSymbols;
  }

  public getChartHistory() {
    return this.chartHistory;
  }

  public getPendingOrders() {
    return Array.from(this.pendingOrders.values());
  }

  public getMarketDepth() {
    return this.marketDepth;
  }

  public getIndicators() {
    return this.indicators;
  }

  public getTicks() {
    return Array.from(this.ticks.values());
  }

  public getPositions() {
    return Array.from(this.positions.values());
  }

  public getAccount() {
    return this.account;
  }

  public getRiskGuard() {
    return this.riskGuard;
  }

  // Request on-demand history from EA via command queue
  public requestHistoryFromEA(symbol: string, timeframe = 'M1', count = 100) {
    return this.enqueueCommand({
      action: 'FETCH_HISTORY',
      symbol: symbol.toUpperCase(),
      comment: JSON.stringify({ timeframe, count }),
      source: 'AI_MCP',
    });
  }

  // Seed synthetic candles for instant testing and AI model validation
  public async seedCandles(symbol: string, timeframe = 'M1', count = 60, basePrice = 1.085) {
    const sym = symbol.toUpperCase();
    const tf = timeframe.toUpperCase();
    const nowSec = Math.floor(Date.now() / 1000);
    const intervalSec = tf === 'M5' ? 300 : tf === 'M15' ? 900 : tf === 'H1' ? 3600 : 60;
    const generated: CandleData[] = [];
    let cur = basePrice;

    for (let i = count - 1; i >= 0; i--) {
      const candleTime = nowSec - i * intervalSec;
      const change = (Math.random() - 0.49) * (cur * 0.001);
      const open = Number(cur.toFixed(5));
      const close = Number((cur + change).toFixed(5));
      const high = Number((Math.max(open, close) + Math.random() * (cur * 0.0005)).toFixed(5));
      const low = Number((Math.min(open, close) - Math.random() * (cur * 0.0005)).toFixed(5));
      const volume = Math.floor(50 + Math.random() * 200);

      generated.push({
        time: candleTime,
        timeIso: new Date(candleTime * 1000).toISOString(),
        open,
        high,
        low,
        close,
        volume,
      });
      cur = close;
    }

    this.chartHistory = generated;
    await dbInsertCandles(sym, tf, generated);
    this.indicators = calculateIndicators(this.chartHistory, sym, tf);
    this.addLog('info', `Seeded ${count} test candles`, `${sym} [${tf}] starting @ ${basePrice}`, 'TEST_SIMULATOR');
    return {
      symbol: sym,
      timeframe: tf,
      count: generated.length,
      candles: generated,
      indicators: this.indicators,
    };
  }
}

export const tradeStore = new TradeStore();
