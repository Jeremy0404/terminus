---
name: server-checklist
description: Writes the one-time server checklist of a newly deployed app (DNS, reverse proxy, server files and settings, deploy key, repository secrets, registry login, backups) with every exact value filled in from the merged deploy files, the decisions and the local host profile, for the human to follow before confirming. Use in the server phase of a Terminus app-deploy station.
metadata:
  playbook: terminus/app-deploy
  phase: server
---

# Server checklist

The deploy pipeline is merged. Before the first release can reach production, the human does a few one-time steps on the server and on GitHub. Write them as a checklist with every value filled in, so that nothing has to be looked up. The station then waits for the human to confirm.

## Inputs

- `deploy/README.md` and `deploy/.env.example` in your working copy: the app's own values (the domain, the proxy target, the network, the secret names and the `.env` keys).
- The decisions in the prompt: the subdomain and the datastore shape.
- The host profile, `${TERMINUS_HOME:-$HOME/.terminus}/deploy-host.yaml`: `publicIp`, `sshAlias`, `proxyContainer`, `registry` and `loopbackPorts`.
- The `origin` remote (`<owner>/<slug>`).

## Steps

1. Write `checklist.md` in the task notes folder named in the prompt, never in the repository. Use one `- [ ]` line per step, grouped under short headings, in the language of the brief:
   1. **DNS**: an `A` record for the subdomain pointing to `publicIp`.
   2. **Reverse proxy**: on the `proxyContainer` host, a proxy host for the subdomain that forwards over `http` to `<slug>-app-1:<internal port>`, with a Let's Encrypt certificate and HTTPS forced. Say that it answers 502 until the first release runs.
   3. **Server files**:
      - `ssh <sshAlias> 'mkdir -p ~/<slug>/deploy'`;
      - from a checkout of the merged main branch, `scp -p deploy/* <sshAlias>:~/<slug>/deploy/`;
      - then, on the host, `cp deploy/.env.example deploy/.env && chmod 600 deploy/.env`.
   4. **Server settings**: the exact `deploy/.env` lines.
      - `APP_PORT=<port>`: propose a port in `loopbackPorts`, and give the command that shows the ports already taken, `ssh <sshAlias> "ss -ltnH | awk '{print \$4}'"`.
      - `PROXY_CONTAINER=<proxyContainer>`.
      - With a datastore, one line per backup key: `BACKUP_AGE_RECIPIENT` (from `age-keygen -o <slug>-backup-key.txt`, with the private key stored off the host), and `BACKUP_OFFHOST_DESTINATION` and `BACKUP_ALERT_DISCORD_WEBHOOK` (optional).
      - With PostgreSQL, a fresh `POSTGRES_PASSWORD` (`openssl rand -base64 24`).
   5. **Registry**: `ssh <sshAlias> docker login <registry host>` with a token that can read packages, unless the host is already logged in.
   6. **Deploy key**:
      - `ssh-keygen -t ed25519 -N '' -C <slug>-ci-deploy -f <slug>-ci-deploy`;
      - append `<slug>-ci-deploy.pub` to the deploy user's `~/.ssh/authorized_keys` on the host.
   7. **Repository secrets**, one `gh secret set <NAME> --repo <owner>/<slug>` line each:
      - `SSH_HOST` (`publicIp`), `SSH_PORT` and `SSH_USER` (`ssh -G <sshAlias> | grep -E '^(user|port) '` shows them);
      - `SSH_KEY` (`< <slug>-ci-deploy`);
      - `RELEASE_PLEASE_TOKEN` (a fine-grained token with contents and pull requests write on this repository).
   8. **Backups**, with a datastore only: the two crontab lines from `deploy/README.md`.
2. End the file with two notes:
   - "Terminus then checks from outside what it can see: DNS, HTTPS and the secret names."
   - The first "Déployer vX" click brings the stack up. `deploy/rollback.sh` starts it and joins the reverse proxy.
3. **On a retry**, the prompt says what the outside check did not find. Put those items first, under a heading that marks them as still missing, with what the check saw. Keep the rest of the checklist below.

## Rules

- `checklist.md` is the only place that holds the public IP, the SSH alias and the reverse-proxy container name. Never write them into the repository.
- Never generate, read or print a secret yourself. The checklist gives the human the commands.
- Do not SSH to the host, and do not change the repository.
