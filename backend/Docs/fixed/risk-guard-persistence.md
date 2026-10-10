# Risk Guard Persistence Across Restarts

**Status:** Fixed

## Problem

`updateRiskGuard` only updated in-memory state; nothing loaded it back, so the whitelist (and other risk settings) reverted to defaults on every server restart. This forced re-applying the config after each `npm run dev`.

## Files fixed

| File | Line | Change |
|---|---|---|
| `backend/database/db.ts` | 143 | added `allowed_symbols` and `auto_close_margin_level` columns to `risk_settings` schema |
| `backend/database/db.ts` | 218-221 | migration (`ALTER TABLE`) for existing DBs that lack the new columns |
| `backend/database/db.ts` | 530 | new `dbGetRiskSettings()` getter |
| `backend/services/tradeStore.ts` | 24 | imported `dbGetRiskSettings` |
| `backend/services/tradeStore.ts` | 104 | constructor loads saved config on startup |
| `backend/services/tradeStore.ts` | 314 | whitelist check made case-insensitive (`some((s) => s.toUpperCase() === sym)`) |

## Verified

Whitelist survives `npm run dev` restarts. `buy "Step Index"` works on a fresh server without re-calling `mt5_configure_risk_guard`.

## Note

The `data/mt5_bridge.sqlite` file must be deleted (or migrated) once so the new schema takes effect — the migration only runs on existing databases.