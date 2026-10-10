# Documentation Hygiene

**Status:** Planned

## TO-DO

- [ ] 1. Regenerate README tool table from MCP_TOOLS (README.md:201-225)
- [ ] 2. Add 10 missing tools to the table
- [ ] 3. Fix stale tool count in two places (README.md:201, README.md:239)
- [ ] 4. Fix mt5_execute_trade description (README.md:210)
- [ ] 5. Update DB tables list (README.md:252)
- [ ] 6. Sync backend/Docs/Backend/mcp.md or mark as manual

## Verified current state

### Tool count mismatch

- `README.md:201` — header says **"Available MCP Tools (21 Comprehensive Tools)"**.
- `README.md:239` — `GET /api/mcp/tools` says "List all 21 MCP tool schemas".
- `backend/services/mcpServer.ts` — the server actually exposes **31 tools**.

### README table — 21 listed, 10 missing

The table (README.md:205-225) lists 21 tools. The following 10 are missing:

| Tool | Purpose |
|---|---|
| `mt5_list_strategies` | Lists quantitative strategies |
| `mt5_create_strategy` | Creates/updates a strategy |
| `mt5_backtest_strategy` | Runs a backtest |
| `mt5_list_observations` | Lists knowledge-base observations |
| `mt5_record_observation` | Records an observation |
| `mt5_get_backtest_history` | Queries backtest results |
| `mt5_evaluate_strategy_signals` | Evaluates live signals |
| `mt5_execute_strategy_signal` | Executes a signal through the queue |
| `mt5_delete_strategy` | Deletes a strategy |
| `mt5_delete_observation` | Deletes an observation |

### Stale tool descriptions

- `README.md:210` — `mt5_execute_trade` says it dispatches `BUY`, `SELL`, `BUY_LIMIT`, `SELL_LIMIT`, `BUY_STOP`, `SELL_STOP`. The EA (`AIMT5Bridge.mq5:663-672`) only handles `BUY` and `SELL` — limit/stop order types are not implemented.
- `README.md:216` — `mt5_get_chart_history` says "multi-timeframe OHLCV candles (M1, M5, M15, H1, H4, D1)" but the tool only returns whatever the active chart or DB has — there's no timeframe parameter that requests a different TF from the EA.

### Stale DB tables list

- `README.md:252` — lists `orders`, `positions_history`, `account_history`, `symbol_ticks`, `risk_settings`, `audit_logs`. Missing: `candles_history`, `ticks_history`, `strategies`, `observations`, `backtest_results`.

### Manual docs

- `backend/Docs/Backend/mcp.md` is a manual reference that will drift as tools are added/removed.

## Details per TO-DO

### 1. Regenerate README tool table
Replace the manual table in `README.md:205-225` with one generated from the live `MCP_TOOLS` constant in `mcpServer.ts`. A simple script (`node -e "..."` or a `npm run docs` script) can emit the markdown from the tool definitions, guaranteeing the table always matches the server.

### 2. Add 10 missing tools
Add the 10 strategy/observation/backtest tools to the table with accurate descriptions pulled from their `MCP_TOOLS` definitions.

### 3. Fix stale tool count
- `README.md:201` — change "21 Comprehensive Tools" to "31 Comprehensive Tools" (or make it dynamic).
- `README.md:239` — change "List all 21 MCP tool schemas" to "31".

### 4. Fix mt5_execute_trade description
`README.md:210` should only advertise `BUY`/`SELL` until limit/stop order types are implemented in the EA (`AIMT5Bridge.mq5:663-672`).

### 5. Update DB tables list
`README.md:252` should list all 11 tables, or be replaced with a generated list from the schema.

### 6. Sync backend/Docs/Backend/mcp.md
Either regenerate it from the same source as the README, or mark it as manual and review it when tools change.

## Why it matters

Stale documentation misleads users into thinking tools don't exist (or vice versa). An auto-generated table removes the maintenance burden and guarantees accuracy.