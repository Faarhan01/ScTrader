# MT5 Python Bridge

Direct Python bridge to a locally running MetaTrader 5 terminal via the
official `MetaTrader5` PyPI package. No Expert Advisor (MQL5) required.

## Layout

```
backend/Tools/Bridge/
├── README.md
├── mt5/                          # Actual MT5 bridge (isolated)
│   ├── services/
│   │   ├── mt5_service.py        # MT5 API wrapper (place/close/modify/ticks/history)
│   │   ├── database.py           # SQLite persistence
│   │   ├── strategy_service.py   # Strategy CRUD + versioning
│   │   ├── backtest_service.py   # Backtest runner
│   │   ├── candle_service.py     # Candle ingestion
│   │   ├── ea_generator.py       # EA template generator
│   │   ├── bot.py                # Automated trading bot
│   │   └── ea_bridge.py          # EA data flow replica
│   ├── database/                 # bridge.db
│   ├── generated/                # Generated EA files
│   ├── scripts/
│   └── templates/                # EA template
└── app/                          # Site integration layer (isolated)
    ├── __init__.py
    ├── integration.py            # Adapts site trade requests to bridge calls
    ├── client.py                 # Lets the bridge talk to the site
    └── server.py                 # HTTP wrapper so the site talks to the bridge
```

The bridge (`mt5/`) never imports the site, and the site never imports the
bridge — they only communicate through the wrappers in `app/`.

## Setup

1. MT5 must be running with Algorithmic Trading enabled.
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn requests MetaTrader5
   ```
3. Run the bridge HTTP server:
   ```bash
   python -m app.server
   ```
   Starts on `http://127.0.0.1:5000`.

## Endpoints

- `GET /health`, `/account`, `/positions`, `/symbols`, `/tick?symbol=X`,
  `/history?symbol=X&count=N&timeframe=1`
- `POST /trade` body: `{"type":"BUY","symbol":"X","lot":0.1,"sl":10,"tp":20}`
- `POST /close` body: `{"ticket":123}`
- `POST /close-all` body: `{"symbol":"X"}` (omit symbol for all)
- `POST /modify` body: `{"ticket":123,"sl":10,"tp":20}`

Trade actions require `Authorization: Bearer <api_key>`.

## What the bridge can pull

All data verified live against a Deriv demo account (login 29974125).

### Account info

`mt5.account_info()` returns a full `AccountInfo` struct:

| Field | Description |
| :--- | :--- |
| `login` | Account login number |
| `balance` | Current balance |
| `equity` | Current equity (balance + floating P&L) |
| `margin` | Used margin |
| `margin_free` | Free margin available |
| `margin_level` | Margin level percentage |
| `leverage` | Account leverage |
| `currency` | Account currency |
| `server` | Broker server name |
| `company` | Broker company name |
| `trade_mode` | Trade mode (0=DEMO, 1=REAL, 2=CONTEST) |
| `trade_allowed` | Whether trading is allowed |
| `trade_expert` | Whether expert advisors are allowed |
| `credit` | Credit line (if any) |
| `commission_blocked` | Whether commission is blocked |
| `name` | Account holder name |
| `margin_mode` | Margin calculation mode |
| `margin_initial` | Initial margin requirement |
| `margin_maintenance` | Maintenance margin requirement |
| `margin_so_call` | Margin call threshold |
| `margin_so_mode` | Stop-out mode |
| `margin_so_so` | Stop-out level |
| `liabilities` | Liabilities |
| `limit_orders` | Limit on pending orders |
| `fifo_close` | FIFO close mode |
| `assets` | Account assets |

### All symbols

`mt5.symbols_get()` returns every symbol available in the terminal's Market
Watch — verified 731 symbols on Deriv demo.

| Field | Description |
| :--- | :--- |
| `name` | Symbol name (e.g. "Step Index 200") |
| `bid` | Current bid price |
| `ask` | Current ask price |
| `digits` | Number of decimal places |
| `point` | Symbol point value |
| `spread` | Current spread in points |
| `trade_mode` | Trade mode (DISABLED, FULL, CLOSEONLY, LONGONLY, SHORTONLY) |
| `trade_calc_mode` | Margin calculation mode (FOREX, CFD, FUTURES, etc.) |
| `swap_mode` | Swap calculation mode (CURRENCY_DEPOSIT, INTEREST_CURRENT, etc.) |
| `swap_long` | Swap rate for long positions |
| `swap_short` | Swap rate for short positions |
| `margin_initial` | Initial margin per lot |
| `margin_maintenance` | Maintenance margin per lot |
| `lot_min` | Minimum lot size |
| `lot_max` | Maximum lot size |
| `lot_step` | Lot size step |
| `contract_size` | Contract size per lot |
| `tick_value` | Tick value in account currency |

### Full symbol info

`mt5.symbol_info(symbol)` returns the complete `SymbolInfo` struct for any
symbol, including `SYMBOL_TRADE_MODE`, `SYMBOL_CALC_MODE`, swap rates,
margin requirements, and lot constraints.

### Live tick

`mt5.symbol_info_tick(symbol)` returns a `Tick` struct:

| Field | Description |
| :--- | :--- |
| `bid` | Current bid price |
| `ask` | Current ask price |
| `last` | Last traded price |
| `volume` | Current volume |
| `time` | Tick time (Unix seconds) |
| `time_msc` | Tick time (Unix milliseconds) |
| `flags` | Tick flags (TICK_FLAG_BID, TICK_FLAG_ASK, TICK_FLAG_LAST, TICK_FLAG_VOLUME, TICK_FLAG_BUY, TICK_FLAG_SELL) |
| `volume_real` | Real volume |

### All open positions

`mt5.positions_get()` returns every open position across all symbols:

| Field | Description |
| :--- | :--- |
| `ticket` | Position ticket number |
| `symbol` | Symbol name |
| `type` | Position type (POSITION_TYPE_BUY or POSITION_TYPE_SELL) |
| `volume` | Position volume in lots |
| `price_open` | Open price |
| `price_current` | Current price |
| `sl` | Stop loss price |
| `tp` | Take profit price |
| `profit` | Current floating profit |
| `swap` | Accumulated swap |
| `commission` | Accumulated commission |
| `magic` | Expert magic number |
| `comment` | Position comment |
| `time` | Open time (Unix seconds) |
| `reason` | Position open reason (POSITION_REASON_CLIENT, POSITION_REASON_EXPERT, etc.) |

### All pending orders

`mt5.orders_get()` returns every pending order in the terminal:

| Field | Description |
| :--- | :--- |
| `ticket` | Order ticket number |
| `symbol` | Symbol name |
| `type` | Order type (ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_SELL_STOP, etc.) |
| `volume` | Order volume in lots |
| `price_open` | Order open price |
| `price_current` | Current price |
| `sl` | Stop loss price |
| `tp` | Take profit price |
| `magic` | Expert magic number |
| `comment` | Order comment |
| `time_setup` | Order setup time (Unix seconds) |
| `state` | Order state (STATE_PLACED, STATE_REQUEST_ADD, STATE_REQUEST_CANCEL, etc.) |
| `type_time` | Order expiration type (ORDER_TIME_GTC, ORDER_TIME_DAY, etc.) |
| `type_filling` | Order filling type (ORDER_FILLING_FOK, ORDER_FILLING_IOC, etc.) |

### Deal history

`mt5.history_deals_get(from, to)` returns every deal executed in the terminal —
verified 698 deals on the Deriv demo account:

| Field | Description |
| :--- | :--- |
| `ticket` | Deal ticket number |
| `order` | Order ticket the deal belongs to |
| `position_id` | Position ID |
| `symbol` | Symbol name |
| `type` | Deal type (DEAL_TYPE_BUY, DEAL_TYPE_SELL, DEAL_TYPE_BALANCE, etc.) |
| `entry` | Deal entry type (DEAL_ENTRY_IN, DEAL_ENTRY_OUT, DEAL_ENTRY_INOUT, etc.) |
| `volume` | Deal volume |
| `price` | Deal execution price |
| `profit` | Deal profit |
| `commission` | Deal commission |
| `swap` | Deal swap |
| `fee` | Deal fee |
| `reason` | Deal reason (DEAL_REASON_CLIENT, DEAL_REASON_EXPERT, DEAL_REASON_SL, DEAL_REASON_TP, DEAL_REASON_SO, DEAL_REASON_VMARGIN, DEAL_REASON_ROLLOVER, DEAL_REASON_WEB, DEAL_REASON_MOBILE, DEAL_REASON_SPLIT, DEAL_REASON_TAX, DEAL_REASON_DIVIDEND, DEAL_REASON_CORRECTION, DEAL_REASON_CHARGE, DEAL_REASON_COMMISSION, etc.) |
| `time` | Deal time (Unix seconds) |
| `time_msc` | Deal time (Unix milliseconds) |
| `comment` | Deal comment |
| `magic` | Expert magic number |
| `external_id` | External order ID |

### Order history

`mt5.history_orders_get(from, to)` returns every order ever placed —
verified 698 orders on the Deriv demo account:

| Field | Description |
| :--- | :--- |
| `ticket` | Order ticket number |
| `symbol` | Symbol name |
| `type` = Order type |
| `volume` | Order volume |
| `price_open` | Order open price |
| `sl` | Stop loss price |
| `tp` | Take profit price |
| `magic` | Expert magic number |
| `comment` | Order comment |
| `time_setup` = Order setup time |
| `state` = Order state (STATE_PLACED, STATE_REQUEST_ADD, STATE_REQUEST_CANCEL, STATE_REQUEST_MODIFY, STATE_STARTED, STATE_FILLED, STATE_PARTIAL, STATE_CANCELED, STATE_EXPIRED, STATE_REJECTED) |
| `type_time` = Order expiration type |
| `type_filling` = Order filling type |

### Tick history (range)

`mt5.copy_ticks_from(symbol, from, count, flags)` returns raw ticks from MT5's
history database:

| Field | Description |
| :--- | :--- |
| `time` | Tick time (Unix seconds) |
| `time_msc` = Tick time (Unix milliseconds) |
| `bid` = Bid price at tick |
| `ask` = Ask price at tick |
| `last` = Last traded price at tick |
| `volume` = Volume at tick |
| `volume_real` = Real volume at tick |
| `flags` = Tick flags |
`mt5.copy_ticks_range(symbol, from, to, flags)` returns ticks within a time
window. No retention cap — pulls from the full MT5 history database.

### Bulk candles

`mt5.copy_rates_from(symbol, timeframe, from, count)` returns OHLCV bars for
any symbol and timeframe:

| Field | Description |
| :--- | :--- |
| `time` | Bar time (Unix seconds) |
| `open` | Open price |
| `high` | High price |
| `low` = Low price |
| `close` = Close price |
| `volume` = Volume |

Timeframes supported: M1, M2, M3, M4, M5, M6, M10, M12, M15, M20, M30, H1,
H2, H3, H4, H6, H8, H12, D1, W1, MN1.

`mt5.copy_rates_from_pos(symbol, timeframe, start_pos, count)` returns bars
starting from a specific bar index.

`mt5.copy_rates_range(symbol, timeframe, from, to)` returns bars within a
time window.

### Market depth (DOM)

`mt5.market_book_get(symbol)` returns the full order book for any symbol:

| Field | Description |
| :--- | :--- |
| `type` = Book entry type (BOOK_TYPE_BUY, BOOK_TYPE_SELL, BOOK_TYPE_BUY_MARKET, BOOK_TYPE_SELL_MARKET) |
| `price` | Book price level |
| `volume` | Volume at that level |
| `volume_real` = Real volume at that level |

### Terminal info

`mt5.terminal_info()` returns the full `TerminalInfo` struct:

| Field | Description |
| :--- | :--- |
| `company` | Broker company name |
| `name` | Terminal name |
| `path` | Terminal installation path |
| `data_path` | Terminal data path |
| `build` | Terminal build number |
| `language` = Terminal language |
| `codepage` = Terminal codepage |
| `connected` = Whether connected to broker |
| `trade_allowed` = Whether trading is allowed |
| `tradeapi_disabled` | Whether Trade API is disabled |
| `email_enabled` | Whether email notifications are enabled |
| `ftp_enabled` | Whether FTP is enabled |
| `notifications_enabled` | Whether notifications are enabled |
| `dlls_allowed` | Whether DLL imports are allowed |
| `maxbars` | Maximum bars in chart |
| `ping_last` | Last ping time |
| `retransmission` | Retransmission setting |
| `community_account` | Whether community account is enabled |
| `community_balance` | Whether community balance is shown |
| `community_connection` = Whether community connection is enabled |
| `mqid` = MQL5 ID |

## What the bridge can do

### Place a trade

`mt5.order_send(request)` executes a market order synchronously. Returns
`OrderSendResult` with:

| Field | Description |
| :--- | :--- |
| `retcode` | Return code (TRADE_RETCODE_DONE = success) |
| `order` | Order ticket number |
| `deal` | Deal ticket number |
| `price` | Execution price |
| `volume` | Executed volume |
| `comment` | Broker comment |
| `request` | The original request that was sent |
| `request_id` = Request ID |
| `retcode_external` = External return code |
| `bid` | Bid at time of execution |
| `ask` = Ask at time of execution |

Request body:

```json
{
  "action": "TRADE_ACTION_DEAL",
  "symbol": "Step Index",
  "volume": 0.1,
  "type": "ORDER_TYPE_BUY",
  "price": 7339.3,
  "deviation": 10,
  "magic": 889900,
  "comment": "AI trade",
  "type_time": "ORDER_TIME_GTC",
  "type_filling": "ORDER_FILLING_FOK"
}
```

SL/TP are expressed in points (e.g. 10 = 10 points), not absolute price
levels. The bridge converts them:

```
sl_price = price - sl * point  # for BUY
tp_price = price + tp * point  # for BUY
```

### Close a position

`mt5.order_send(request)` with `TRADE_ACTION_DEAL`, opposite order type, and
`position` field set to the position ticket. Closes the full position volume.

### Close all positions

Iterate `mt5.positions_get()` and close each one individually.

### Modify SL/TP

`mt5.order_send(request)` with `TRADE_ACTION_SLTP`:

```json
{
  "action": "TRADE_ACTION_SLTP",
  "position": 12345678,
  "symbol": "Step Index",
  "sl": 10500.0,
  "tp": 10650.0,
  "magic": 889900
}
```

### Apply trailing stops

`apply_trailing_stop(symbol, magic, trailing_stop, trailing_step)` iterates open
positions and adjusts SL based on price movement:
- For BUY positions: new SL = current bid - trailing_stop * point
- For SELL positions: new SL = current ask + trailing_stop * point
- Only updates if the new SL is better than the current SL

### Pre-trade validation

`mt5.order_check(request)` validates a trade request against broker rules
before sending. Returns `OrderCheckResult`:

| Field | Description |
| :--- | :--- |
| `retcode` | 0 = valid, non-zero = invalid |
| `balance` = Projected account balance |
| `equity` = Projected account equity |
| `margin` = Required margin |
| `margin_free` = Projected free margin |
| `margin_level` = Projected margin level |
| `profit` = Projected profit |
| `comment` = Broker comment ("Done" = valid) |
| `request` = The request that was checked |

### Pre-trade margin and profit projection

`mt5.order_calc_margin(action, symbol, volume, price)` returns the margin
required for a trade. `mt5.order_calc_profit(action, symbol, volume, price,
sl, tp)` returns the projected profit including SL/TP.

### Candle ingestion

`CandleIngestionService.ingest_symbol(symbol, timeframe, count)` pulls
OHLCV bars from MT5 and stores them in the bridge's SQLite database
(`market_candles` table). Supports bulk ingestion across multiple symbols.

### Backtest

`BacktestService.run_backtest(strategy_id, symbol, timeframe, from_date, to_date,
initial_balance)` runs a strategy against historical candles and returns:

| Field | Description |
| :--- | :--- |
| `totalTrades` | Total number of trades |
| `wins` = Number of winning trades |
| `losses` = Number of losing trades |
| `winRate` = Win rate percentage |
| `profitFactor` = Gross profit / gross loss |
| `maxDrawdown` = Maximum drawdown percentage |
| `avgWin` = Average winning trade |
| `avgLoss` = Average losing trade |
| `finalBalance` = Final account balance |
| `trades` = Full trade list with open/close prices and P&L |

### Strategy management

`StrategyService` provides full CRUD:

| Method | Description |
| :--- | :--- |
| `create_strategy(name, description, mode, rules, params, symbols)` | Create a new strategy |
| `get_strategy(strategy_id)` = Get a strategy with its assigned symbols |
| `list_strategies()` = List all strategies |
| `activate_strategy(strategy_id)` = Set a strategy as active |
| `get_active_strategy()` = Get the currently active strategy |
| `update_strategy(strategy_id, updates)` = Update a strategy |
| `delete_strategy(strategy_id)` = Delete a strategy |
| `validate_strategy(strategy_id)` = Validate a strategy against its assigned symbols |
| `create_version(strategy_id)` = Snapshot a strategy as a new version |

Strategies have: id, name, description, mode (CUSTOM, RSI, MA, etc.), rules
(list of {condition, action}), params (lot, sl, tp), active flag, version
number, parent_id for versioning, and assigned symbols.

### Automated trading bot

`TradingBot.run_cycle(symbol, timeframe, count)` evaluates the active strategy
against live candles and auto-executes trades:
1. Fetches candles from MT5
2. Evaluates strategy rules (RSI, MA, breakout, custom conditions)
3. If a signal is generated and no position is open, executes the trade
4. Records the trade in the bridge database

Strategy conditions supported:
- RSI < 30 (oversold) / RSI > 70 (overbought)
- close > MA / close < MA
- Breakout above 20-bar resistance
- Uptrend/downtrend continuation (3-bar pattern)
- Custom rules with condition strings

### EA data flow replica

`EABridgeService` replicates what an Expert Advisor would push to a site:

| EA action | Bridge replacement |
| :--- | :--- |
| Poll for commands | `poll_commands()` — GET /poll |
| Push live tick | `send_tick(symbol)` — POST /api/ea/tick |
| Push bulk candles | `send_bulk_candles(symbol, count)` — POST /api/market/bulk-candles |
| Push open positions | `send_positions(symbol?)` — POST /api/ea/positions |
| Push execution confirmations | `send_confirmations(list)` — POST /api/ea/confirm |
| Push logs | `send_logs(list)` — POST /api/ea/logs |

Runs in a background thread at a configurable interval (default 1.5s).

### EA template generator

`EaGenerator.generate(symbols, is_active, magic, lot_size, sl_points, tp_points,
send_history, send_ticks, candle_count, tick_count)` generates a complete MQL5
Expert Advisor from a template, configured for the given symbols and parameters.

## What the bridge cannot do

### Live streaming

The MT5 Python API has no event subscriptions. There is no `on_tick`
callback, no webhook, no push notification. The bridge must poll MT5 to get
data. It cannot stream live ticks the way an Expert Advisor running inside
MT5 can.

The `EABridgeService` polls at 1.5s by default. This can be tightened to 50ms,
but it remains polling — not event-driven.

### Multi-symbol bulk in one call

The EA sends all tracked symbols (27 on Deriv demo) in a single HTTP POST.
The bridge queries one symbol at a time via `symbol_info_tick()`. To get the
full multi-symbol picture, the bridge must make 27 individual API calls.

### Async execution

The EA queues commands and reports execution results asynchronously in the
next sync cycle. The bridge's `order_send` is synchronous — it blocks until
MT5 returns a result. This is actually an advantage for pre-trade validation,
but it means the bridge cannot queue and dispatch like the EA can.

### Position tracking across restarts

The bridge reads positions from MT5 on demand. It does not maintain its own
position state across restarts — it always queries the terminal.

### Strategy execution on a schedule

The `TradingBot` runs on demand via `run_cycle()`. It is not a scheduled
service — there is no built-in cron loop. To run it automatically, you must
call `run_cycle()` in your own scheduler.

### Historical data beyond MT5's retention

`copy_ticks_from` and `copy_rates_from` pull from MT5's internal history
database. If MT5 has not cached ticks or bars for a symbol, the bridge
returns nothing. The bridge does not have its own historical data store —
it relies on the terminal.

### Symbol discovery

The bridge queries symbols that exist in the terminal's Market Watch. It
cannot discover symbols that are not visible in MT5. The `ensure_symbol_visible`
method calls `symbol_select(symbol, True)` to make a symbol visible before
querying it.

## Dependencies

| Package | Purpose |
| :--- | :--- |
| `MetaTrader5` | Official MT5 Python API |
| `fastapi` | HTTP server (`app/server.py`) |
| `uvicorn` | ASGI server for FastAPI |
| `requests` | HTTP client for site communication (`app/client.py`) |
| `websocket-client` | Optional WebSocket client for live events |

## Running

```bash
# Install dependencies
pip install fastapi uvicorn requests MetaTrader5

# Run the HTTP server
python -m app.server

# Use directly in Python
from backend.bridge.mt5.services.mt5_service import MT5Service
svc = MT5Service()
print(svc.get_account())
print(svc.place_trade("Step Index", "BUY", 0.1, sl=10, tp=20))
```