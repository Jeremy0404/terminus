---
name: server-check
description: Checks from outside, without SSH, what the one-time server steps of a newly deployed app should have made visible (the subdomain resolving to the host, HTTPS answering with a valid certificate, the deploy secrets named on the repository), and reports whether the station is ready or what is still missing. Use in the server-check phase of a Terminus app-deploy station.
metadata:
  playbook: terminus/app-deploy
  phase: server-check
---

# Server check

The human confirmed the server checklist. Before the station closes, check the three things that can be seen from outside. Anything missing sends the station back to the checklist, with what you saw.

## Inputs

- **The subdomain**: from the decisions in the prompt, or from `deploy/README.md` in your working copy.
- **`publicIp`**: from `${TERMINUS_HOME:-$HOME/.terminus}/deploy-host.yaml`.
- **The repository**: `<owner>/<slug>`, from the `origin` remote.

## Checks

Run each one once. Record what it printed.

1. **`dns`**: the subdomain resolves to `publicIp`. The machine may have no `dig`, so use:

   ```sh
   node -e "require('dns').promises.resolve4(process.argv[1]).then((a) => console.log(a.join(' ')), (e) => { console.log(e.code); process.exit(1); })" <subdomain>
   ```

   It passes when the printed addresses include `publicIp`.
2. **`https`**: HTTPS on the subdomain completes with a valid certificate:

   ```sh
   curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://<subdomain>/
   ```

   It passes when `curl` exits 0, whatever the HTTP status. A 502 is expected before the first release. A certificate or connection error fails it.
3. **`secrets`**: the repository has the deploy secrets. Use `gh secret list --repo <owner>/<slug>`, which prints names only. It passes when the names include `RELEASE_PLEASE_TOKEN`, `SSH_HOST`, `SSH_USER`, `SSH_PORT` and `SSH_KEY`. If the command itself fails (for example, no admin rights on the repository), the check fails with that error.

## Output

Return the structured output the phase requests: `{ "summary", "ready", "missing": [ { "check", "detail" } ] }`.

- `ready` is `true` only when all three checks pass, and `missing` is then empty.
- Otherwise, add one item per failed check. `check` is `dns`, `https` or `secrets`. `detail` says in one sentence what was expected and what you saw. Examples: "resolves to nothing (ENOTFOUND)", "SSH_KEY and SSH_PORT are not set".

## Rules

- Never print, read or ask for a secret value; only secret names.
- Do not SSH to the host, do not retry in a loop, and change nothing: not the repository, not the task notes.
