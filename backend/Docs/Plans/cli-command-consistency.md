# CLI Command Consistency (Symbol Casing)

**Status:** Planned

## Verified current state

The `buy`/`sell` commands were fixed to preserve symbol casing (`cli.js:171`). But the following commands still uppercase:

| Command | Line | Code |
|---|---|---|
| `indicators` | 200 | `symbol: arg1 ? arg1.toUpperCase() : undefined` |
| `candles` | 206 | `symbol: arg1 ? arg1.toUpperCase() : undefined` |
| `strategies` | 214 | `symbol: arg1 ? arg1.toUpperCase() : undefined` |

These are display-only queries so they don't reach the EA, but they feed the same DB lookup path (`dbGetCandles`, `dbGetStrategies`) which uppercases internally anyway — so the practical impact is low, but it's inconsistent with the trade path.

## To-do

- [ ] Remove `.toUpperCase()` from `cli.js:200`, `cli.js:206`, `cli.js:214` so symbols pass through unchanged.
- [ ] Consider removing `.toUpperCase()` from the DB query functions (`db.ts:432`, `db.ts:455`, `db.ts:691`) so the DB stores and returns the original casing. This would make the whole stack consistent. Risk: existing data is already uppercased, so a mixed-case query wouldn't match. Either normalize on write or normalize on both sides.

## Why it matters

Keep one rule everywhere: symbols pass through unchanged. MT5's `SymbolSelect` is case-sensitive on Deriv, so any path that touches the EA should preserve casing. Inconsistency invites bugs — the `buy` path was broken precisely because of this.