# Sources

- NGINX, "Serving Static Content": the `root` directive and `try_files`, e.g. `try_files $uri $uri/ =404`: https://docs.nginx.com/nginx/admin-guide/web-server/serving-static-content/
- Docker, "Multi-stage builds" (not needed here, a single stage copying files is enough): https://docs.docker.com/build/building/multi-stage/
- The user's shipped site guichet-des-quetes: `index.html`, `style.css`, `script.js`, `nginx.conf`, `docker-compose.yml`.

Researched 2026-09-25.
