# Contributing

## Setup

```bash
git clone <repo>
cd vein-launch
npm install
npx lefthook install
```

## Development

- ESM only (`.mjs` files)
- Biome for lint + format
- Vitest for tests (80% coverage)
- Conventional commits enforced

## Adding a Tier

1. Create `src/tiers/tN-name.mjs` exporting `{ meta, check, repair }`
2. Add to `src/tiers/index.mjs` registry
3. Add to `config/default.json` mode tier lists
4. Write tests in `tests/tiers/tN-name.test.mjs`
5. Document in `agent_docs/tiers.md`
