# Bridge Connection — Wire the Bridge to Our Site

**Status:** Planned

## Goal

Make the Python bridge (`backend/Tools\Bridge/`) connect to our Cotrade site
without editing the site. All changes go in the bridge itself.

## Current state

The bridge was built for the ScalarAI site. Its `SiteClient` (`app/client.py`)
calls these endpoints:

| Bridge calls          | ScalarAI site endpoint             |
| :-------------------- | :--------------------------------- |
| `get_active_symbol()` | `GET /api/status` → `activeSymbol` |
| `get_lot_size()`      | `GET /api/settings` → `lotSize`    |
| `report_trade()`      | `POST /api/trades`                 |
| `report_positions()`  | `POST /api/bridge/positions`       |

Its `EABridgeService` pushes to:

| Bridge pushes          | ScalarAI site endpoint          |
| :--------------------- | :------------------------------ |
| `send_tick()`          | `POST /api/ea/tick`             |
| `send_bulk_candles()`  | `POST /api/market/bulk-candles` |
| `send_positions()`     | `POST /api/ea/positions`        |
| `send_confirmations()` | `POST /api/ea/confirm`          |
| `send_logs()`          | `POST /api/ea/logs`             |

None of these exist on our Cotrade site. Our site uses a different architecture:
the EA pushes everything via `POST /sync` (mt5Routes.ts:21), and the bridge
would be redundant.

## What our site actually exposes

Our Cotrade site (port 3000) has these endpoints the bridge can use:

### Read endpoints

| Our endpoint                | What it returns                                                       | Bridge use                                       |
| :-------------------------- | :-------------------------------------------------------------------- | :----------------------------------------------- |
| `GET /api/state            | Full tradeStore snapshot (account, positions, ticks, riskGuard, etc.) | Replace `get_active_symbol()` + `get_lot_size()` |
| `GET /api/database/orders`  | Command/order history from SQLite                                     | Replace `history_deals_get` fallback             |
| `GET /api/database/ticks`   | Tick history for a symbol                                             | Replace `copy_ticks_range` fallback              |
| `GET /api/database/candles` | Candle history for a symbol/timeframe                                 | Replace `get_history` fallback                   |
| `GET /api/strategies`       | All strategies                                                        | Replace `list_strategies`                        |
| `GET /api/strategies/:id`   | One strategy                                                          | Replace `get_strategy`                           |
| `GET /api/observations`     | All observations                                                      | Replace `list_observations`                      |
| `GET /api/backtests`        | Backtest results                                                      | Replace `get_backtests`                          |
| `GET /api/mcp/tools`        | All 31 MCP tool schemas                                               | Tool discovery                                   |

### Write endpoints

| Our endpoint                        | What it does                                      | Bridge use                    |
| :---------------------------------- | :------------------------------------------------ | :---------------------------- |
| `POST /api/commands`                | Enqueue a trade command (validated by risk guard) | Replace `place_trade`         |
| `POST /api/commands/close-all`      | Close all positions                               | Replace `close_all_positions` |
| `POST /api/risk`                    | Update risk guard config                          | Risk guard sync               |
| `POST /api/kill-switch`             | Toggle emergency kill switch                      | Kill switch sync              |
| `POST /api/strategies`              | Create/update a strategy                          | Strategy CRUD                 |
| `DELETE /api/strategies/:id`        | Delete a strategy                                 | Strategy CRUD                 |
| `POST /api/observations`            | Create an observation                             | Observation CRUD              |
| `DELETE /api/observations/:id`      | Delete an observation                             | Observation CRUD              |
| `POST /api/strategies/:id/backtest` | Run a backtest                                    | Backtest                      |
| `POST /api/candles/simulate`        | Seed synthetic candles                            | Test data                     |
| `POST /api/simulate-tick`           | Push a live tick                                  | Tick injection                |

### WebSocket

| Our endpoint             | What it does                                                                                                          |
| :----------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `ws://127.0.0.1:3000/ws` | Live event stream — `init`, `tick`, `ea:sync`, `command:queued`, `command:result`, `risk:updated`, `risk:kill_switch` |

## Changes needed in the bridge

### 1. Replace `SiteClient` with a `CotradeClient`

`app/client.py` — rewrite to target our endpoints:

```python
class CotradeClient:
    def __init__(self, url="http://127.0.0.1:3000", api_key=None, timeout=3.0):
        self.url = url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def get_state(self):
        """GET /api/state — full tradeStore snapshot."""
        return self._get("/api/state")

    def get_active_symbol(self):
        """Active chart symbol from /api/state."""
        state = self.get_state()
        if not state:
            return "Step Index"
        return state.get("currentChart", {}).get("symbol") or "EURUSD"

    def get_lot_size(self):
        """Default lot size from risk guard config."""
        state = self.get_state()
        if not state:
            return 0.1
        return state.get("riskGuard", {}).get("maxLotSizePerTrade", 2.0)

    def enqueue_command(self, action, symbol, volume, sl=None, tp=None, comment=None, source="BRIDGE"):
        """POST /api/commands — enqueue a trade via our risk-guard-validated path."""
        body = {
            "action": action,
            "symbol": symbol,
            "volume": volume,
            "sl": sl,
            "tp": tp,
            "comment": comment or "Bridge trade",
            "source": source,
        }
        return self._post("/api/commands", body)

    def close_all(self, symbol=None):
        """POST /api/commands with CLOSE_ALL action."""
        body = {"action": "CLOSE_ALL", "source": "BRIDGE"}
        if symbol:
            body["symbol"] = symbol
        return self._post("/api/commands", body)

    def update_risk_guard(self, updates):
        """POST /api/risk — sync risk guard config."""
        return self._post("/api/risk", updates)

    def toggle_kill_switch(self, active):
        """POST /api/kill-switch."""
        return self._post("/api/kill-switch", {"active": active})
```

### 2. Replace `SiteBridgeIntegration` with `CotradeIntegration`
`app/integration.py` — rewrite to use `CotradeClient` and our endpoint shapes:
```python
class CotradeIntegration:
    def __init__(self, site_client=None):
        self.service = MT5Service()
        self.site = site_client or CotradeClient()

    def place_trade(self, trade_type, reason, options=None):
        options = options or {}
        symbol = options.get("symbol") or self.site.get_active_symbol()
        lot = options.get("lotSize") or self.site.get_lot_size()
        sl = options.get("sl")
        tp = options.get("tp")

        # Execute directly against MT5 via the bridge
        result = self.service.place_trade(
            symbol=symbol,
            trade_type=trade_type,
            lot=float(lot),
            sl=float(sl) if sl else None,
            tp=float(tp) if tp else None,
            comment=reason or "Cotrade bridge trade",
        )
        ticket = result.get("ticket")

        # Also enqueue via our site so the EA's command queue and risk guard see it
        self.site.enqueue_command(
            action="EXECUTE_TRADE",
            symbol=symbol,
            volume=float(lot),
            sl=float(sl) if sl else None,
            tp=float(tp) if tp else None,
            comment=reason or "Cotrade bridge trade",
        )

        return {"success": True, "message": f"{trade_type} executed on {symbol}", "ticket": ticket}

    def close_trade(self, trade_id):
        ticket = int(str(trade_id))
        result = self.service.close_trade(ticket)
        if result.get("closed"):
            return {"success": True, "message": f"Position {ticket} closed"}
        return {"success": False, "message": f"Position {ticket} not found"}

    def close_all_trades(self, symbol=None):
        result = self.service.close_all_positions(symbol)
        closed = result.get("closed", 0)
        # Also notify our site
        self.site.close_all(symbol)
        return {"success": True, "closedCount": closed, "message": f"Closed {closed} position(s)"}

    def modify_trade(self, trade_id, options):
        ticket = int(str(trade_id))
        sl = options.get("sl")
        tp = options.get("tp")
        result = self.service.modify_position(ticket, sl=float(sl) if sl else None, tp=float(tp) if tp else None)
        if result.get("modified"):
            return {"success": True, "message": f"Position {ticket} modified"}
        return {"success": False, "message": f"Position {ticket} not found"}
```

### 3. Drop the `EABridgeService` data-pushing layer
`mt5/services/ea_bridge.py` — our EA already pushes ticks, positions, candles,
confirmations, and logs via `POST /sync` (mt5Routes.ts:21). The bridge's
`send_tick()`, `send_bulk_candles()`, `send_positions()`, `send_confirmations()`,
and `send_logs()` are redundant. Either:
- Delete `ea_bridge.py` entirely, or
- Keep it as a no-op fallback that checks if the EA is connected before pushing

### 4. Wire the WebSocket client
`app/ws_client.py` (new file) — connect to `ws://127.0.0.1:3000/ws` to receive
live events instead of polling:
```python
import json
import threading
import websocket  # pip install websocket-client

class CotradeWSClient:
    def __init__(self, url="ws://127.0.0.1:3000/ws", on_event=None):
        self.url = url
        self.on_event = on_event or (lambda e: None)
        self._ws = None
        self._thread = None

    def _on_message(self, ws, message):
        try:
            event = json.loads(message)
            self.on_event(event)
        except Exception:
            pass

    def _on_error(self, ws, error):
        pass

    def _on_close(self, ws, *args):
        pass

    def _on_open(self, ws):
        pass

    def start(self):
        self._ws = websocket.WebSocketApp(
            self.url,
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
        )
        self._thread = threading.Thread(target=self._ws.run_forever, daemon=True)
        self._thread.start()

    def stop(self):
        if self._ws:
            self._ws.close()
```

### 5. Update `server.py` to use Cotrade endpoints
`app/server.py` — replace the FastAPI routes that target the ScalarAI site with
routes that target our Cotrade site:
- GET /account → CotradeClient.get_state() → state.account
- GET /positions → CotradeClient.get_state() → state.positions
- GET /symbols → CotradeClient.get_state() → state.allSymbols
- GET /tick?symbol=X → CotradeClient.get_state() → find tick by symbol
- GET /history?symbol=X&count=N&timeframe=1 → GET /api/database/candles
- POST /trade → CotradeIntegration.place_trade() (executes via bridge + enqueues via site)
- POST /close → CotradeIntegration.close_trade()
- POST /close-all → CotradeIntegration.close_all_trades()
- POST /modify → CotradeIntegration.modify_trade()

Files to change
File	Change
app/client.py	Rewrite SiteClient → CotradeClient targeting our endpoints
app/integration.py	Rewrite SiteBridgeIntegration → CotradeIntegration
app/server.py	Update routes to use CotradeIntegration
app/ws_client.py	New file — WebSocket client for live events
mt5/services/ea_bridge.py	Remove or neuter the data-pushing layer
requirements.txt	Add websocket-client if using the WS client

## How the site can use the bridge

The bridge runs an HTTP server on `http://127.0.0.1:5000` (by default) that exposes MT5 functionality. The Cotrade site (running on port 3000) can make HTTP requests to the bridge to:

- Get account info: `GET http://127.0.0.1:5000/account`
- Get positions: `GET http://127.0.0.1:5000/positions`
- Get symbols: `GET http://127.0.0.1:5000/symbols`
- Get live tick: `GET http://127.0.0.1:5000/tick?symbol=X`
- Get candle history: `GET http://127.0.0.1:5000/history?symbol=X&count=N&timeframe=1`
- Place a trade: `POST http://127.0.0.1:5000/trade` with JSON body and `Authorization: Bearer <api_key>`
- Close a position: `POST http://127.0.0.1:5000/close`
- Close all positions: `POST http://127.0.0.1:5000/close-all`
- Modify SL/TP: `POST http://127.0.0.1:5000/modify`

This allows the site to bypass the EA and tradeStore for direct MT5 access. However, note that trades placed via the bridge are not seen by the EA's command queue or the tradeStore's risk guard unless also enqueued via the site's `/api/commands` endpoint (as described in the `CotradeIntegration.place_trade` method in the bridge's `app/integration.py`).

## Using the daemon and bridge together

The daemon (in `backend/Tools/daemon/`) and the bridge (in `backend/Tools/Bridge/`) are two independent ways to connect to MT5:

- The daemon is a Node.js worker that runs alongside the Cotrade site and interacts with the EA via the tradeStore and the `/sync` endpoint. It does not communicate directly with MT5; it relies on the EA to push and receive data.
- The bridge is a Python service that talks directly to MT5 using the official `MetaTrader5` PyPI package. It does not require the EA to be running.

Because both require access to the MT5 terminal, running both simultaneously may cause conflicts if both attempt to send trades to MT5. It is recommended to use one or the other for trading operations. However, both can be used for reading data (e.g., the site can use the daemon's WebSocket for live events and the bridge for historical data or direct trading).

If you wish to use the bridge for trading and the daemon for other purposes (e.g., strategy evaluation), ensure that the bridge's trading operations are coordinated with the daemon's tradeStore (e.g., by also enqueuing bridge trades via the site's `/api/commands` endpoint).

## Live Data Streaming via Bridge (Enhancement)

While the bridge currently only supports polling via HTTP endpoints, we can enhance it to provide live data streaming similar to the daemon by adding a WebSocket server that pushes polled data at high frequency.

### Proposed Enhancement: Bridge WebSocket Server
Add a WebSocket server to `app/server.py` that:
- Accepts WebSocket connections from AI clients
- Polls MT5 for tick data, positions, account info at a configurable interval (e.g., 100ms)
- Pushes updates to all connected clients via WebSocket messages
- Provides message types: `tick`, `account`, `positions`, `symbols`, `history`

This would allow the AI to receive live data from the bridge with low latency (subject to polling interval) without needing the EA or tradeStore.

### Implementation Plan for Bridge WebSocket Server

#### Stage 1: Foundation
1.1. Add WebSocket server imports and endpoint to `app/server.py`
1.2. Implement a background polling task that fetches data from MT5Service
1.3. Broadcast updates to all connected WebSocket clients
1.4. Define WebSocket message schemas (tick, account, positions, etc.)
1.5. Write unit tests for WebSocket server logic

#### Stage 2: Integration and Testing
2.1. Update `app/server.py` to start WebSocket server alongside HTTP server
2.2. Test WebSocket connection and message delivery
2.3. Verify low-latency data delivery (e.g., 100ms polling)
2.4. Ensure thread safety and proper cleanup on disconnect
2.5. Add configuration options for polling interval and enabled data types

#### Stage 3: Documentation and Examples
3.1. Document WebSocket endpoint (`ws://127.0.0.1:5000/ws`) and message formats
3.2. Provide example client code for consuming live data
3.3. Update bridge README with WebSocket usage instructions
3.4. Conduct performance testing under various loads

#### Stage 4: Final Review
4.1. Gather feedback and refine implementation
4.2. Finalize documentation and guidelines
4.3. Obtain approval for implementation

## Bulk Data Pulling via Bridge

The bridge already supports bulk data pulling for a single symbol via the `/history` endpoint (which uses `copy_rates_from` or `copy_ticks_from`). To pull bulk data for multiple symbols (similar to the EA's `/sync` payload), we can add a new endpoint that aggregates data across symbols.

### Proposed Enhancement: Multi-Symbol Bulk Endpoint
Add a new endpoint `POST /bulk` that accepts a list of symbols and returns aggregated data (ticks, positions, account, etc.) for all symbols in a single response, reducing the number of HTTP requests needed.

### Implementation Plan for Multi-Symbol Bulk Endpoint

#### Stage 1: Design
1.1. Define request schema: `{ "symbols": ["EURUSD", "GBPJPY", ...], "include": ["ticks", "positions", "account"] }`
1.2. Define response schema: aggregated data per symbol
1.3. Determine which data types to include (ticks, positions, account, history, etc.)

#### Stage 2: Implementation
2.1. Add new route `/bulk` to `app/server.py`
2.2. Implement handler that loops over symbols and calls appropriate MT5Service methods
2.3. Aggregate results into a single JSON response
2.4. Handle errors gracefully (partial failures)
2.5. Write unit tests for the bulk endpoint

#### Stage 3: Optimization
3.1. Consider caching frequently requested data to reduce MT5 API calls
3.2. Add support for symbol validation and automatic symbol selection
3.3. Implement rate limiting awareness to avoid overloading MT5

#### Stage 4: Documentation
4.1. Document the new endpoint in bridge documentation
4.2. Provide usage examples
4.3. Update improvement.md with this enhancement

## Using the Bridge for Live Data (AI Perspective)

To receive live data from the bridge without the EA/daemon:

1. **Polling (Current)**: AI periodically calls `GET /tick?symbol=X` and `GET /positions` at desired interval (e.g., 200ms). Simple but generates HTTP overhead.
2. **WebSocket (Enhanced)**: After implementing the WebSocket server, AI connects to `ws://127.0.0.1:5000/ws` and receives push updates at the polling interval (e.g., every 100ms). Lower latency and reduced HTTP overhead.
3. **Hybrid**: Use WebSocket for real-time ticks and occasional HTTP requests for less frequent data (e.g., account info every 5 seconds).

The bridge's live data will be sourced directly from MT5 via polling, so it does not include EA-enriched data like `marketDepth` or `chartHistory` unless those are explicitly polled and included in the WebSocket stream.

## Comparison: Bridge vs. Daemon+EA for Live Data

| Feature                | Bridge (with WebSocket)                          | Daemon+EA                                      |
|------------------------|--------------------------------------------------|------------------------------------------------|
| Data source            | Direct MT5 via Python API                        | EA via `/sync` (tradeStore)                    |
| Update mechanism       | Polling (configurable interval)                  | EA sync (~500ms) + daemon polling (250ms)      |
| Latency                | Configurable polling interval (e.g., 100ms)      | ~250ms (daemon poll of tradeStore)             |
| Data richness          | Raw MT5 data (ticks, positions, account)         | EA-enriched data (marketDepth, chartHistory, etc.) |
| Setup                  | Requires MT5 running and Python dependencies     | Requires EA connected to MT5                   |
| Conflicts              | None with EA/daemon (different access paths)     | None with bridge                               |
| Use case               | Direct MT5 access, historical data, synchronous trading | Live streaming of EA's view, strategy evaluation |

In summary, use the bridge (with WebSocket enhancement) for low-latency access to raw MT5 data when EA is not needed or for direct trading. Use the daemon for live streaming of the EA's enriched market view when the EA is connected. Both can coexist for different purposes.
