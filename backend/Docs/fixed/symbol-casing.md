# Symbol Casing (Deriv case-sensitive SymbolSelect)

**Status:** Fixed

## Problem

The CLI, MCP server, strategy route, and UI all uppercased symbols before sending to the EA. MT5's `SymbolSelect` is case-sensitive on Deriv — "Step Index" became "STEP INDEX" and the EA returned error 4106 "Unknown symbol".

The whitelist itself worked fine; the failure was at the EA after the command was dispatched.

## Files fixed

| File | Line | Change |
|---|---|---|
| `backend/mcp-tool/cli.js` | 171 | `symbol: arg1` (was `arg1.toUpperCase()`) |
| `backend/services/mcpServer.ts` | 677 | `symbol: String(symbol)` (was `.toUpperCase()`) |
| `backend/routes/apiRoutes.ts` | 409 | strategy create preserves casing |
| `src/components/dashboard/OrderExecutionDock.tsx` | 100 | removed `.toUpperCase()` from onChange |
| `src/components/knowledge/KnowledgeBasePage.tsx` | 220-221, 288-289 | strategy/observation create preserves casing |

## Verified

`node backend/mcp-tool/cli.js buy "Step Index" 0.10 7330 7360 "CLI_TEST"` executes on MT5 (deal 9709133795, ticket 9836325217, price 7350.4, 828ms).

## Root cause

`backend/ea/AIMT5Bridge.mq5:635`:
```mql5
if(!SymbolSelect(symbol, true))
{
   errCode = 4106;
   errMsg = "Unknown symbol " + symbol;
}
```