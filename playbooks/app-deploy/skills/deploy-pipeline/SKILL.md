---
name: deploy-pipeline
description: Renders the production deployment pipeline into the app's repository from this skill's templates (a deploy/ folder with the Compose stack, server settings, deploy, prune, migration and backup scripts, the release-please, release and rollback workflows, and the one-time server checklist), shaped by what the app does and the decisions already made. Use in the execute phase of a Terminus app-deploy station.
metadata:
  playbook: terminus/app-deploy
  phase: execute
---

# Deploy pipeline

Add everything the app needs to go to production on a Docker host behind a reverse proxy. Each merged release is then built, signed and deployed by GitHub Actions. The decisions already made for this station are in the prompt. The approved brief and stack are in your system prompt.

**Never write these files from memory.** Every file comes from `templates/` in this skill's own directory (its base directory is given when the skill loads), read fresh in this run.

## Inputs

1. **The host profile**, `${TERMINUS_HOME:-$HOME/.terminus}/deploy-host.yaml`, has the keys `domainSuffix`, `publicIp`, `sshAlias`, `proxyContainer`, `registry` and `loopbackPorts`. This phase needs only `registry`. If the file or that key is missing, stop and say so: the options phase should have caught it.
2. **The repository**:
   - the `origin` remote (`<owner>/<repo>`);
   - the root `Dockerfile` and its runtime base image;
   - the port the app listens on in its container;
   - its health route;
   - where it stores data;
   - whether it applies its migrations at start-up;
   - its local `docker-compose.yml`, if it has one.
3. **The decisions**: the subdomain, the datastore shape, the migration step, and anything else the options phase asked.

## Values

| Placeholder | Value |
|---|---|
| `{{SLUG}}` | the repository name, lowercased |
| `{{SLUG_UNDERSCORE}}` | the slug with `-` replaced by `_` |
| `{{IMAGE}}` | `ghcr.io/<owner>/<repo>`, lowercased. It must equal `<registry>/<slug>` from the host profile; stop if it does not |
| `{{DOMAIN}}` | the chosen subdomain, in full |
| `{{INTERNAL_PORT}}` | the port the app listens on inside its container (for example 80 for nginx) |
| `{{HEALTH_PATH}}` | a route that answers 200 without side effects: the app's health route, or `/` for a static site |
| `{{DATA_DIR}}`, `{{DATA_FILE}}` | the directory and SQLite file the app uses in production (`data-volume` only) |
| `{{MIGRATE_COMMAND}}` | the command that applies migrations inside the release image (`migrate` only) |
| `{{RELEASE_TYPE}}` | `node` when the repository has a root `package.json`, otherwise `simple` |
| `{{VERSION}}` | the root `package.json` version, or `0.1.0` |

## Blocks

Templates hold optional blocks between a `# >>> <block>` line and a `# <<< <block>` line. In Markdown they are `<!-- >>> <block> -->` and `<!-- <<< <block> -->`.

| Block | Keep it when |
|---|---|
| `postgres` | the app stores its data in PostgreSQL |
| `data-volume` | the app stores its data in a SQLite file (never together with `postgres`) |
| `migrate` | the app does not apply its migrations at start-up (decided in the options phase) |
| `node` | the runtime image has Node (the health check uses `fetch`) |
| `busybox` | the runtime image has no Node but has BusyBox `wget`, like `nginx:alpine` |

Keep exactly one of `node` and `busybox`. Keep at most one of `postgres` and `data-volume`.

## Rendering rules

1. **Kept block**: delete only its two marker lines. **Dropped block**: delete the marker lines and every line between them.
2. **Placeholders**: replace every `{{UPPER_SNAKE}}` with its value. Leave GitHub expressions such as `${{ github.actor }}` and lowercase Go templates such as `{{.Image}}` exactly as they are.
3. **Final check**: no `{{UPPER_SNAKE}}` and no marker line may remain in a written file.

## Files

| Template | Written to | When |
|---|---|---|
| `docker-compose.prod.yml` | `deploy/docker-compose.prod.yml` | always |
| `env.example` | `deploy/.env.example` | always |
| `rollback.sh` | `deploy/rollback.sh` | always |
| `prune-images.sh` | `deploy/prune-images.sh` | always |
| `migrate.sh` | `deploy/migrate.sh` | `migrate` |
| `backup.sh`, `backup-freshness-check.sh` | `deploy/` | `postgres` or `data-volume` |
| `deploy-README.md` | `deploy/README.md` | always |
| `release-please.yml`, `release.yml`, `rollback.yml` | `.github/workflows/` | always |
| `release-please-config.json` | `release-please-config.json` | always |
| `release-please-manifest.json` | `.release-please-manifest.json` | always |

## Steps

1. Load the stack's skill named in the stack section, if it has one, for its conventions.
2. Read the repository and derive every value and block above. Where the app reads its data path from an environment variable, add that variable to the `app` service's `environment` so it points at `{{DATA_DIR}}/{{DATA_FILE}}`.
3. Read each template, apply the rules and write the file. If a file already exists at the target path, merge: keep what the app added, bring in what the template adds, and note it.
4. `chmod +x deploy/*.sh`. Git keeps the executable bit.
5. Add `deploy/.env` and `deploy/backups/` to `.gitignore`.
6. Validate before committing:
   - every YAML file parses (`python3 -c "import sys, yaml; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" <files>`);
   - `bash -n` passes on every script;
   - when Docker is available, `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.example config -q` passes;
   - the final check of the rendering rules holds.
7. Add a short "Deployment" section to `README.md`. Say how a release reaches production, and point to `deploy/README.md` for the one-time server steps and rollbacks.
8. Write `pull-request.md` in the task notes folder, not in the repository. Terminus adds it to the pull request body. Include:
   - the shape you rendered (datastore, runtime, migration step, internal port, health path, domain), with the fact in the code that led to each choice;
   - anything you wrote outside the templates;
   - then the line "One-time server steps: see `deploy/README.md`."
9. Commit in conventional commits (`ci:` for the workflows, `feat:` for `deploy/`, `docs:` for the README).

## Rules

- **No host value in a committed file.** The public IP, the SSH alias and the reverse-proxy container name come only from the host profile, and none of them belongs in the repository or in `pull-request.md`. Committed files refer to the host by its role: "the Docker host", "the reverse-proxy container".
- **No secret anywhere.** Secrets go in `deploy/.env` on the host and in the repository's Actions secrets, never in a file you write.
- **Keep the defended rules** in whatever you write outside the templates:
  - a pinned project `name:`;
  - a `mem_limit` on every service;
  - ports on `127.0.0.1` only;
  - a health check that sends `X-Forwarded-Proto: https`.

  Example: a second service or a queue the blocks do not cover. Flag it in `pull-request.md`.
- Never change the app's own behaviour. The one exception is a missing health route, and only when no existing route can serve as one. Flag it.
- Workflow actions stay pinned by commit SHA, as in the templates.
