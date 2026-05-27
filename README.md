# vein-launch

SOTA Claude Code launcher. Prechecks environment health, manages CLIProxy and RTK, launches Claude with maximum quality gates.

## Quick Start

```bash
npm install
vein trading        # Fast launch (≤5s)
vein trading --deep # Full precheck (≤30s)
vein --setup        # First-time setup
```

## Architecture

Three-location design: source code (`C:\SEA\`), tool state (`~/`), containers (WSL2 `~/docker/`).

Seven-tier precheck: RTK → ENV → CLIProxy → CLI Tools → GitHub → Drift → CodeGraph.

## Development

```bash
npm test           # Run tests
npm run lint       # Biome check
npm run lint:fix   # Auto-fix
```

## License

MIT
