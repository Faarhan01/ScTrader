# MetaTrader 5 AI Copilot & MCP Bridge EA

This Expert Advisor (`AIMT5Bridge.mq5`) bridges MetaTrader 5 to this local web application and external AI models via the Model Context Protocol (MCP) and low-latency REST/WebSocket endpoints.

## 🚀 Quick Setup Instructions

### 1. Whitelist Bridge URL in MetaTrader 5 (CRITICAL)
Because MetaTrader 5 blocks outgoing HTTP connections by default, you **must allow WebRequest**:
1. Open **MetaTrader 5**.
2. Go to top menu: **Tools** -> **Options** (or press `Ctrl + O`).
3. Select the **Expert Advisors** tab.
4. Check **"Allow WebRequest for listed URL"**.
5. Click the green `+` icon and add:
   - `http://127.0.0.1:7777`
   - *(Optional fallback)* `http://127.0.0.1:3000`
6. Also check **"Allow Algo Trading"**.
7. Click **OK**.

### 2. Copy the Expert Advisor into MT5
1. In MetaTrader 5, click **File** -> **Open Data Folder**.
2. Navigate to: `MQL5` -> `Experts`.
3. Copy `AIMT5Bridge.mq5` into this folder.
4. Return to MT5, press `Ctrl + N` to open the **Navigator** panel.
5. Right-click on **Expert Advisors** and click **Refresh**.
6. Double-click or drag `AIMT5Bridge` onto any active chart (e.g. `EURUSD`, `XAUUSD`).

### 3. Configure Input Parameters
In the EA properties dialog:
- **InpBridgeUrl**: `http://127.0.0.1:7777` (the primary local bridge)
- **InpApiKey**: `mt5_bridge_secret_key`
- **InpTimerIntervalMs**: `500` (500ms sync loop for sub-second AI reaction)
- **InpMagicNumber**: `889900`
- **InpEnableTrailing**: `true` (dynamic trailing stop engine)
- **InpSymbolsToTrack**: `EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD`

Ensure the **"Allow Algo Trading"** button in the MT5 top toolbar is **Green** (active).
You will see the EA initialization message and successful connection in the **Experts** tab at the bottom of MT5!

## 🤖 Model Context Protocol (MCP) Capabilities for AI
When the EA is running, external AI agents (such as Claude Desktop, Cursor, OpenAI Agents, Gemini, or custom scripts) can connect to the MCP server endpoint to:
- `mt5_get_account_info`: Retrieve live balance, equity, margin, leverage.
- `mt5_get_current_chart`: Retrieve active chart symbol, timeframe, spread, and broker contract specs.
- `mt5_get_all_symbols`: Retrieve all symbols transmitted by the EA with live quotes.
- `mt5_get_market_data`: Receive live bid, ask, spread, high, low.
- `mt5_get_open_positions`: Inspect all open tickets, PnL, floating points.
- `mt5_execute_trade`: Open BUY or SELL orders with lot sizes, stop loss, and take profit.
- `mt5_modify_position`: Dynamically adjust SL/TP.
- `mt5_close_position`: Close full or partial position lots.
- `mt5_close_all`: Instant liquidation or symbol-specific panic close.
- `mt5_configure_risk`: Manage global drawdown protection, trailing stop distance, and lot caps.
- `mt5_get_execution_queue`: Inspect asynchronous order status.
- `mt5_get_chart_history`: Retrieve real OHLCV candles and precomputed indicators (RSI, EMA, MACD, Bollinger Bands, ATR).
- `mt5_request_chart_history`: Command the EA to fetch and upload past candles on demand.
- `mt5_list_strategies`: List stored quantitative strategies from the SQLite knowledge base.
- `mt5_create_strategy`: Register algorithmic trading strategies with custom indicator parameters.
- `mt5_backtest_strategy`: Run server-authoritative backtests across stored MT5 candles.
- `mt5_evaluate_strategy_signals`: Check real-time BUY/SELL signals against live MT5 market conditions.
- `mt5_execute_strategy_signal`: Execute active strategy signals directly through the site bridge to MT5.
- `mt5_record_observation`: Record market notes, pattern observations, and execution logs.

## 🏛️ Strict Execution-Only Bridge Architecture
The MetaTrader 5 Expert Advisor operates purely as an execution agent and telemetry bridge:
1. **Zero Strategy Logic in EA:** All mathematical modeling, indicator calculations, strategy definitions, and backtesting live strictly on the site and external AI.
2. **Deterministic Order Execution:** The EA executes solely the commands pushed to it by the site bridge (or AI via MCP).
3. **Data Telemetry:** The EA reliably feeds live account equity, open positions, ticks, and past candles up to the server.

