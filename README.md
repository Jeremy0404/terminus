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

## Running agents

Terminus drives the Claude Code CLI headless, isolated from your own Claude Code configuration:

1. Generate a one-year token for your subscription: `claude setup-token`.
2. Store it outside any repository, readable only by you:

   ```bash
   mkdir -p ~/.terminus
   echo 'CLAUDE_CODE_OAUTH_TOKEN=<token>' > ~/.terminus/.env
   chmod 600 ~/.terminus/.env
   ```

3. Start the daemon with `pnpm --filter @terminus/daemon start` (after `pnpm run build`).

Agent runs use `~/.terminus/agent-home` as their Claude Code configuration folder, so they load
Terminus's playbook skills and none of yours. Task worktrees live in `~/.terminus/worktrees`, task
notes (spec, plan) in `~/.terminus/tasks`, and the database in `~/.terminus/terminus.db`.

Other modes:

- `TERMINUS_AGENT=demo` — a scripted demo agent, no Claude involved (the default for `pnpm dev`).
- `TERMINUS_AGENT_ISOLATION=off` — run agents on your own Claude Code configuration instead.
- `TERMINUS_HOME`, `TERMINUS_PORT`, `TERMINUS_CONCURRENCY` — data folder, daemon port, parallel runs.

## Scripts

- `pnpm dev` — run the daemon and the web UI together, with reload.
- `pnpm run lint` — lint the whole repository with ESLint.
- `pnpm run typecheck` — type-check every workspace.
- `pnpm test` — run every workspace's tests.
- `pnpm run build` — build every workspace.
