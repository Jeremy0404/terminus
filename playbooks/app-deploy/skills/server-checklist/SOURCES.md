# Sources

- Terminus decisions for this playbook (the grill of the app-deploy station, 2026-09-26): the checklist lives in the repository and in a final gate in Terminus; host values stay in a local file and in the task notes, never in a committed file.
- GitHub Docs, "Using secrets in GitHub Actions": repository secrets for workflows: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
- GitHub CLI manual, `gh secret set`: https://cli.github.com/manual/gh_secret_set
- GitHub Docs, "Generating a new SSH key": `ssh-keygen -t ed25519 -C <comment>`: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/generating-a-new-ssh-key-and-adding-it-to-the-ssh-agent
- GitHub Docs, "Working with the Container registry": `docker login ghcr.io` with a token that can read packages: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- Let's Encrypt, "How It Works": the certificate authority checks that the host controls the domain, so DNS comes before the certificate: https://letsencrypt.org/how-it-works/
- age, key generation with `age-keygen` and encryption to a recipient: https://github.com/FiloSottile/age

Researched 2026-09-26.
