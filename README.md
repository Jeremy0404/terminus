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
```

## Scripts

- `pnpm run lint` — lint the whole repository with ESLint.
- `pnpm run typecheck` — type-check every workspace.
- `pnpm test` — run every workspace's tests.
- `pnpm run build` — build every workspace.
