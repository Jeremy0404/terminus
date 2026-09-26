# Sources

- Terminus decisions for this playbook (the grill of the app-deploy station, 2026-09-26): check what is visible from outside before closing the station, without SSH; a missing item sends the station back to the checklist.
- Node.js, `dns.promises.resolve4`: resolves A records through the network's DNS servers, not `/etc/hosts`: https://nodejs.org/api/dns.html
- curl manual: `--write-out '%{http_code}'`, and a non-zero exit on a certificate or connection failure: https://curl.se/docs/manpage.html
- GitHub CLI manual, `gh secret list`: lists secret names, never values: https://cli.github.com/manual/gh_secret_list

Researched 2026-09-26.
