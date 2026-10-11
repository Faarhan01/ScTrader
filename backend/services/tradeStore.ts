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
  dbGetRiskSettings,
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
import { Mt5DirectService } from './mt5DirectService.js';

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
    server: 'Awaiting MT5 Connection',
    company: 'MetaTrader 5',
    profit: 0,
    lastUpdate: 0,
  };

  // Open positions received from MetaTrader 5 via direct API
  private positions: Map<number, Position> = new Map();

  private ticks: Map<string, TickData> = new Map();

  private commandQueue: TradeCommand[] = [];
  private logs: ExecutionLog[] = [
    {
      id: 'log-init-1',
      timestamp: Date.now(),
      level: 'info',
      title: 'MT5 Bridge Hub Initialized',
      details: 'Bridge endpoint listening at http://127.0.0.1:7777 and MCP endpoint at /api/mcp. Using direct MetaTrader5 API.',
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

  // Direct MT5 service
  private mt5Service = Mt5DirectService.getInstance();

  // Polling interval for updating state from MT5 (in milliseconds)
  private pollingInterval: NodeJS.Timeout | null = null;
  private readonly POLLING_INTERVAL_MS = 2000; // 2 seconds

  constructor() {
    // Initialize SQLite Database asynchronously
    getDatabase().catch((err) => console.error('Failed to init SQLite DB:', err));
    // Restore persisted Risk Guard configuration (if any) so settings survive restarts
    dbGetRiskSettings().then((saved) => {
      if (saved) this.riskGuard = { ...this.riskGuard, ...saved };
    }).catch(() => { /* ignore; keep defaults */ });

    // Start polling for MT5 data
    this.startPolling();
  }

  /**
   * Start polling MT5 for account, positions, ticks, symbols, etc.
   */
  private startPolling() {
    // Clear any existing interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Fetch initial data
    this.updateStateFromMT5();

    // Set up periodic updates
    this.pollingInterval = setInterval(() => {
      this.updateStateFromMT5();
    }, this.POLLING_INTERVAL_MS);
  }

  /**
   * Stop polling (called on shutdown)
   */
  public stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  /**
   * Update the entire state from MT5 using the direct API
   */
  private async updateStateFromMT5() {
    try {
      // Update account
      const account = await this.mt5Service.getAccount();
      if (account) {
        this.account = { ...account, lastUpdate: Date.now() };
        dbInsertAccountSnapshot(this.account).catch((e) =>
          console.error('DB account snapshot error:', e)
        );
      }

      // Update positions
      const positions = await this.mt5Service.getPositions();
      this.positions.clear();
      for (const pos of positions) {
        this.positions.set(pos.ticket, pos);
      }

      // Update ticks for all symbols we care about (or from allowedSymbols)
      const symbolsToWatch = this.riskGuard.allowedSymbols;
      const ticks = await this.mt5Service.getTicks(symbolsToWatch);
      this.ticks.clear();
      for (const [symbol, tick] of Object.entries(ticks)) {
        if (tick && !('error' in tick)) {
          this.ticks.set(symbol, tick as TickData);
        }
      }

      // Update symbols (detailed symbol info)
      const symbols = await this.mt5Service.getSymbols(symbolsToWatch);
      this.allSymbols = symbols;

      // Initialize currentChart to first symbol if not already set
      if (!this.currentChart && symbols.length > 0) {
        const firstSymbol = symbols[0];
        this.currentChart = {
          symbol: firstSymbol.symbol,
          timeframe: 'M1', // Default timeframe
          digits: firstSymbol.digits,
          point: firstSymbol.point,
          bid: firstSymbol.bid,
          ask: firstSymbol.ask,
          spread: firstSymbol.spread,
          minLot: firstSymbol.minLot,
          maxLot: firstSymbol.maxLot,
          lotStep: firstSymbol.lotStep,
          contractSize: firstSymbol.contractSize,
          tickValue: firstSymbol.contractSize * firstSymbol.point, // Calculate tick value
          tradeAllowed: firstSymbol.tradeAllowed,
          sessionOpen: firstSymbol.sessionOpen ?? 0,
          sessionHigh: firstSymbol.sessionHigh ?? 0,
          sessionLow: firstSymbol.sessionLow ?? 0,
          sessionVolume: firstSymbol.sessionVolume ?? 0,
          description: undefined, // Not available in symbol info
          currencyBase: undefined, // Not available in symbol info
          currencyProfit: undefined, // Not available in symbol info
          isCurrentChart: true
        };
      }

      // Update chart history for the current symbol (if any)
      if (this.currentChart?.symbol) {
        const symbol = this.currentChart.symbol;
        const timeframe = this.currentChart.timeframe || 'M1';
        const candles = await this.mt5Service.getCandles(symbol, timeframe, 500);
        if (candles.length > 0) {
          this.chartHistory = candles;
          dbInsertCandles(symbol, timeframe, candles).catch((e) =>
            console.error('DB insert candles error:', e)
          );
          // Auto-compute indicators server-side
          this.indicators = calculateIndicators(this.chartHistory, symbol, timeframe);
        }
      }

      // Update tick history for charting
      for (const [symbol, tick] of this.ticks.entries()) {
        let hist = this.tickHistory.get(symbol);
        if (!hist) {
          hist = [];
          this.tickHistory.set(symbol, hist);
        }
        hist.push({ time: Date.now(), bid: tick.bid, ask: tick.ask });
        if (hist.length > 100) hist.shift();
      }

      // Recalculate floating profit on open positions
      let totalProfit = 0;
      for (const pos of this.positions.values()) {
        const tick = this.ticks.get(pos.symbol);
        if (tick) {
          let profit = 0;
          const diff = pos.type === 'BUY' ? tick.bid - pos.openPrice : pos.openPrice - tick.ask;
          if (pos.symbol === 'XAUUSD') {
            profit = diff * pos.volume * 100;
          } else if (pos.symbol === 'BTCUSD') {
            profit = diff * pos.volume;
          } else {
            profit = diff * pos.volume * 100000;
          }
          pos.profit = Number(profit.toFixed(2));
          pos.currentPrice = pos.type === 'BUY' ? tick.bid : tick.ask;
          this.positions.set(pos.ticket, pos);
          totalProfit += pos.profit;
        }
      }
      this.account.profit = Number(totalProfit.toFixed(2));
      this.account.equity = Number((this.account.balance + totalProfit).toFixed(2));
      if (this.account.margin > 0) {
        this.account.marginLevel = Number(((this.account.equity / this.account.margin) * 100).toFixed(2));
      }

    } catch (error: any) {
      console.error('Error updating state from MT5:', error);
      this.addLog(
        'error',
        'MT5 State Update Failed',
        `Failed to update state from MT5: ${error.message}`
        'MT5_DIRECT'
      );
    }
  }

  // Handle EA sync from MT5 WebRequest - NOW DEPRECATED, we use direct API
  public handleEASync(payload: EASyncPayload): TradeCommand[] {
    this.addLog(
      'warn',
      'EA Sync Ignored',
      'Using direct MetaTrader5 API instead of EA sync',
      'MT5_DIRECT'
    );
    // We still return pending commands so the EA doesn't hang
    return this.dispatchPendingCommands();
  }

  // Update a single live tick (used by EA or simulation) - NOW DEPRECATED
  public updateTick(tick: TickData) {
    this.addLog(
      'warn',
      'Tick Update Ignored',
      'Using direct MetaTrader5 API for tick updates',
      'MT5_DIRECT'
    );
    // We still update the local tick for immediate UI feedback, but the state is updated by polling
    const symbol = tick.symbol;
    const existing = this.ticks.get(symbol);
    const updated: TickData = {
      ...tick,
      high24h: existing ? Math.max(existing.high24h || tick.ask, tick.ask) : tick.ask,
      low24h: existing ? Math.min(existing.low24h || tick.bid, tick.bid) : tick.bid,
    };
    this.ticks.set(symbol, updated);

    // Update history
    let hist = this.tickHistory.get(symbol);
    if (!hist) {
      hist = [];
      this.tickHistory.set(symbol, hist);
    }
    hist.push({ time: Date.now(), bid: tick.bid, ask: tick.ask });
    if (hist.length > 100) hist.shift();

    // Recalculate floating profit on open positions for this symbol
    for (const [ticket, pos] of this.positions.entries()) {
      if (pos.symbol === symbol) {
        let profit = 0;
        const diff = pos.type === 'BUY' ? tick.bid - pos.openPrice : pos.openPrice - tick.ask;
        if (symbol === 'XAUUSD') {
          profit = diff * pos.volume * 100;
        } else if (symbol === 'BTCUSD') {
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

  // Enqueue a trade command - NOW EXECUTES DIRECTLY via MT5 API
  public async enqueueCommand(params: {
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
  }): Promise<{ success: boolean; commandId?: string; error?: string }> {
    // Risk Guard pre-validation
    if (this.riskGuard.emergencyKillSwitch && params.action !== 'CLOSE_ALL' && params.action !== 'CLOSE_POSITION') {
      return { success: false, error: 'Emergency Kill Switch is ACTIVE. New orders are blocked.' };
    }

    if (params.action === 'EXECUTE_TRADE') {
      if (params.volume && params.volume > this.riskGuard.maxLotSizePerTrade) {
        return {
          success: false,
          error: Requested lot size () exceeds risk limit of  lots.,
        };
      }
      if (this.positions.size >= this.riskGuard.maxOpenPositions) {
        return {
          success: false,
          error: Max open positions limit () reached.,
        };
      }
      if (params.symbol && this.riskGuard.allowedSymbols.length > 0) {
        const sym = params.symbol.toUpperCase();
        if (!this.riskGuard.allowedSymbols.some((s) => s.toUpperCase() === sym)) {
          return {
            success: false,
            error: Symbol  is not permitted by Risk Guard policy.,
          };
        }
      }
    }

    // For direct trading, we execute immediately instead of queuing
    // But we still create a command for logging and tracking
    const id = cmd--;
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
      comment: params.comment || ${params.source}_CMD,
      slippage: params.slippage || 10,
      status: 'pending',
      createdAt: Date.now(),
      source: params.source,
    };

    // Execute the command based on action
    let result: { success: boolean; dealTicket?: number; orderTicket?: number; executionPrice?: number; error?: string } = {
      success: false,
      error: 'Unknown action'
    };

    switch (params.action) {
      case 'EXECUTE_TRADE':
        if (!params.symbol || params.volume === undefined || params.orderType === undefined) {
          result = { success: false, error: 'Missing symbol, volume, or orderType for trade' };
        } else {
          result = await this.mt5Service.sendOrder(
            params.orderType,
            params.symbol,
            params.volume,
            params.sl ?? 0,
            params.tp ?? 0,
            params.price ?? 0
          );
        }
        break;
      case 'CLOSE_POSITION':
        if (!params.ticket) {
          result = { success: false, error: 'Missing ticket for position close' };
        } else {
          result = await this.mt5Service.closePosition(params.ticket);
        }
        break;
      case 'MODIFY_POSITION':
        if (!params.ticket || params.sl === undefined || params.tp === undefined) {
          result = { success: false, error: 'Missing ticket, sl, or tp for position modify' };
        } else {
          result = await this.mt5Service.modifyPosition(params.ticket, params.sl, params.tp);
        }
        break;
      case 'CLOSE_ALL':
        // Close all positions
        const positionTickets = Array.from(this.positions.keys());
        // We'll close positions sequentially for simplicity
        // In a production system, we might want to do this in parallel and track results
        let allSuccess = true;
        let lastError = '';
        for (const ticket of positionTickets) {
          const closeResult = await this.mt5Service.closePosition(ticket);
          if (!closeResult.success) {
            allSuccess = false;
            lastError = closeResult.error || 'Unknown error';
          }
        }
        result = {
          success: allSuccess,
          error: allSuccess ? undefined : lastError
        };
        break;
      case 'FETCH_HISTORY':
        // This would be handled by the EA in the original system, but we can implement it via direct API
        // We'll leave it as a no-op for now and log that it's not implemented
        result = { success: false, error: 'FETCH_HISTORY not implemented in direct API mode' };
        break;
      case 'SET_RISK_GUARD':
        // This is handled by updateRiskGuard method
        result = { success: true };
        break;
      default:
        result = { success: false, error: Unsupported action:  };
    }

    // Update command with result
    command.status = result.success ? 'executed' : 'failed';
    command.executedAt = Date.now();
    command.result = result;

    // Persist to SQLite Database
    dbInsertOrder(command).catch((e) => console.error('DB insert order error:', e));

    // Log the command execution
    this.addLog(
      result.success ? 'trade' : 'error',
      result.success ? MT5 Execution Confirmed () : MT5 Execution Failed (),
      result.success
        ? Deal # @  
        : Error: ,
      'MT5_DIRECT',
      params.ticket
    );

    // If the command was successful, we trigger an immediate state update to reflect the change
    if (result.success) {
      // We don't await this because we want to return the result quickly
      this.updateStateFromMT5().catch((e) => console.error('Error updating state after command:', e));
    }

    // Return the command execution result
    return {
      success: result.success,
      commandId: id,
      error: result.error ? ${result.error} : undefined
    };
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
    // This method is kept for compatibility but is not used in direct API mode
    // We log that it's ignored
    this.addLog(
      'warn',
      'Execution Result Ignored',
      'Using direct MetaTrader5 API for execution results',
      'MT5_DIRECT'
    );
    const cmd = this.commandQueue.find((c) => c.id === res.commandId);
    if (cmd) {
      cmd.status = res.success ? 'executed' : 'failed';
      cmd.executedAt = Date.now();
      cmd.result = res;

      // Update SQLite Database with execution results
      dbInsertOrder(cmd).catch((e) => console.error('DB update order error:', e));

      this.addLog(
        res.success ? 'trade' : 'error',
        res.success ? MT5 Execution Confirmed () : MT5 Execution Failed (),
        res.success
          ? Deal # @  (ms)
          : Error: ,
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
        Floating profit {profit.toFixed(2)} reached target {this.riskGuard.globalTakeProfitUSD}. Triggering emergency closure.,
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
        Floating loss -{Math.abs(profit).toFixed(2)} hit stop limit -{this.riskGuard.globalStopLossUSD}. Liquidating positions.,
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
        Margin level % dropped below %. Liquidation started.,
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
      TP: {this.riskGuard.globalTakeProfitUSD} | SL: {this.riskGuard.globalStopLossUSD} | Trailing: ,
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
      id: log--,
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
    // Check if we have recent data (within 2 polling intervals)
    const isDataFresh = Date.now() - this.account.lastUpdate < this.POLLING_INTERVAL_MS * 2;

    return {
      connection: {
        isEaConnected: false, // We are not using EA
        lastEaSync: this.account.lastUpdate,
        eaVersion: 'Direct API',
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

  // Request on-demand history from EA via command queue - NOW DEPRECATED
  public async requestHistoryFromEA(symbol: string, timeframe = 'M1', count = 100) {
    this.addLog(
      'warn',
      'History Request Ignored',
      'Using direct MetaTrader5 API for historical data',
      'MT5_DIRECT'
    );
    // We could implement this via the direct API, but for now we return a fake command
    return await this.enqueueCommand({
      action: 'FETCH_HISTORY',
      symbol: symbol,
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
    this.addLog('info', Seeded  test candles, ${sym} [] starting @ , 'TEST_SIMULATOR');
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  tradeStore.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Shutting down gracefully...');
  tradeStore.stopPolling();
  process.exit(0);
});
