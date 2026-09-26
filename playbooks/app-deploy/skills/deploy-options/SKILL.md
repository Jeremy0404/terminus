---
name: deploy-options
description: Prepares the production deployment of a newly scaffolded app by reading what the app already does (its datastore, migrations, port, health route and services) and the local host profile, then asks the human, as decision cards with one recommendation each, only the choices that change the deploy files, starting with the subdomain. Use in the deploy-options phase of a Terminus app-deploy station.
metadata:
  playbook: terminus/app-deploy
  phase: deploy-options
---

# Deploy options

The next phase renders the deploy pipeline from templates, shaped by what the app does. Settle here everything that render needs and the code does not already answer. Recommend from what the app already does and needs. Use the stack catalog's defaults only when several choices really fit.

## Steps

1. **Host profile.** Read `${TERMINUS_HOME:-$HOME/.terminus}/deploy-host.yaml`. It must hold `domainSuffix`, `publicIp`, `sshAlias`, `proxyContainer`, `registry` (for example `ghcr.io/<owner>`) and `loopbackPorts` (for example `3000-3999`).
   - If the file or a key is missing, return one card and nothing else. Its question names the file and every missing key, and says that the Terminus README, section "Production deployments", documents them. Offer two options: "I wrote the file, check again" (recommended) and "This app will not go to production". Answering it resumes this phase, which reads the file again.
   - `registry` must end with the owner of the repository's `origin` remote, case-insensitively. If it does not, return one card that says so, with the same two options.
2. **The app.** Read the repository and write down the facts the render needs:
   - what the app stores and where: PostgreSQL, a SQLite or other file (its path and the variable that sets it), or nothing;
   - whether it applies its migrations at start-up, and if not, the command that applies them;
   - the port it listens on inside its container, and a route that answers 200 without side effects (its health route, or `/` for a static site);
   - the runtime base image of its `Dockerfile` (Node, or nginx/BusyBox);
   - the services its local `docker-compose.yml` starts.
3. **Cards**, at most four per round, two to four options each, exactly one recommended with its reason. State the facts from step 2 that support the recommendation in each card's descriptions.
   - **Always, first round: the subdomain.** Build the options from the slug and `domainSuffix`: `<slug>.<domainSuffix>`, a shorter form of the slug, and so on. Recommend the one that reads best.
   - **Only for a real fork:**
     - the datastore shape, when the code does not settle it. Example: a SQLite file the app could keep in a mounted volume, or a move to PostgreSQL. Recommend what the app already does.
     - the migration step, only when the app does not migrate itself: a `migrate.sh` run before each deploy (recommended), or making the app migrate at start-up in a later station;
     - a service no template block covers (a second service, a queue): write it under the same rules, or leave it out of this station.
4. Return the structured output the phase requests: `{ "decisions": [ { "question", "options": [ { "label", "description", "recommended" } ] } ] }`. Return an empty `decisions` array once the subdomain and every fork that changes the render are settled.

## Rules

- Never ask for a secret: no password, token, webhook URL or key. Secrets go on the host and in the repository's Actions secrets, through the one-time checklist.
- The port, the health route, whether the app migrates itself, and the runtime image are read from the code, not asked. Ask only when the code is ambiguous.
- Card text never includes the public IP, the SSH alias or the reverse-proxy container name.
- Change nothing in the repository.
- Write the cards in the language of the brief.
