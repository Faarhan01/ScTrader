# Database

Implementation: `backend/database/db.ts` (282 lines). Persistent SQLite via
`sql.js` (WASM), written to `data/mt5_bridge.sqlite`.

## Initialization

`getDatabase()` is lazy — first call (from the `TradeStore` constructor)
creates the instance:

1. Ensures `data/` exists.
2. Loads `initSqlJs`.
3. If `data/mt5_bridge.sqlite` exists, reads it into a `SQL.Database`;
   otherwise creates an empty one.
4. Runs `initSchema()` (idempotent `CREATE TABLE IF NOT EXISTS`).
5. Schedules the first `persistDatabase()`.

## Schema

| Table | Purpose |
|---|---|
| `orders` | every queued command + its execution result |
| `positions_history` | closed positions (ticket PK) |
| `account_history` | account snapshots per sync |
| `symbol_ticks` | live tick samples |
| `audit_logs` | execution logs (id PK) |
| `risk_settings` | single-row (id=1) risk config |

`orders` columns: `id, action, symbol, order_type, volume, price, sl, tp,
ticket, magic, comment, status, source, deal_ticket, execution_price,
execution_time_ms, error_code, error_message, created_at, executed_at`.

## Writes

All writes go through async helpers that call `persistDatabase()`:

- `dbInsertOrder(order)` — `INSERT OR REPLACE INTO orders` on every enqueue
  and on every execution-result resolution.
- `dbInsertLog(log)` — `INSERT OR REPLACE INTO audit_logs`.
- `dbSaveRiskSettings(risk)` — `INSERT OR REPLACE INTO risk_settings (id=1, ...)`.

## Persistence strategy

`persistDatabase()` debounces writes with a 100 ms timer: rapid successive
writes coalesce into a single `dbInstance.export()` + `fs.writeFileSync`.
This keeps the WASM SQLite in sync with the in-memory `tradeStore` without
flushing on every tick.

## Reads

- `dbGetOrders(limit)` — `SELECT * FROM orders ORDER BY created_at DESC`.
- `dbGetAnalytics()` — aggregate counts over `orders` and `audit_logs`,
  plus the on-disk file size.

## Analytics output

```json
{ "databasePath": "data/mt5_bridge.sqlite",
  "databaseType": "SQLite WASM (Persistent)",
  "dbSizeBytes": 40960,
  "totalOrders": 9, "executedOrders": 6, "failedOrders": 2,
  "executionSuccessRate": 66.7, "totalLogs": 22 }
```

## Endpoints

- `GET /api/database/analytics` — `dbGetAnalytics()`
- `GET /api/database/orders?limit=100` — `dbGetOrders(limit)`
- `GET /api/database/download` — streams the raw `.sqlite` file