export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: 'mt5_get_account_info',
    description: 'Retrieve real-time MetaTrader 5 account metrics including balance, equity, margin, free margin, margin level percentage, leverage, currency, and total floating profit.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_get_market_data',
    description: 'Get real-time live tick and price quote data for a symbol or all tracked symbols (bid, ask, spread, 24h high, 24h low).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD). Leave empty or specify "ALL" to get all quotes.',
        },
      },
    },
  },
  {
    name: 'mt5_get_open_positions',
    description: 'Retrieve all currently open trading positions in MetaTrader 5 including ticket ID, symbol, type (BUY/SELL), volume, open price, current market price, stop loss, take profit, floating profit, and magic number.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Filter positions by symbol (optional).',
        },
      },
    },
  },
  {
    name: 'mt5_execute_trade',
    description: 'Asynchronously dispatch a trade execution order (BUY or SELL) to MetaTrader 5. Returns a command ID for asynchronous status tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol to trade (e.g. EURUSD, XAUUSD, BTCUSD)',
        },
        orderType: {
          type: 'string',
          enum: ['BUY', 'SELL'],
          description: 'Order direction: BUY (long) or SELL (short)',
        },
        volume: {
          type: 'number',
          description: 'Volume in standard lots (e.g. 0.01, 0.1, 0.5, 1.0)',
        },
        sl: {
          type: 'number',
          description: 'Stop Loss absolute price (optional, 0 to disable)',
        },
        tp: {
          type: 'number',
          description: 'Take Profit absolute price (optional, 0 to disable)',
        },
        comment: {
          type: 'string',
          description: 'Custom comment or tag explaining AI trade rationale',
        },
        magic: {
          type: 'number',
          description: 'Magic number tag for the order (default: 889900)',
        },
      },
      required: ['symbol', 'orderType', 'volume'],
    },
  },
  {
    name: 'mt5_modify_position',
    description: 'Modify Stop Loss (SL) and Take Profit (TP) levels of an active MetaTrader 5 position ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'number',
          description: 'Unique ticket number of the open position to modify',
        },
        sl: {
          type: 'number',
          description: 'New Stop Loss absolute price level',
        },
        tp: {
          type: 'number',
          description: 'New Take Profit absolute price level',
        },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_close_position',
    description: 'Close an open MetaTrader 5 position by ticket. Supports full close or partial lot closure.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'number',
          description: 'Unique ticket number of the open position to close',
        },
        volume: {
          type: 'number',
          description: 'Volume in lots to close. If omitted or 0, closes the entire position.',
        },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_close_all',
    description: 'Emergency liquidation: Close all open positions immediately or all open positions for a designated symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol filter (e.g. "EURUSD"), or "ALL" to liquidate entire portfolio.',
        },
      },
    },
  },
  {
    name: 'mt5_configure_risk_guard',
    description: 'Update global risk parameters such as account-level take profit ($), stop loss ($), trailing stop distance, and maximum position caps.',
    inputSchema: {
      type: 'object',
      properties: {
        globalTakeProfitUSD: {
          type: 'number',
          description: 'Global portfolio floating profit target in USD (auto-closes all when reached). 0 to disable.',
        },
        globalStopLossUSD: {
          type: 'number',
          description: 'Global portfolio floating loss limit in USD (auto-liquidates when reached). 0 to disable.',
        },
        trailingStopEnabled: {
          type: 'boolean',
          description: 'Enable or disable the dynamic trailing stop engine',
        },
        trailingStopDistancePoints: {
          type: 'number',
          description: 'Trailing distance in broker points (e.g. 150 points = 15 pips)',
        },
        trailingStopStepPoints: {
          type: 'number',
          description: 'Trailing step in broker points (e.g. 30 points)',
        },
        maxLotSizePerTrade: {
          type: 'number',
          description: 'Maximum allowable lot size per individual trade order',
        },
        emergencyKillSwitch: {
          type: 'boolean',
          description: 'When true, halts all new trading and immediately liquidates open positions',
        },
      },
    },
  },
  {
    name: 'mt5_get_execution_queue',
    description: 'Inspect the status of asynchronous orders dispatched to MetaTrader 5 (pending, dispatched, executed, failed, execution latencies).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of recent queue commands to return (default 10)',
        },
      },
    },
  },
  {
    name: 'mt5_get_current_chart',
    description: 'Retrieve real-time details of the active chart and symbol that the MT5 EA is attached to (symbol, timeframe, spread, bid, ask, digits, contract size, min/max lot sizes).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_get_all_symbols',
    description: 'Retrieve all symbols that the MT5 EA is transmitting market quotes and broker specifications for.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_query_trade_history',
    description: 'Query historical trade orders from the persistent SQLite database, including order type, lots, execution prices, deal tickets, and broker latencies.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of historical trade orders to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'mt5_get_performance_analytics',
    description: 'Retrieve comprehensive performance analytics from the SQLite database: execution success rate, total orders, failed orders, and database metrics.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'mt5_get_technical_indicators',
    description: 'Precomputed technical indicator suite: RSI (14), EMAs (9, 21, 50, 200), MACD (12,26,9), Bollinger Bands (20,2), ATR (14), and market bias consensus (STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol ticker (default: active chart)' },
        timeframe: { type: 'string', description: 'Timeframe (default: M1)' },
      },
    },
  },
  {
    name: 'mt5_get_pending_orders',
    description: 'Retrieve active pending limit and stop orders in MetaTrader 5.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Optional symbol filter' },
      },
    },
  },
  {
    name: 'mt5_cancel_pending_order',
    description: 'Cancel an active pending limit or stop order in MetaTrader 5 by ticket ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: { type: 'number', description: 'Order ticket ID to cancel' },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_request_chart_history',
    description: 'Trigger on-demand historical candle pull from MetaTrader 5 for any symbol, timeframe, and bar count.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol ticker (e.g. EURUSD, GBPUSD, XAUUSD)' },
        timeframe: { type: 'string', description: 'Timeframe: M1, M5, M15, H1, H4, D1 (default: M1)' },
        count: { type: 'number', description: 'Number of historical candles to fetch (e.g. 100, 300)' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'mt5_simulate_candles',
    description: 'Seed synthetic candlestick data into SQLite and precompute indicators for testing without waiting for live ticks.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol (default: EURUSD)' },
        timeframe: { type: 'string', description: 'Timeframe (default: M1)' },
        count: { type: 'number', description: 'Number of candles (default: 60)' },
      },
    },
  },
  {
    name: 'mt5_list_strategies',
    description: 'List quantitative trading strategies stored in the persistent knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Filter by symbol (optional)' },
      },
    },
  },
  {
    name: 'mt5_create_strategy',
    description: 'Create or update a quantitative trading strategy in the site knowledge base (e.g. RSI_REVERSAL, EMA_CROSSOVER, MACD_MOMENTUM, MULTI_INDICATOR_CONSENSUS).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Strategy name' },
        description: { type: 'string', description: 'Strategy thesis and rules' },
        type: {
          type: 'string',
          enum: ['RSI_REVERSAL', 'EMA_CROSSOVER', 'MACD_MOMENTUM', 'BOLLINGER_BREAKOUT', 'MULTI_INDICATOR_CONSENSUS', 'CUSTOM_RULESET'],
          description: 'Strategy algorithmic type',
        },
        symbol: { type: 'string', description: 'Target symbol (e.g. EURUSD, XAUUSD)' },
        timeframe: { type: 'string', description: 'Target timeframe (M1, M5, M15, H1, H4, D1)' },
        parameters: { type: 'object', description: 'Indicator parameters (rsiOversold, stopLossPoints, etc.)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Keywords' },
        author: { type: 'string', description: 'Author attribution' },
      },
      required: ['name', 'symbol'],
    },
  },
  {
    name: 'mt5_delete_strategy',
    description: 'Delete a strategy by ID from the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'Strategy ID to delete' },
      },
      required: ['strategyId'],
    },
  },
  {
    name: 'mt5_backtest_strategy',
    description: 'Run backtest of a strategy against stored historical MT5 candles on the site server. Calculates win rate, net profit, drawdown, and equity curve.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'Strategy ID' },
        candleLimit: { type: 'number', description: 'Historical candles count (default: 300)' },
        initialDeposit: { type: 'number', description: 'Deposit in USD (default: 10000)' },
      },
      required: ['strategyId'],
    },
  },
  {
    name: 'mt5_evaluate_strategy_signals',
    description: 'Evaluate active quantitative strategies against real-time MT5 candlestick data and quotes. Returns BUY/SELL/NEUTRAL signals with rationale and dynamic SL/TP.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'Optional ID of specific strategy' },
      },
    },
  },
  {
    name: 'mt5_execute_strategy_signal',
    description: 'Execute a strategy signal through the site command queue to MT5. Bridge pushes order for EA execution.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'ID of strategy to execute' },
        volume: { type: 'number', description: 'Lot size override (optional)' },
      },
      required: ['strategyId'],
    },
  },
  {
    name: 'mt5_list_observations',
    description: 'Retrieve observations, empirical market patterns, and research insights from knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'market_insight', 'pattern', 'execution_note', 'anomaly', 'research'],
          description: 'Filter category (default: all)',
        },
      },
    },
  },
  {
    name: 'mt5_record_observation',
    description: 'Store a market observation or execution insight in the persistent knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Observation title' },
        content: { type: 'string', description: 'Detailed analysis or empirical finding' },
        symbol: { type: 'string', description: 'Associated symbol (optional)' },
        timeframe: { type: 'string', description: 'Associated timeframe (optional)' },
        category: {
          type: 'string',
          enum: ['market_insight', 'pattern', 'execution_note', 'anomaly', 'research'],
          description: 'Classification category',
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'mt5_delete_observation',
    description: 'Delete an observation by ID from the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        observationId: { type: 'string', description: 'Observation ID to delete' },
      },
      required: ['observationId'],
    },
  },
  {
    name: 'mt5_get_backtest_history',
    description: 'Retrieve archived backtest runs and performance results from SQLite.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: { type: 'string', description: 'Filter by strategy ID (optional)' },
        limit: { type: 'number', description: 'Maximum reports to return (default: 20)' },
      },
    },
  },
];
