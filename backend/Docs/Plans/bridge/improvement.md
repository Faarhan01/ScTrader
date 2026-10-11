# Bridge Improvement — Fill the Gaps

## What the Bridge Can Already Do

The Python bridge (`backend/Tools/Bridge/`) wraps the `MetaTrader5` PyPI package. Its `MT5Service` exposes:

| Method                                         | MT5 API call                           | What it returns                                     |
| :--------------------------------------------- | :------------------------------------- | :-------------------------------------------------- |
| `get_account()`                                | `mt5.account_info()`                   | Login, balance, equity, margin, profit, leverage    |
| `get_symbols()`                                | `mt5.symbols_get()`                    | All symbols with name, description, digits, point   |
| `get_tick(symbol)`                             | `mt5.symbol_info_tick(symbol)`         | Bid, ask, time for one symbol                       |
| `get_history(symbol, count, tf)`               | `mt5.copy_rates_from()`                | OHLCV candles, falls back to `copy_ticks_from()`    |
| `get_history_by_range(symbol, tf, start, end)` | `mt5.copy_rates_range()`               | OHLCV in a time window                              |
| `get_positions()`                              | `mt5.positions_get()`                  | All open positions with SL, TP, profit, swap, magic |
| `place_trade()`                                | `mt5.order_send()`                     | Direct market execution (synchronous)               |
| `close_trade(ticket)`                          | `mt5.order_send()`                     | Close a position by ticket                          |
| `close_all_positions()`                        | `mt5.positions_get()` + `order_send()` | Close all or by symbol                              |
| `modify_position(ticket, sl, tp)`              | `mt5.order_send(TRADE_ACTION_SLTP)`    | Modify SL/TP on an open position                    |
| `apply_trailing_stop()`                        | `modify_position()` in a loop          | Adjust SL based on trailing distance                |
| `get_symbol_info(symbol)`                      | `mt5.symbol_info(symbol)`              | Full symbol properties                              |

Additional bridge services provide:
- `StrategyService`: Full CRUD + versioning for trading strategies
- `BacktestService`: Runs strategy backtests with performance metrics
- `CandleIngestionService`: Pulls and stores OHLCV data in SQLite
- `TradingBot`: Evaluates strategies and auto-executes trades
- `EABridgeService`: Replicates EA data flow by pushing data to external endpoints
- `Database`: SQLite persistence layer for all bridge data

## Current Limitations and Gaps

Despite exposing most of the MT5 API, the bridge has these genuine limitations:

### 1. Live Data Streaming Constraints
- **Polling-based only**: No native event subscriptions in MT5 Python API; must poll MT5 for data
- **Default interval**: 1.5 seconds for `EABridgeService` (can be reduced to ~50ms but increases API load)
- **No push notifications**: Cannot receive real-time updates from MT5 without polling

### 2. Inefficient Multi-Symbol Operations
- **Per-symbol queries**: Each symbol requires individual API calls (e.g., `get_tick()` called per symbol)
- **No batching**: Cannot retrieve data for multiple symbols in a single MT5 API call
- **Redundant overhead**: Symbol visibility checks and data conversion repeated per symbol

### 3. Synchronous Trade Execution
- **Blocking operations**: `place_trade()`, `close_trade()`, etc. block until MT5 returns result
- **No queuing**: Cannot submit multiple trades and handle results asynchronously
- **Limited throughput**: Trade execution speed constrained by round-trip latency

### 4. Lack of Persistent State
- **Restart sensitivity**: On bridge restart, all state (positions, orders, etc.) must be re-queried from MT5
- **No incremental sync**: Cannot efficiently reconcile bridge state with MT5 state after downtime
- **Startup delay**: Initial synchronization requires full state reconstruction from MT5

### 5. Manual Strategy Execution
- **On-demand only**: `TradingBot.run_cycle()` must be manually invoked or externally scheduled
- **No built-in scheduling**: Requires external cron/scheduler for automated strategy evaluation
- **No persistence**: Bot state (last run time, etc.) not preserved across restarts

### 6. Historical Data Constraints
- **MT5-dependent**: Limited to what MT5 has cached in its internal history database
- **No external storage**: Bridge does not maintain its own historical data archive
- **Retention limits**: Cannot access data beyond MT5's internal history limits

### 7. Symbol Discovery Limitations
- **Watchlist-bound**: Can only query symbols currently visible in MT5's Market Watch
- **Manual intervention**: Requires `symbol_select()` calls to make symbols visible before querying
- **No auto-discovery**: Cannot automatically detect and track newly available symbols

## Suggested Enhancements (Bridge-Focused)

Each enhancement should be implemented as a separate, modular component focusing strictly on bridge capabilities.

### 1. WebSocket Server for Live Event Streaming

**Purpose**: Enable efficient real-time data delivery to clients while minimizing MT5 API load.

**Implementation**:
- Add WebSocket server (using `websockets` or FastAPI WebSocket support)
- Implement background polling task fetching tick/account/position data at configurable interval
- Manage WebSocket connections and broadcast updates to connected clients
- Define message schemas: `tick`, `account`, `positions`, `symbols`, `history`, `market_depth`
- Add configuration for polling interval and enabled data streams

### 2. Symbol Metadata Cache

**Purpose**: Reduce redundant MT5 API calls when querying multiple symbols.

**Implementation**:
- Create thread-safe cache for symbol metadata (name, description, digits, point, etc.)
- Integrate cache into `MT5Service` methods (`get_symbol_info`, `get_tick`, `get_history`)
- Add automatic `symbol_select()` when symbol is not visible in Market Watch
- Implement cache statistics (hit/miss rates) and monitoring
- Add cache invalidation strategy (e.g., cache until symbol properties change)

### 3. Asynchronous Trading Mode

**Purpose**: Enable non-blocking trade execution with queued orders and callback-based results.

**Implementation**:
- Create `AsyncTraderService` managing in-memory trade queue
- Implement methods: `submit_trade(request)`, `cancel_trade(ticket)`, `get_trade_status(ticket)`
- Use background thread to process queue via `mt5.order_send`
- Report results via configurable callbacks (WebSocket/HTTP webhook)
- Add API endpoints: `POST /trade/async` for submitting/managing async trades
- Implement error handling and retry mechanisms for failed submissions

### 4. Bridge-Side State Persistence

**Purpose**: Enable faster startup and recovery by persisting bridge state across restarts.

**Implementation**:
- Create `StatePersistenceService` using SQLite or file-based storage
- Implement methods: `save_state(state)`, `load_state()`, `update_incrementally(changes)`
- Persist after significant changes (position open/close, order placement, account updates)
- On startup: load persisted state and reconcile with current MT5 state
- Add configuration to enable/disable persistence and set reconciliation strategies

### 5. Integrated Strategy Scheduler

**Purpose**: Enable fully automated strategy evaluation without external scheduling.

**Implementation**:
- Create `SchedulerService` wrapping `TradingBot` with background scheduling
- Implement methods: `start_scheduled_bot(symbol, timeframe, interval)`, `stop_scheduled_bot()`
- Use APScheduler or similar for reliable background job execution
- Log bot activity and handle exceptions gracefully
- Expose via API endpoints: `POST /bot/start`, `POST /bot/stop`
- Add configuration for schedule intervals, symbols, and timeframes

### 6. External Historical Data Store

**Purpose**: Cache historical data beyond MT5's internal retention limits.

**Implementation**:
- Create `HistoricalStoreService` for managing tick and candle data
- Implement methods: `save_ticks/get_ticks`, `save_candles/get_candles`
- Integrate as fallback in `MT5Service` when MT5 returns empty historical data
- Implement background task to pull/store data for configured symbols/timeframes
- Add configuration for storage paths, retention policies, and archiving

## Benefits

- **Enhanced real-time capabilities**: WebSocket server provides efficient live data streaming
- **Reduced API overhead**: Symbol cache minimizes redundant MT5 calls for multi-symbol queries
- **Improved trade throughput**: Async trading mode enables non-blocking order execution
- **Faster recovery**: State persistence reduces startup time and improves fault tolerance
- **Automated operations**: Integrated scheduler enables hands-off strategy execution
- **Extended historical access**: External data store overcomes MT5's internal retention limits

## Implementation Principles

1. **Bridge-centric focus**: Each enhancement improves bridge capabilities without assuming EA functionality
2. **Modular design**: Implement as separate services with clear interfaces
3. **Backward compatibility**: All enhancements optional; existing integrations remain functional
4. **Performance-aware**: Minimize MT5 API calls and computational overhead
5. **Reliability-first**: Include error handling, retry mechanisms, and graceful degradation
6. **Configuration-driven**: Make features tunable via constructor parameters or options objects
7. **Testability**: Design for easy unit testing with mockable dependencies