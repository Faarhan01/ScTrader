# Native MetaTrader5 Python Package

## Overview
The `MetaTrader5` package is the official native Python library provided by MetaQuotes for direct integration with the MetaTrader 5 terminal. It enables Python applications to communicate directly with a running MT5 instance through inter-process memory sharing, eliminating the need for Expert Advisor (EAs) or bridge middleware.

## Installation
```bash
pip install MetaTrader5
```
The package is installed in the Python site-packages directory and is available for import in any Python environment where it's installed.

## How It Works
The `MetaTrader5` package uses **inter-process memory sharing** to hook directly into the locally running MT5 terminal instance. This provides:
- Direct access to all MT5 API functions
- Minimal latency (no network hops, no serialization delays)
- Real-time data access
- Full account, symbol, position, order, and trade capabilities

## Key Features & Capabilities

### Connection Management
- `mt5.initialize()`: Establishes connection to running MT5 terminal
- `mt5.shutdown()`: Closes the connection
- `mt5.terminal_info()`: Get terminal information
- `mt5.version()`: Get MT5 version
- `mt5.last_error()`: Get last error code

### Account Information
- `mt5.account_info()`: Returns comprehensive account data including:
  - Login, balance, equity, margin, profit
  - Leverage, currency, company, server
  - Trade mode, margin mode, and various margin requirements
  - Credit, commission blocked, liabilities, assets
  - Margin call and stop-out levels

### Symbol Information
- `mt5.symbols_get()`: Get all available symbols in Market Watch
- `mt5.symbol_info(symbol)`: Get complete symbol properties including:
  - Name, description, digits, point
  - Bid/ask prices, spread
  - Trade mode, calculation mode
  - Swap rates (long/short)
  - Margin requirements (initial/maintenance)
  - Lot constraints (min/max/step)
  - Contract size, tick value
  - Volume real, ticks bookdepth
- `mt5.symbol_info_tick(symbol)`: Get current tick data:
  - Bid, ask, last prices
  - Volume, volume real
  - Time (seconds and milliseconds)
  - Flags (bid/ask/last/volume/buy/sell)
- `mt5.symbol_select(symbol, enable)`: Select/deselect symbol in Market Watch

### Historical Data
- `mt5.copy_rates_from(symbol, timeframe, start_pos, count)`: Get OHLCV bars from position
- `mt5.copy_rates_range(symbol, timeframe, date_from, date_to)`: Get OHLCV bars in date range
- `mt5.copy_rates_from_pos(symbol, timeframe, start_pos, count)`: Get bars from specific position
- Supported timeframes: M1, M2, M3, M4, M5, M6, M10, M12, M15, M20, M30, H1, H2, H3, H4, H6, H8, H12, D1, W1, MN1
- `mt5.copy_ticks_from(symbol, from, count, flags)`: Get raw ticks from history
- `mt5.copy_ticks_range(symbol, from, to, flags)`: Get ticks in time range
- Tick flags: COPY_TICKS_ALL, COPY_TICKS_INFO, COPY_TICKS_TRADE, etc.

### Trading Operations
- `mt5.order_send(request)`: Send trading request (synchronous)
  - Supports all trade actions: DEAL, PENDING, SLTP, etc.
  - Returns OrderSendResult with retcode, order, deal, price, volume, etc.
- `mt5.order_check(request)`: Validate trading request before sending
  - Returns OrderCheckResult with projected margin, profit, etc.
- `mt5.order_calc_margin(action, symbol, volume, price)`: Calculate required margin
- `mt5.order_calc_profit(action, symbol, volume, price, sl, tp)`: Calculate projected profit

### Position & Order Management
- `mt5.positions_get(symbol=None, ticket=None, ...)`: Get open positions
  - Returns position tickets with full details: symbol, type, volume, prices, SL/TP, profit, swap, magic, time, etc.
- `mt5.orders_get(symbol=None, ticket=None, ...)`: Get pending orders
  - Returns order tickets with full details similar to positions
- `mt5.history_deals_get(from, to, ...)`: Get deal history (executed trades)
- `mt5.history_orders_get(from, to, ...)`: Get order history (all placed orders)

### Advanced Features
- `mt5.market_book_get(symbol)`: Get market depth (DOM) - order book data
- Various constants and enumerations for order types, trade actions, position types, etc.

## Usage Example
```python
import MetaTrader5 as mt5
from datetime import datetime

# Initialize connection
if not mt5.initialize():
    print("Initialize failed, error code =", mt5.last_error())
    quit()

# Get account info
account_info = mt5.account_info()
if account_info is not None:
    print("Account login:", account_info.login)
    print("Account balance:", account_info.balance)
    print("Account equity:", account_info.equity)

# Get symbol info for EURUSD
symbol_info = mt5.symbol_info("EURUSD")
if symbol_info is not None:
    print("EURUSD digits:", symbol_info.digits)
    print("EURUSD point:", symbol_info.point)

# Get current tick for EURUSD
tick = mt5.symbol_info_tick("EURUSD")
if tick is not None:
    print("EURUSD bid:", tick.bid)
    print("EURUSD ask:", tick.ask)

# Get last 10 M1 candles for EURUSD
rates = mt5.copy_rates_from("EURUSD", mt5.TIMEFRAME_M1, 0, 10)
if rates is not None:
    for rate in rates:
        print("Time:", datetime.fromtimestamp(rate[0]), "Open:", rate[1], 
              "High:", rate[2], "Low:", rate[3], "Close:", rate[4])

# Get open positions
positions = mt5.positions_get()
if positions is not None:
    print("Total positions:", len(positions))
    for position in positions:
        print("Position ticket:", position.ticket, 
              "Symbol:", position.symbol,
              "Type:", "BUY" if position.type == mt5.ORDER_TYPE_BUY else "SELL")

# Shutdown connection
mt5.shutdown()
```

## Advantages Over EA/Bridge Approach
1. **Minimum Latency**: Direct memory access eliminates network delays and serialization overhead
2. **Simplicity**: Fewer components - no EA deployment, no bridge servers, no HTTP/JSON communication
3. **Direct API Access**: Unfiltered access to every MT5 function without abstraction layers
4. **Real-time Performance**: Can poll as frequently as system resources allow
5. **Resource Efficiency**: No additional processes consuming CPU/memory beyond the Python script
6. **Development Flexibility**: Easy to test, debug, and modify Python scripts

## Limitations & Considerations
1. **Local-only**: Must run on the same machine as the MT5 terminal
2. **No Built-in Framework**: Requires implementing your own:
   - Strategy management/versioning system
   - Backtesting engine
   - Historical data storage/persistence
   - Trade execution queues and async handling
   - Risk management systems
   - Reconnection/retry logic
3. **Security Responsibility**: You must implement authentication/authorization if exposing functionality
4. **No Web Server**: Need to add your own HTTP/WebSocket layer for remote access
5. **Threading Considerations**: MT5 API calls should generally be made from the main thread

## When to Use This Approach
- Building custom trading applications, scripts, or bots
- Running everything on a single machine
- When minimum latency is critical
- When you want to implement your own trading framework/logic
- For research, backtesting, and strategy development
- When you prefer the simplest possible architecture with minimal dependencies

## Integration with Existing Setup
In your current Cotrade project:
1. You could replace the MT5 Python bridge services with direct MetaTrader5 calls
2. Keep your Node.js server for HTTP/WebSocket endpoints and UI
3. Have your Python trading logic connect directly to MT5 instead of going through bridge services
4. This would simplify the architecture from: MT5 ← EA ← Bridge ← Node.js
   To: MT5 ← Direct Python ← Node.js

The MetaTrader5 package is already installed and working in your environment (as verified by the successful connection test). There's no need to "move" it - it's available for import in any Python script where the package is installed.

## Verification
To verify the package works on your system:
1. Ensure MetaTrader 5 terminal is running
2. Run: `python -c "import MetaTrader5 as mt5; print(mt5.initialize()); mt5.shutdown()"`
3. Should output: `True` followed by proper shutdown