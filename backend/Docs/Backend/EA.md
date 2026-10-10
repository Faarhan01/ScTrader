# MetaTrader 5 Expert Advisor

File: `backend/ea/AIMT5Bridge.mq5` (725 lines). Version `2.10`. The EA runs
inside MetaTrader 5 and bridges the terminal to the local AI bridge server.

## Inputs

| Input | Default | Purpose |
|---|---|---|
| `InpBridgeUrl` | `http://127.0.0.1:3000` | Primary bridge URL |
| `InpBridgeUrlFallback` | `http://127.0.0.1:7777` | Fallback URL |
| `InpApiKey` | `mt5_bridge_secret_key` | Sent in every sync payload |
| `InpTimerIntervalMs` | `500` | Millisecond timer / sync interval |
| `InpMagicNumber` | `889900` | Magic number for AI orders |
| `InpDefaultSlippage` | `10` | Slippage in points |
| `InpSymbolsToTrack` | `EURUSD,GBPUSD,USDJPY,XAUUSD,BTCUSD` | Symbols for live tick stream |
| `InpHistoryCandles` | `60` | OHLCV candles transmitted |
| `InpEnableTrailing` | `true` | Trailing stop engine |
| `InpTrailingPoints` | `150` | Trailing distance in points |
| `InpTrailingStep` | `30` | Trailing step in points |
| `InpAutoSyncTicks` | `true` | Stream live ticks |

## Lifecycle

`OnInit()`:
1. Configures `CTrade` (magic number, slippage, IOC filling).
2. Parses `InpSymbolsToTrack`, always adding the current chart symbol.
3. Performs a `GET /health` WebRequest to verify the bridge is reachable
   (warns about `Tools → Options → Expert Advisors → Allow WebRequest` on
   failure).
4. Starts a millisecond timer (`EventSetMillisecondTimer(500)`).
5. Performs an immediate `SyncWithBridge()`.

`OnTimer()` (every 500 ms): runs `ProcessTrailingStops()` then
`SyncWithBridge()`, guarded by a `g_isSyncing` flag.

## Sync protocol

`SyncWithBridge()` builds a JSON payload via `BuildSyncJson()` and POSTs it to
`<url>/sync`. If the primary returns HTTP `-1` it retries the fallback URL.

On HTTP 200 it calls `ProcessServerResponse()` to execute any commands in the
response's `commands[]` array. On failure it logs every 10 seconds.

### Payload (`BuildSyncJson`)

Hand-built JSON (MQL5 has no native JSON library). Fields:
`apiKey`, `eaVersion`, `mt5Time`, `terminalName`, `terminalCompany`,
`terminalBuild`, `currentChart`, `allSymbols`, `chartHistory`, `account`,
`positions`, `ticks`, `pendingExecutionResults`.

- `currentChart` — symbol, timeframe, digits, point, bid/ask, spread, lot
  limits, contract size, tick value, trade mode.
- `allSymbols` — per-symbol bid/ask/spread/digits/point/lot limits/contract
  size/tradeAllowed/isCurrentChart for every tracked symbol.
- `chartHistory` — OHLCV candles, sent on startup and every 5 seconds.
- `account` — login, tradeMode, balance, equity, margin, freeMargin,
  marginLevel, leverage, currency, server, company, profit.
- `positions` — ticket, symbol, type, volume, openPrice, currentPrice, SL/TP,
  profit, swap, magic, comment, openTime.
- `ticks` — symbol, bid, ask, last, spread, volume, time.
- `pendingExecutionResults` — commandId, success, dealTicket, orderTicket,
  executionPrice, errorCode, errorMessage, executionTimeMs.

### Response handling (`ProcessServerResponse`)

A flat JSON parser (`ExtractJsonField`) locates the `commands` array and
extracts each command object, then `ExecuteSingleCommand` runs it.

## Command execution

`ExecuteSingleCommand(cmd)` reads `id`, `action`, `symbol`, `orderType`,
`volume`, `sl`, `tp`, `ticket`, `magic`, `comment` and dispatches:

| Action | MQL5 call |
|---|---|
| `EXECUTE_TRADE` | `m_trade.Buy()` / `m_trade.Sell()` after auto-detecting IOC/FOK/RETURN filling, clamping volume to broker lot step/min/max |
| `MODIFY_POSITION` | `m_trade.PositionModify(ticket, sl, tp)` |
| `CLOSE_POSITION` | partial close via `PositionClosePartial` if `volume < position.volume`, else `PositionClose` |
| `CLOSE_ALL` | iterates positions backwards and closes matching ones |

Each execution records a `TradeResultItem` into `g_resultQueue` (max 20) with
the commandId, success flag, deal/order ticket, execution price, error code,
error message, and elapsed milliseconds. The queue is transmitted in the next
sync's `pendingExecutionResults`.

## Trailing stops

`ProcessTrailingStops()` runs on every timer tick for all open positions:
- BUY: when `bid - openPrice > distance`, set SL to `bid - distance` (if it
  advanced by at least `step`).
- SELL: when `openPrice - ask > distance`, set SL to `ask + distance`.

## Notes

- `EscapeJson` handles `\`, `"`, `\r`, `\n` in strings.
- The EA sends `apiKey` in every payload, but the server does not validate it.
- The flat `ExtractJsonField` parser is fragile with nested objects or escaped
  quotes; it works for the flat command objects the server emits.