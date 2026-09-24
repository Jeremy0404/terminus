# Terminus

Cockpit personnel self-hosted qui pilote des agents IA pour mener une app de l'idée à la prod — planification, grill, exécution tâche par tâche, vérification, review, déploiement — visualisé comme un plan de métro.

## Prerequisites

- Node.js 22+
- pnpm 12 (via Corepack: `corepack enable`)
- Git
- Claude Code CLI, authenticated (Terminus drives it headless)

## Getting started

```bash
corepack enable
pnpm install
pnpm dev
```

`pnpm dev` starts the daemon on `http://127.0.0.1:4317` and the web UI on Vite's dev server,
which proxies `/api` to the daemon. Set `TERMINUS_PORT` to use another daemon port.

## Scripts

- `pnpm dev` — run the daemon and the web UI together, with reload.
- `pnpm run lint` — lint the whole repository with ESLint.
- `pnpm run typecheck` — type-check every workspace.
- `pnpm test` — run every workspace's tests.
- `pnpm run build` — build every workspace.
