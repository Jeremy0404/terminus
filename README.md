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

For daily use, build once (`pnpm run build`) and run the daemon alone (`node apps/daemon/dist/main.js`):
it serves the built web app itself at `http://localhost:4317` (`TERMINUS_WEB_DIR` points elsewhere).

## Remote access (tailnet only)

The daemon listens on loopback only. To reach it from your phone, publish it on your tailnet with
Tailscale Serve on the machine that runs it (on Windows with WSL, the Windows Tailscale reaches the
daemon through WSL's localhost forwarding):

```bash
tailscale serve --bg 4317
```

Then set `TERMINUS_OWNER_LOGIN` (your Tailscale login, e.g. in `~/.terminus/.env`) and restart the
daemon. Requests that come through Serve are accepted only when Tailscale identifies you; without
`TERMINUS_OWNER_LOGIN` every remote request is refused. Never use Tailscale Funnel for Terminus.

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

Agent runs use `~/.terminus/agent-home` as their Claude Code configuration folder, rebuilt at each
daemon start: Terminus's playbook skills, plus only what you allow in `~/.terminus/agent.json`:

```json
{
  "skills": ["~/.claude/skills/graphify"],
  "mcpServers": { "my-server": { "command": "my-mcp-server" } }
}
```

Bundled Claude Code skills, auto memory, a repository's `.claude/settings.json` (hooks included),
its `.claude/skills` and unlisted MCP servers are left out; the repository's `CLAUDE.md` is still
read. At the start of every run Terminus checks what the agent actually loaded; anything unexpected
stops the run before its first action and blocks the task with the details. Task worktrees live in `~/.terminus/worktrees`, task
notes (spec, plan) in `~/.terminus/tasks`, and the database in `~/.terminus/terminus.db`.

Other modes:

- `TERMINUS_AGENT=demo` — a scripted demo agent, no Claude involved (the default for `pnpm dev`).
- `TERMINUS_AGENT_ISOLATION=off` — run agents on your own Claude Code configuration instead.
- `TERMINUS_HOME`, `TERMINUS_PORT`, `TERMINUS_CONCURRENCY` — data folder, daemon port, parallel runs.
- `TERMINUS_PROJECTS_DIR` — where "Nouvelle app" creates repositories (default `~/dev/projects`).
- `TERMINUS_VAULT_DIR` — an Obsidian vault (a git repository) to export approved briefs, architecture decisions and validated plans into, under `Projects/<app>/`, each export in its own commit; also read from `~/.terminus/.env`. Unset, nothing is exported.

## Scripts

- `pnpm dev` — run the daemon and the web UI together, with reload.
- `pnpm run lint` — lint the whole repository with ESLint.
- `pnpm run typecheck` — type-check every workspace.
- `pnpm test` — run every workspace's tests.
- `pnpm run build` — build every workspace.
