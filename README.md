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
- `TERMINUS_DISCORD_WEBHOOK` — a Discord webhook (a dedicated channel) told when a release is launched from Terminus and when it succeeds or fails; a success says "en production" only when the deployment job is confirmed, "publiée" otherwise; also read from `~/.terminus/.env`.
- `TERMINUS_VAULT_DIR` — an Obsidian vault (a git repository) to export approved briefs, architecture decisions and validated plans into, under `Projects/<app>/`, each export in its own commit; also read from `~/.terminus/.env`. Unset, nothing is exported.

## Using the cockpit

Opening a station gives it most of the screen; the map folds into a panel beside it, and the
agent settings and the other actions (skip a phase, switch track, close without merge) open on
demand. Progress counts every station by outcome: integrated through Terminus, already done
elsewhere, in progress, to do, and each closure reason. Neither a merge nor a published release
counts as production. The action board groups decisions, blockers and stations ready to start,
says how many stations each one unblocks, and keeps the requests of other lines visible while you
work in one. "Depuis ta dernière visite" and "Reprendre là où j'en étais" come from the browser's
local storage, so they are not shared between devices.

Use **Nouvelle app** to keep an idea in the workshop before creating a GitHub repository. Drafts
and the product journal are stored in the daemon database, so they are available from another
device connected to the same Terminus. Save a draft before closing the browser. The journal's
purpose, audience, exclusions and decisions accompany subsequent agent runs.

The cockpit offers focused views for decisions, ongoing work, deliveries and the map. Map search
also has a list view; an itinerary includes a chosen line and its dependencies. It does not select
the contents of a release. The delivery view uses the release pull request and its checks; a
successful publication is distinct from a verified deployment job. Enter the app URL in the
product journal to open it after a confirmed deployment. Deployment confirmation currently
recognizes a successful job named `deploy` in `.github/workflows/release.yml`.

Station dossiers expose the available `spec.md` and `plan.md` from the station's notes folder
(`~/.terminus/tasks/<task>/`). Optional preview links can be supplied in `preview.json` in the
same folder:

```json
{"before":"https://example.com/current","after":"https://example.com/preview"}
```

Only HTTP(S) links without embedded credentials are accepted. Previews open separately and are
not generated automatically. Documents are displayed as text, with a notice when an excerpt is
limited to 60,000 characters.

## Scripts

- `pnpm dev` — run the daemon and the web UI together, with reload.
- `pnpm run lint` — lint the whole repository with ESLint.
- `pnpm run typecheck` — type-check every workspace.
- `pnpm test` — run every workspace's tests.
- `pnpm run build` — build every workspace.
