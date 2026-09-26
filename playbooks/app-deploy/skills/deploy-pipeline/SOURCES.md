# Sources

- Docker Docs, "Version and name top-level elements": the top-level `name` sets the project name, and container, network and volume names derive from it. Hence `name: {{SLUG}}` is pinned: https://docs.docker.com/reference/compose-file/version-and-name/
- Docker Docs, "Specify a project name": by default Compose names the project after the Compose file's directory, here `deploy`: https://docs.docker.com/compose/how-tos/project-name/
- Docker Docs, Compose "Services top-level elements": `mem_limit`, `ports` with a host IP, `healthcheck`, `depends_on` with `condition: service_healthy`: https://docs.docker.com/reference/compose-file/services/
- Docker Docs, "Resource constraints": by default a container has no memory limit and can use all of the host's memory. Hence a `mem_limit` on every service, and a Node heap cap below it: https://docs.docker.com/engine/containers/resource_constraints/
- Node.js, command-line options, `--max-old-space-size`: https://nodejs.org/api/cli.html
- Docker Docs, `docker image prune`: dangling-image pruning does not remove old tagged releases. Hence `prune-images.sh` removes this app's own old version tags explicitly: https://docs.docker.com/reference/cli/docker/image/prune/
- release-please, "Manifest Driven release-please": `release-please-config.json` with `packages` and `changelog-sections`, and `.release-please-manifest.json` holding the current version: https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md
- release-please-action, inputs `token`, `config-file` and `manifest-file`: https://github.com/googleapis/release-please-action
- GitHub Docs, "Triggering a workflow", section "Triggering a workflow from a workflow": events triggered by `GITHUB_TOKEN` do not create a new workflow run, except `workflow_dispatch` and `repository_dispatch`. Hence `RELEASE_PLEASE_TOKEN` pushes the tag that starts `release.yml`: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- GitHub Docs, "Use GITHUB_TOKEN for authentication in workflows": per-job `permissions`: https://docs.github.com/en/actions/tutorials/authenticate-with-github_token
- Sigstore, "Verifying signatures": keyless `cosign verify` with `--certificate-identity-regexp` and `--certificate-oidc-issuer`: https://docs.sigstore.dev/cosign/verifying/verify/
- GitHub Docs, "Using secrets in GitHub Actions": repository secrets, set with `gh secret set` and never printed: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- GitHub Docs, "Secure use reference": pin actions to a full commit SHA, and pass inputs through environment variables rather than inline expressions in `run`: https://docs.github.com/en/actions/reference/security/secure-use
- SQLite, "Using the SQLite Online Backup API", and the CLI's `.backup` command: a consistent copy of a live database: https://sqlite.org/backup.html and https://sqlite.org/cli.html
- age, file encryption to a public-key recipient (`age -r`): https://github.com/FiloSottile/age
- The pipeline these templates adapt was proven by hand on two apps before being written down. Three lessons it encodes: a pinned Compose project name, bounded image accumulation, and bounded container memory.

Researched 2026-09-26.
