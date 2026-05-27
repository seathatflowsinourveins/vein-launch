# src/ — Implementation

All source is ESM (.mjs). No TypeScript — plain JavaScript with JSDoc types.

Execution: `bin/vein.ps1` → `src/orchestrator.mjs` → `src/tiers/*.mjs` → `exec claude`.

Every tier module exports `{ meta, check, repair }`. Results are `TierResult` objects from `src/lib/result.mjs`.
