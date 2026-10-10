export type OrderType = 'BUY' | 'SELL';
export type CommandStatus = 'pending' | 'dispatched' | 'executed' | 'failed' | 'cancelled';
export type OrderAction = 'EXECUTE_TRADE' | 'MODIFY_POSITION' | 'CLOSE_POSITION' | 'CLOSE_ALL' | 'SET_RISK_GUARD';

export interface AccountInfo {
  login: number;
  tradeMode: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  leverage: number;
  currency: string;
  server: string;
  company: string;
  profit: number;
  lastUpdate: number;
}

export interface TickData {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  last: number;
  volume: number;
  time: number;
  high24h?: number;
  low24h?: number;
}

export interface Position {
  ticket: number;
  symbol: string;
  type: OrderType;
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  magic: number;
  comment: string;
  openTime: number;
  trailingEnabled?: boolean;
  trailingDistance?: number;
}

export interface TradeCommand {
  id: string;
  action: OrderAction;
  symbol?: string;
  orderType?: OrderType;
  volume?: number;
  price?: number;
  sl?: number;
  tp?: number;
  ticket?: number;
  magic?: number;
  comment?: string;
  timeframe?: string;
  count?: number;
  slippage?: number;
  status: CommandStatus;
  createdAt: number;
  dispatchedAt?: number;
  executedAt?: number;
  source: 'AI_MCP' | 'MANUAL_UI' | 'RISK_GUARD' | 'API' | 'STRATEGY_ENGINE' | 'KNOWLEDGE_BASE';
  result?: {
    success: boolean;
    dealTicket?: number;
    orderTicket?: number;
    executionPrice?: number;
    comment?: string;
    errorCode?: number;
    errorMessage?: string;
    executionTimeMs?: number;
  };
}

export interface RiskGuardConfig {
  globalTakeProfitUSD: number;
  globalStopLossUSD: number;
  maxDrawdownPercent: number;
  emergencyKillSwitch: boolean;
  trailingStopEnabled: boolean;
  trailingStopDistancePoints: number;
  trailingStopStepPoints: number;
  maxLotSizePerTrade: number;
  maxOpenPositions: number;
  allowedSymbols: string[];
  autoCloseOnMarginLevelBelow: number;
}

export interface ExecutionLog {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'trade';
  title: string;
  details: string;
  source: string;
  ticket?: number;
}

export interface ChartSymbolInfo {
  symbol: string;
  timeframe: string;
  digits: number;
  point: number;
  bid: number;
  ask: number;
  spread: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  contractSize: number;
  tickValue: number;
  tradeAllowed: boolean;
  sessionOpen?: number;
  sessionHigh?: number;
  sessionLow?: number;
  sessionVolume?: number;
  description?: string;
  currencyBase?: string;
  currencyProfit?: string;
}

export interface DetailedSymbolInfo {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  digits: number;
  point: number;
  minLot: number;
  maxLot: number;
  lotStep: number;
  contractSize: number;
  tradeAllowed: boolean;
  high24h?: number;
  low24h?: number;
  sessionOpen?: number;
  sessionHigh?: number;
  sessionLow?: number;
  sessionVolume?: number;
  volume?: number;
  time?: number;
  isCurrentChart?: boolean;
}

export interface CandleData {
  time: number;
  timeIso?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickCount?: number;
  spread?: number;
}

export type PendingOrderType = 'BUY_LIMIT' | 'SELL_LIMIT' | 'BUY_STOP' | 'SELL_STOP' | 'BUY_STOP_LIMIT' | 'SELL_STOP_LIMIT';

export interface PendingOrder {
  ticket: number;
  symbol: string;
  type: PendingOrderType;
  volume: number;
  priceOpen: number;
  currentPrice?: number;
  sl: number;
  tp: number;
  magic: number;
  comment: string;
  timeSetup: number;
  timeSetupIso?: string;
}

export interface MarketDepthItem {
  type: 'BUY' | 'SELL';
  price: number;
  volume: number;
}

export interface TechnicalIndicatorsResult {
  symbol: string;
  timeframe: string;
  timestamp: number;
  timestampIso: string;
  price: number;
  rsi14: number | null;
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  sma50: number | null;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  } | null;
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
    percentB: number;
  } | null;
  atr14: number | null;
  summary: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  signals: {
    rsiSignal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
    macdSignal: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NEUTRAL';
    emaSignal: 'ABOVE_200' | 'BELOW_200' | 'NEUTRAL';
  };
}

export interface AppState {
  connection: {
    isEaConnected: boolean;
    lastEaSync: number;
    eaVersion: string;
    bridgeEndpoint: string;
    fallbackEndpoint: string;
    serverTime: number;
    mt5ServerTime: number;
    terminalName?: string;
    terminalCompany?: string;
    terminalBuild?: number;
    chartSymbol?: string;
    chartTimeframe?: string;
  };
  currentChart: ChartSymbolInfo | null;
  allSymbols: DetailedSymbolInfo[];
  chartHistory: CandleData[];
  indicators?: TechnicalIndicatorsResult | null;
  account: AccountInfo;
  positions: Position[];
  pendingOrders: PendingOrder[];
  ticks: TickData[];
  tickHistory: Record<string, { time: number; bid: number; ask: number }[]>;
  marketDepth?: Record<string, { bids: MarketDepthItem[]; asks: MarketDepthItem[] }>;
  commandQueue: TradeCommand[];
  riskGuard: RiskGuardConfig;
  logs: ExecutionLog[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export type StrategyType =
  | 'RSI_REVERSAL'
  | 'EMA_CROSSOVER'
  | 'MACD_MOMENTUM'
  | 'BOLLINGER_BREAKOUT'
  | 'MULTI_INDICATOR_CONSENSUS'
  | 'CUSTOM_RULESET';

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  type: StrategyType;
  symbol: string;
  timeframe: string;
  parameters: Record<string, any>;
  status: 'active' | 'draft' | 'archived' | 'testing';
  tags?: string[];
  author?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Observation {
  id: string;
  title: string;
  content: string;
  symbol?: string;
  timeframe?: string;
  strategyId?: string;
  category: 'market_insight' | 'pattern' | 'execution_note' | 'anomaly' | 'research';
  tags: string[];
  metrics?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface SimulatedTrade {
  id: string;
  type: 'BUY' | 'SELL';
  entryIndex: number;
  entryTime: number;
  entryTimeIso: string;
  entryPrice: number;
  exitIndex: number;
  exitTime: number;
  exitTimeIso: string;
  exitPrice: number;
  profitPoints: number;
  profitUsd: number;
  returnPct: number;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'SIGNAL_REVERSAL' | 'MAX_HOLD_BARS' | 'END_OF_DATA';
  lotSize: number;
  slPrice?: number;
  tpPrice?: number;
}

export interface BacktestResult {
  id: string;
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
  startTime: number;
  startTimeIso: string;
  endTime: number;
  endTimeIso: string;
  initialDeposit: number;
  finalEquity: number;
  netProfit: number;
  profitFactor: number;
  winRatePct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdownPct: number;
  maxDrawdownUsd: number;
  averageTradeProfit: number;
  averageWin: number;
  averageLoss: number;
  riskRewardRatio: number;
  trades: SimulatedTrade[];
  equityCurve: { time: number; timeIso: string; equity: number }[];
  evaluatedAt: number;
}

export interface StrategySignal {
  strategyId: string;
  strategyName: string;
  symbol: string;
  timeframe: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
  entryPrice: number;
  sl: number;
  tp: number;
  lotSize: number;
  rationale: string;
  indicatorsSnapshot?: {
    rsi?: number | null;
    macdHistogram?: number;
    ema9?: number | null;
    ema21?: number | null;
    summary?: string;
  };
  timestamp: number;
  timestampIso: string;
}


