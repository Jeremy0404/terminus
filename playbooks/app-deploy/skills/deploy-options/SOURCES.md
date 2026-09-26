# Sources

- Terminus decisions for this playbook (the grill of the app-deploy station, 2026-09-26): recommend from what the app already does before the stack catalog; host details come from a local file outside git; secrets never pass through Terminus.
- Claude Code best practices, "Let Claude interview you": ask about the hard parts and the trade-offs, not the obvious: https://code.claude.com/docs/en/best-practices
- The Twelve-Factor App, "III. Config": configuration that varies between deploys lives in the environment, not in the code, so no card asks for it: https://12factor.net/config
- Docker Docs, "Persisting container data": a named volume keeps a file-based store across container replacements: https://docs.docker.com/get-started/docker-concepts/running-containers/persisting-container-data/

Researched 2026-09-26.
