# CLI Command Consistency (Symbol Casing)

**Status:** Planned

## TO-DO

- [ ] 1. Remove .toUpperCase() from cli.js indicators/candles/strategies (lines 200, 206, 214)
- [ ] 2. Decide: normalize on write or preserve casing in the DB layer
- [ ] 3. Add a casing lint check (optional)

## Verified current state

### CLI commands still uppercasing

`backend/mcp-tool/cli.js` — the `buy`/`sell` commands were fixed to preserve casing (line 171). But these three still uppercase:

| Command | Line | Code |
|---|---|---|
| `indicators` | 200 | `symbol: arg1 ? arg1.toUpperCase() : undefined` |
| `candles` | 206 | `symbol: arg1 ? arg1.toUpperCase() : undefined` |
| `strategies` | 214 | `symbol: arg1 ? arg1.toUpperCase() : undefined` |

These are display-only queries so they don't reach the EA. They feed the same DB lookup path, which uppercases internally anyway — so the practical impact is low, but it's inconsistent with the trade path.

### DB layer normalizes on both sides

`backend/database/db.ts` uppercases on **write** and **read**:

| Function | Line | Direction |
|---|---|---|
| `dbInsertCandles` | 387-388 | write: `symbol.toUpperCase(), timeframe.toUpperCase()` |
| `dbInsertTicks` | 414 | write: `t.symbol.toUpperCase()` |
| `dbGetCandles` | 432 | read: `WHERE symbol = '${symbol.toUpperCase()}'` |
| `dbGetTicksHistory` | 454-455 | read: `WHERE symbol = '${symbol.toUpperCase()}'` |
| `dbSaveStrategy` | 672-673 | write |
| `dbGetStrategies` | 690-691 | read |
| `dbSaveObservation` | 847-848 | write |
| `dbSaveBacktestResult` | 956-957 | write |

This means the DB is consistently uppercase regardless of input — a mixed-case query like `"Step Index"` matches the stored `"STEP INDEX"`. So the CLI uppercasing is redundant for DB queries, but it's a latent bug: if anyone removes the read-side uppercasing, these CLI commands would silently return empty results.

### What was fixed

`cli.js:171` — `buy`/`sell` now pass `symbol: arg1` unchanged, because the EA's `SymbolSelect` is case-sensitive on Deriv.

## Details per TO-DO

### 1. Remove .toUpperCase() from cli.js indicators/candles/strategies
Lines 200, 206, 214 — change `arg1.toUpperCase()` to `arg1`. Consistent with the trade path. Low risk since the DB layer normalizes on both sides.

### 2. Decide: normalize on write or preserve casing in the DB layer
Two options:

- **Option A — keep normalizing on both sides** (current behavior). The DB stores uppercase. Queries match regardless of input casing. Simple, but the DB can never return the original casing, so the frontend can't display "Step Index" — it gets "STEP INDEX".
- **Option B — preserve casing on write, match case-insensitively on read.** Store the original casing, use `WHERE UPPER(symbol) = UPPER(?)` in queries. The DB returns "Step Index". More correct, but requires changing all query functions and any existing data is already uppercased.

Option B is the right long-term fix. Risk: existing data is already uppercased, so a mixed-case query wouldn't match until the data is re-seeded. Either normalize on write or normalize on both sides — don't do one without the other.

### 3. Add a casing lint check (optional)
A simple grep in CI for `.toUpperCase()` on `symbol`/`timeframe` in `backend/mcp-tool/cli.js` would catch regressions like the one that broke the `buy` path.

## Why it matters

Keep one rule everywhere: symbols pass through unchanged. MT5's `SymbolSelect` is case-sensitive on Deriv, so any path that touches the EA should preserve casing. Inconsistency invites bugs — the `buy` path was broken precisely because of this.