# Conventions

## Code

- ESM only (`.mjs` extension, `type: "module"` in package.json)
- Named exports only — no default exports
- JSDoc for types — no TypeScript
- Biome for lint + format (no ESLint, no Prettier)
- Functions under 50 lines; early returns to reduce nesting
- Errors: throw with context message, never swallow

## Tier Module Interface

Every file in `src/tiers/` exports exactly:
```js
export const meta = { id: "t0-rtk", name: "RTK", modes: ["fast", "deep", "repair"] };
export async function check(config, context) { /* returns TierResult */ }
export async function repair(config, context) { /* returns TierResult */ }
```

## Naming

- Files: `kebab-case.mjs`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Types (JSDoc): `PascalCase`

## Testing

- Vitest (`tests/**/*.test.mjs`)
- 80% coverage threshold
- Mock external calls (Docker, PM2, network, filesystem state)
- Each tier has a dedicated test file in `tests/tiers/`
- Test TierResult shape + severity for each scenario

## Git

- Conventional commits enforced by commitlint + lefthook
- SSH signing for all commits
- Branches: `feature/*`, `fix/*`, `chore/*`
- Squash-and-merge as default
