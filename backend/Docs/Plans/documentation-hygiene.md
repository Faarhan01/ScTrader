# Documentation Hygiene

**Status:** Planned

## Verified current state

- `README.md:201` — header says **"Available MCP Tools (21 Comprehensive Tools)"**.
- `backend/services/mcpServer.ts` — the server actually exposes **31 tools**.

### Tools in the README but not the table (missing from docs)

The README table (lines 205-221) lists 17 tools. The following 14 are missing:

| Tool | Purpose |
|---|---|
| `mt5_simulate_candles` | Seeds synthetic OHLCV for instant testing/backtesting |
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
| `mt5_get_account_history` | (listed but may be stale) |
| `mt5_get_tick_history` | (listed but may be stale) |

### Tool descriptions are stale

- `mt5_execute_trade` (README:210) says it dispatches `BUY`, `SELL`, `BUY_LIMIT`, `SELL_LIMIT`, `BUY_STOP`, `SELL_STOP`. The EA (`AIMT5Bridge.mq5:663-672`) only handles `BUY` and `SELL` — limit/stop order types are not implemented.
- `backend/Docs/Backend/mcp.md` is a manual reference that will drift as tools are added/removed.

## To-do

- [ ] **Regenerate the tool table.** Replace the manual table in `README.md:205-221` with one generated from the live `MCP_TOOLS` constant in `mcpServer.ts`. A simple script (`node -e "..."` or a `npm run docs` script) can emit the markdown.
- [ ] **Add the 14 missing tools** to the table with accurate descriptions.
- [ ] **Fix stale descriptions.** `mt5_execute_trade` should only advertise `BUY`/`SELL` until limit/stop order types are implemented in the EA.
- [ ] **Sync `backend/Docs/Backend/`.** Either regenerate it from the same source, or mark it as manual and review it when tools change.
- [ ] **Add a CI check** (optional) that fails if the README tool count doesn't match `MCP_TOOLS.length`.

## Why it matters

Stale documentation misleads users into thinking tools don't exist (or vice versa). An auto-generated table removes the maintenance burden and guarantees accuracy.