import { tradeStore } from './tradeStore.js';
import { OrderType } from '../types/mt5.js';

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
    name: 'mt5_get_chart_history',
    description: 'Retrieve real historical OHLCV candlestick data (open, high, low, close, volume, timestamps) with optional precomputed technical indicators (RSI, EMA, MACD, Bollinger Bands, ATR) for any symbol and timeframe (M1, M5, M15, H1, H4, D1).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, XAUUSD, BTCUSD). Defaults to active chart symbol.',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, M30, H1, H4, D1 (default: active chart period or M1)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of recent candles to return (default: 60, max: 500)',
        },
        includeIndicators: {
          type: 'boolean',
          description: 'Whether to include precomputed technical indicators (RSI, EMA, MACD, Bollinger, ATR) calculated on these candles (default: true)',
        },
      },
    },
  },
  {
    name: 'mt5_get_technical_indicators',
    description: 'Precomputed technical indicator suite for quantitative analysis: RSI (14), EMAs (9, 21, 50, 200), MACD (12,26,9), Bollinger Bands (20,2), ATR (14), and automated algorithmic market summary (STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (default: active chart symbol)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe (default: M1)',
        },
      },
    },
  },
  {
    name: 'mt5_get_pending_orders',
    description: 'Retrieve all active pending orders in MetaTrader 5 (BUY_LIMIT, SELL_LIMIT, BUY_STOP, SELL_STOP, BUY_STOP_LIMIT, SELL_STOP_LIMIT) including open prices, SL/TP, and order tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Optional filter by symbol (e.g. EURUSD)',
        },
      },
    },
  },
  {
    name: 'mt5_cancel_pending_order',
    description: 'Cancel an active pending limit or stop order in MetaTrader 5 by ticket ID.',
    inputSchema: {
      type: 'object',
      properties: {
        ticket: {
          type: 'number',
          description: 'Order ticket ID to cancel',
        },
      },
      required: ['ticket'],
    },
  },
  {
    name: 'mt5_request_chart_history',
    description: 'Trigger an on-demand historical candle pull from MetaTrader 5 for any symbol, timeframe (M1, M5, M15, H1, etc.), and count. The EA fetches CopyRates from MT5 and uploads to the database.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol ticker (e.g. EURUSD, GBPUSD, XAUUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1, H4, D1 (default: M1)',
        },
        count: {
          type: 'number',
          description: 'Number of historical candles to fetch from MT5 (e.g. 100, 250, 500)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'mt5_get_account_history',
    description: 'Retrieve persistent historical account snapshots (balance, equity, margin level %, floating profit) stored in SQLite across time.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum snapshots to return (default: 30)',
        },
      },
    },
  },
  {
    name: 'mt5_get_tick_history',
    description: 'Retrieve persisted historical tick stream data from SQLite with sub-second bids, asks, and spreads.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol filter (e.g. EURUSD), or ALL for all symbols',
        },
        limit: {
          type: 'number',
          description: 'Maximum ticks to return (default: 50)',
        },
      },
    },
  },
  {
    name: 'mt5_simulate_candles',
    description: 'Seed synthetic historical OHLCV candlestick data into the database and precalculate indicators for immediate backtesting or strategy testing without waiting for live ticks.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol to simulate (default: EURUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe: M1, M5, M15, H1 (default: M1)',
        },
        count: {
          type: 'number',
          description: 'Number of candles to generate (default: 60)',
        },
        basePrice: {
          type: 'number',
          description: 'Starting price (default: 1.0850)',
        },
      },
    },
  },
  {
    name: 'mt5_list_strategies',
    description: 'List quantitative trading strategies stored in the persistent SQLite knowledge base. Filterable by symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Filter by symbol (e.g. EURUSD, XAUUSD), or leave empty for all.',
        },
      },
    },
  },
  {
    name: 'mt5_create_strategy',
    description: 'Create or update a quantitative trading strategy in the site knowledge base (e.g. RSI_REVERSAL, EMA_CROSSOVER, MACD_MOMENTUM, MULTI_INDICATOR_CONSENSUS). Strategies can then be backtested against stored MT5 candle history.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Descriptive strategy name',
        },
        description: {
          type: 'string',
          description: 'Strategy thesis and rules',
        },
        type: {
          type: 'string',
          enum: ['RSI_REVERSAL', 'EMA_CROSSOVER', 'MACD_MOMENTUM', 'BOLLINGER_BREAKOUT', 'MULTI_INDICATOR_CONSENSUS', 'CUSTOM_RULESET'],
          description: 'Strategy algorithmic type',
        },
        symbol: {
          type: 'string',
          description: 'Target symbol (e.g. EURUSD, XAUUSD)',
        },
        timeframe: {
          type: 'string',
          description: 'Target timeframe (M1, M5, M15, H1, H4, D1)',
        },
        parameters: {
          type: 'object',
          description: 'Indicator parameters (e.g. rsiOversold: 30, rsiOverbought: 70, fastEmaPeriod: 9, slowEmaPeriod: 21, stopLossPoints: 300, takeProfitPoints: 600, lotSize: 0.1)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Keywords and tags',
        },
        author: {
          type: 'string',
          description: 'Author / Agent attribution (e.g. Claude, AI Agent, Quant)',
        },
        notes: {
          type: 'string',
          description: 'Execution conditions or market insights',
        },
      },
      required: ['name', 'symbol'],
    },
  },
  {
    name: 'mt5_backtest_strategy',
    description: 'Run an algorithmic backtest of a strategy against stored historical MT5 candlestick data. Evaluates trades, win rate, net profit, maximum drawdown, and return equity curve on the site server.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'ID of strategy to test (e.g. strat-rsi-reversal-eurusd)',
        },
        candleLimit: {
          type: 'number',
          description: 'Number of historical candles to run backtest across (default: 300)',
        },
        initialDeposit: {
          type: 'number',
          description: 'Initial deposit capital in USD (default: 10000)',
        },
      },
      required: ['strategyId'],
    },
  },
  {
    name: 'mt5_list_observations',
    description: 'Retrieve observations, market patterns, and research insights stored in the knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['all', 'market_insight', 'pattern', 'execution_note', 'anomaly', 'research'],
          description: 'Filter by category (default: all)',
        },
      },
    },
  },
  {
    name: 'mt5_record_observation',
    description: 'Store a market observation, empirical pattern discovery, or execution insight in the persistent knowledge base for future review and algorithmic strategy design.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Observation headline or pattern name',
        },
        content: {
          type: 'string',
          description: 'Detailed analysis, notes, or empirical finding',
        },
        symbol: {
          type: 'string',
          description: 'Associated ticker symbol (optional)',
        },
        timeframe: {
          type: 'string',
          description: 'Associated timeframe (optional)',
        },
        category: {
          type: 'string',
          enum: ['market_insight', 'pattern', 'execution_note', 'anomaly', 'research'],
          description: 'Category classification',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Categorization tags',
        },
        metrics: {
          type: 'object',
          description: 'Key metrics observed (e.g. avgSpread, winRateBoost)',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'mt5_get_backtest_history',
    description: 'Retrieve archived backtest evaluation runs and performance results from SQLite.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'Filter by strategy ID (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum backtest reports to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'mt5_evaluate_strategy_signals',
    description: 'Evaluate active quantitative strategies against real-time MT5 candlestick data and live quotes. Returns BUY/SELL/NEUTRAL signals with confidence levels, rationale, and dynamic SL/TP levels.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'Optional ID of a specific strategy to evaluate. If omitted, evaluates all active strategies.',
        },
      },
    },
  },
  {
    name: 'mt5_execute_strategy_signal',
    description: 'Execute a quantitative strategy signal through the site command queue. Evaluates current market conditions and pushes an EXECUTE_TRADE order to the MT5 bridge queue for asynchronous EA execution.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'ID of the strategy to execute (e.g. strat-rsi-reversal-eurusd)',
        },
        volume: {
          type: 'number',
          description: 'Custom lot size override (optional, defaults to strategy parameter lotSize)',
        },
      },
      required: ['strategyId'],
    },
  },
  {
    name: 'mt5_delete_strategy',
    description: 'Delete a quantitative strategy by ID from the persistent knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        strategyId: {
          type: 'string',
          description: 'ID of strategy to delete',
        },
      },
      required: ['strategyId'],
    },
  },
  {
    name: 'mt5_delete_observation',
    description: 'Delete a market observation or empirical note by ID from the persistent knowledge base.',
    inputSchema: {
      type: 'object',
      properties: {
        observationId: {
          type: 'string',
          description: 'ID of observation to delete',
        },
      },
      required: ['observationId'],
    },
  },
];

export async function executeMcpTool(name: string, args: Record<string, any> = {}): Promise<any> {
  switch (name) {
    case 'mt5_query_trade_history': {
      const { dbGetOrders } = await import('../database/db.js');
      const limit = args.limit ? Number(args.limit) : 20;
      const orders = await dbGetOrders(limit);
      return {
        count: orders.length,
        orders,
      };
    }

    case 'mt5_get_performance_analytics': {
      const { dbGetAnalytics } = await import('../database/db.js');
      return await dbGetAnalytics();
    }

    case 'mt5_get_current_chart': {
      const chart = tradeStore.getCurrentChart();
      if (!chart) {
        return {
          status: 'awaiting_ea',
          message: 'Awaiting MT5 EA connection to retrieve active chart symbol.',
        };
      }
      return chart;
    }

    case 'mt5_get_all_symbols': {
      const allSyms = tradeStore.getAllSymbols();
      return {
        count: allSyms.length,
        symbols: allSyms,
      };
    }

    case 'mt5_get_account_info': {
      const account = tradeStore.getAccount();
      return {
        login: account.login,
        tradeMode: account.tradeMode,
        balance: account.balance,
        equity: account.equity,
        freeMargin: account.freeMargin,
        margin: account.margin,
        marginLevel: `${account.marginLevel}%`,
        floatingProfit: account.profit,
        currency: account.currency,
        leverage: `1:${account.leverage}`,
        server: account.server,
        lastUpdate: new Date(account.lastUpdate).toISOString(),
      };
    }

    case 'mt5_get_market_data': {
      const ticks = tradeStore.getTicks();
      if (args.symbol && args.symbol.toUpperCase() !== 'ALL') {
        const found = ticks.find((t) => t.symbol.toUpperCase() === args.symbol.toUpperCase());
        if (!found) {
          throw new Error(`Symbol ${args.symbol} not found in tracked market feed.`);
        }
        return found;
      }
      return ticks;
    }

    case 'mt5_get_open_positions': {
      let positions = tradeStore.getPositions();
      if (args.symbol) {
        positions = positions.filter((p) => p.symbol.toUpperCase() === args.symbol.toUpperCase());
      }
      return {
        count: positions.length,
        totalProfit: positions.reduce((acc, p) => acc + p.profit, 0),
        positions,
      };
    }

    case 'mt5_execute_trade': {
      const { symbol, orderType, volume, sl, tp, comment, magic } = args;
      if (!symbol || !orderType || !volume) {
        throw new Error('Missing required arguments: symbol, orderType, volume');
      }

      const res = tradeStore.enqueueCommand({
        action: 'EXECUTE_TRADE',
        // Preserve the original symbol casing — MT5 SymbolSelect is
        // case-sensitive on brokers like Deriv ("Step Index", not "STEP INDEX").
        symbol: String(symbol),
        orderType: String(orderType).toUpperCase() as OrderType,
        volume: Number(volume),
        sl: sl ? Number(sl) : undefined,
        tp: tp ? Number(tp) : undefined,
        comment: comment || 'AI_MCP_TRADE',
        magic: magic ? Number(magic) : 889900,
        source: 'AI_MCP',
      });

      if (!res.success) {
        throw new Error(`Execution rejected by Risk Engine: ${res.error}`);
      }

      return {
        status: 'queued',
        commandId: res.commandId,
        message: `Asynchronous order queued for MT5 EA dispatch. Action: ${orderType} ${volume} ${symbol.toUpperCase()}`,
        timestamp: Date.now(),
      };
    }

    case 'mt5_modify_position': {
      const { ticket, sl, tp } = args;
      if (!ticket) throw new Error('Missing required argument: ticket');

      const res = tradeStore.enqueueCommand({
        action: 'MODIFY_POSITION',
        ticket: Number(ticket),
        sl: sl !== undefined ? Number(sl) : undefined,
        tp: tp !== undefined ? Number(tp) : undefined,
        source: 'AI_MCP',
        comment: 'AI_MCP_MODIFY',
      });

      if (!res.success) {
        throw new Error(`Modify rejected: ${res.error}`);
      }

      return {
        status: 'queued',
        commandId: res.commandId,
        message: `Modification queued for ticket #${ticket}. New SL: ${sl ?? 'unchanged'}, New TP: ${tp ?? 'unchanged'}`,
      };
    }

    case 'mt5_close_position': {
      const { ticket, volume } = args;
      if (!ticket) throw new Error('Missing required argument: ticket');

      const res = tradeStore.enqueueCommand({
        action: 'CLOSE_POSITION',
        ticket: Number(ticket),
        volume: volume ? Number(volume) : undefined,
        source: 'AI_MCP',
        comment: 'AI_MCP_CLOSE',
      });

      if (!res.success) {
        throw new Error(`Close rejected: ${res.error}`);
      }

      return {
        status: 'queued',
        commandId: res.commandId,
        message: `Close order queued for ticket #${ticket}`,
      };
    }

    case 'mt5_close_all': {
      const symbol = args.symbol ? String(args.symbol).toUpperCase() : 'ALL';
      const res = tradeStore.enqueueCommand({
        action: 'CLOSE_ALL',
        symbol: symbol,
        source: 'AI_MCP',
        comment: 'AI_MCP_CLOSE_ALL',
      });

      return {
        status: 'queued',
        commandId: res.commandId,
        message: `Bulk liquidation queued for symbol filter: ${symbol}`,
      };
    }

    case 'mt5_configure_risk_guard': {
      tradeStore.updateRiskGuard(args);
      return {
        status: 'success',
        riskGuard: tradeStore.getRiskGuard(),
      };
    }

    case 'mt5_get_execution_queue': {
      const state = tradeStore.getState();
      const limit = args.limit ? Number(args.limit) : 10;
      return state.commandQueue.slice(0, limit);
    }

    case 'mt5_get_chart_history': {
      const sym = (args.symbol || tradeStore.getCurrentChart()?.symbol || 'EURUSD').toUpperCase();
      const tf = (args.timeframe || tradeStore.getCurrentChart()?.timeframe || 'M1').toUpperCase();
      const limit = args.limit ? Math.min(Number(args.limit), 500) : 60;
      const includeIndicators = args.includeIndicators !== false;

      // First check SQLite database for historical candles
      const { dbGetCandles } = await import('../database/db.js');
      let candles = await dbGetCandles(sym, tf, limit);

      // Fallback to in-memory chartHistory if querying active chart and SQLite has fewer
      if (candles.length === 0 && (!args.symbol || sym === tradeStore.getCurrentChart()?.symbol)) {
        candles = tradeStore.getChartHistory().slice(-limit);
      }

      const { calculateIndicators } = await import('./indicatorEngine.js');
      const indicators = includeIndicators ? calculateIndicators(candles, sym, tf) : null;

      return {
        symbol: sym,
        timeframe: tf,
        count: candles.length,
        candles,
        indicators,
      };
    }

    case 'mt5_get_technical_indicators': {
      const sym = (args.symbol || tradeStore.getCurrentChart()?.symbol || 'EURUSD').toUpperCase();
      const tf = (args.timeframe || tradeStore.getCurrentChart()?.timeframe || 'M1').toUpperCase();

      const { dbGetCandles } = await import('../database/db.js');
      let candles = await dbGetCandles(sym, tf, 200);
      if (candles.length === 0) {
        candles = tradeStore.getChartHistory();
      }

      const { calculateIndicators } = await import('./indicatorEngine.js');
      const indicators = calculateIndicators(candles, sym, tf);
      if (!indicators) {
        return {
          status: 'insufficient_data',
          message: `Insufficient candle history for ${sym} [${tf}]. Need at least 5 candles to compute indicators.`,
          symbol: sym,
          timeframe: tf,
        };
      }
      return indicators;
    }

    case 'mt5_get_pending_orders': {
      let orders = tradeStore.getPendingOrders();
      if (args.symbol) {
        orders = orders.filter((o) => o.symbol.toUpperCase() === args.symbol.toUpperCase());
      }
      return {
        count: orders.length,
        pendingOrders: orders,
      };
    }

    case 'mt5_cancel_pending_order': {
      const ticket = Number(args.ticket);
      if (!ticket) throw new Error('Missing ticket parameter');
      const res = tradeStore.enqueueCommand({
        action: 'CANCEL_PENDING',
        ticket,
        source: 'AI_MCP',
        comment: 'AI_MCP_CANCEL_PENDING',
      });
      return {
        status: res.success ? 'queued' : 'rejected',
        commandId: res.commandId,
        message: `Cancellation queued for pending order #${ticket}`,
      };
    }

    case 'mt5_request_chart_history': {
      const sym = args.symbol || tradeStore.getCurrentChart()?.symbol || 'EURUSD';
      const tf = args.timeframe || tradeStore.getCurrentChart()?.timeframe || 'M1';
      const count = args.count ? Number(args.count) : 100;
      const res = tradeStore.requestHistoryFromEA(sym, tf, count);
      return {
        status: 'dispatched_to_ea',
        commandId: res.commandId,
        message: `Requested ${count} candles for ${sym} [${tf}] from MT5 EA. Data will populate on next sync.`,
      };
    }

    case 'mt5_get_account_history': {
      const limit = args.limit ? Number(args.limit) : 30;
      const { dbGetAccountHistory } = await import('../database/db.js');
      const history = await dbGetAccountHistory(limit);
      return {
        count: history.length,
        history,
      };
    }

    case 'mt5_get_tick_history': {
      const limit = args.limit ? Number(args.limit) : 50;
      const { dbGetTicksHistory } = await import('../database/db.js');
      const ticks = await dbGetTicksHistory(args.symbol, limit);
      return {
        count: ticks.length,
        ticks,
      };
    }

    case 'mt5_simulate_candles': {
      const sym = args.symbol || 'EURUSD';
      const tf = args.timeframe || 'M1';
      const count = args.count ? Number(args.count) : 60;
      const basePrice = args.basePrice ? Number(args.basePrice) : 1.085;
      return await tradeStore.seedCandles(sym, tf, count, basePrice);
    }

    case 'mt5_list_strategies': {
      const { dbGetStrategies } = await import('../database/db.js');
      const strategies = await dbGetStrategies(args.symbol);
      return {
        count: strategies.length,
        strategies,
      };
    }

    case 'mt5_create_strategy': {
      const { dbSaveStrategy } = await import('../database/db.js');
      const stratId = args.id || `strat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const strategyData = {
        id: stratId,
        name: args.name,
        description: args.description || '',
        type: args.type || 'RSI_REVERSAL',
        symbol: (args.symbol || 'EURUSD').toUpperCase(),
        timeframe: (args.timeframe || 'M1').toUpperCase(),
        parameters: args.parameters || {},
        status: args.status || 'active',
        tags: args.tags || [],
        author: args.author || 'AI_Agent',
        notes: args.notes || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await dbSaveStrategy(strategyData);
      return {
        success: true,
        strategy: strategyData,
        message: `Strategy "${strategyData.name}" created and stored in SQLite knowledge base.`,
      };
    }

    case 'mt5_backtest_strategy': {
      const { dbGetStrategyById, dbGetCandles, dbSaveBacktestResult } = await import('../database/db.js');
      const { runStrategyBacktest } = await import('../services/strategyEngine.js');

      const strategy = await dbGetStrategyById(args.strategyId);
      if (!strategy) throw new Error(`Strategy ${args.strategyId} not found`);

      const candleLimit = args.candleLimit ? Number(args.candleLimit) : 300;
      const initialDeposit = args.initialDeposit ? Number(args.initialDeposit) : 10000;

      let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, candleLimit);
      if (candles.length < 20) {
        const live = tradeStore.getChartHistory();
        if (live && live.length >= 20) {
          candles = live;
        } else {
          // Auto-seed synthetic candles for smooth testing experience
          const seeded = await tradeStore.seedCandles(strategy.symbol, strategy.timeframe, 100);
          candles = seeded.candles;
        }
      }

      const backtest = runStrategyBacktest(strategy, candles, initialDeposit);
      await dbSaveBacktestResult(backtest);

      return {
        success: true,
        summary: {
          strategyName: backtest.strategyName,
          symbol: backtest.symbol,
          timeframe: backtest.timeframe,
          candleCount: backtest.candleCount,
          initialDeposit: backtest.initialDeposit,
          finalEquity: backtest.finalEquity,
          netProfit: backtest.netProfit,
          profitFactor: backtest.profitFactor,
          winRatePct: `${backtest.winRatePct}%`,
          totalTrades: backtest.totalTrades,
          winningTrades: backtest.winningTrades,
          losingTrades: backtest.losingTrades,
          maxDrawdownPct: `${backtest.maxDrawdownPct}%`,
          maxDrawdownUsd: backtest.maxDrawdownUsd,
          averageTradeProfit: backtest.averageTradeProfit,
          riskRewardRatio: backtest.riskRewardRatio,
        },
        backtestId: backtest.id,
        trades: backtest.trades,
      };
    }

    case 'mt5_list_observations': {
      const { dbGetObservations } = await import('../database/db.js');
      const observations = await dbGetObservations(args.category);
      return {
        count: observations.length,
        observations,
      };
    }

    case 'mt5_record_observation': {
      const { dbSaveObservation } = await import('../database/db.js');
      const obsId = args.id || `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const obs = {
        id: obsId,
        title: args.title,
        content: args.content,
        symbol: args.symbol ? args.symbol.toUpperCase() : null,
        timeframe: args.timeframe ? args.timeframe.toUpperCase() : null,
        strategyId: args.strategyId || null,
        category: args.category || 'market_insight',
        tags: args.tags || [],
        metrics: args.metrics || {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await dbSaveObservation(obs);
      return {
        success: true,
        observation: obs,
        message: `Market observation "${obs.title}" logged to persistent knowledge base.`,
      };
    }

    case 'mt5_get_backtest_history': {
      const { dbGetBacktestResults } = await import('../database/db.js');
      const limit = args.limit ? Number(args.limit) : 20;
      const results = await dbGetBacktestResults(args.strategyId, limit);
      return {
        count: results.length,
        results,
      };
    }

    case 'mt5_evaluate_strategy_signals': {
      const { evaluateAllActiveStrategies, evaluateLiveSignal } = await import('./strategyEngine.js');
      const { dbGetStrategyById, dbGetCandles } = await import('../database/db.js');

      if (args.strategyId) {
        const strategy = await dbGetStrategyById(args.strategyId);
        if (!strategy) throw new Error(`Strategy not found: ${args.strategyId}`);
        let candles = await dbGetCandles(strategy.symbol, strategy.timeframe, 100);
        if (candles.length < 15) {
          const liveHistory = tradeStore.getChartHistory();
          if (liveHistory && liveHistory.length >= 15) candles = liveHistory;
        }
        const tick = tradeStore.getTicks()[strategy.symbol];
        const signal = evaluateLiveSignal(strategy, candles, tick ? { bid: tick.bid, ask: tick.ask } : undefined);
        return {
          evaluatedCount: 1,
          signals: [signal],
        };
      }

      const signals = await evaluateAllActiveStrategies();
      return {
        evaluatedCount: signals.length,
        actionableCount: signals.filter((s) => s.signal !== 'NEUTRAL').length,
        signals,
      };
    }

    case 'mt5_execute_strategy_signal': {
      if (!args.strategyId) throw new Error('Missing required parameter: strategyId');
      const { executeStrategySignal } = await import('./strategyEngine.js');
      const result = await executeStrategySignal(args.strategyId, args.volume);
      return result;
    }

    case 'mt5_delete_strategy': {
      if (!args.strategyId) throw new Error('Missing required parameter: strategyId');
      const { dbDeleteStrategy } = await import('../database/db.js');
      await dbDeleteStrategy(args.strategyId);
      return {
        success: true,
        message: `Strategy ${args.strategyId} deleted from persistent knowledge base.`,
      };
    }

    case 'mt5_delete_observation': {
      if (!args.observationId) throw new Error('Missing required parameter: observationId');
      const { dbDeleteObservation } = await import('../database/db.js');
      await dbDeleteObservation(args.observationId);
      return {
        success: true,
        message: `Observation ${args.observationId} deleted from persistent knowledge base.`,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Handle JSON-RPC 2.0 MCP requests
export async function handleMcpJsonRpc(body: any): Promise<any> {
  const { jsonrpc, id, method, params } = body;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'mt5-ai-mcp-bridge',
          version: '2.10.0',
        },
      },
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    try {
      const toolResult = await executeMcpTool(name, toolArgs || {});
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolResult, null, 2),
            },
          ],
          isError: false,
        },
      };
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${err?.message || String(err)}`,
            },
          ],
          isError: true,
        },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  };
}
