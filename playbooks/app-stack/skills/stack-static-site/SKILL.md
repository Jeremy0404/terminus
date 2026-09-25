---
name: stack-static-site
description: "Stack playbook: a static site in plain HTML, CSS and JavaScript served by nginx from a small container. Use when choosing or scaffolding content or a small interactive page that needs no server-side data."
metadata:
  playbook: terminus/app-stack
  kind: stack
---

# Static site: HTML, CSS, JavaScript, nginx

## Fits

- A presentation page, a small game or tool whose state fits in the browser (local storage), content edited in the repository.

## Does not fit

- Anything that stores data for several people or needs accounts (use a TypeScript web stack).

## Layout

- `index.html`, `style.css`, `script.js` at the root, `assets/` for images; no build step unless the site outgrows it.
- `nginx.conf` with `root` on the site folder and `try_files $uri $uri/ =404`.
- `Dockerfile` from the official nginx image copying the site and the configuration; `docker-compose.yml` for a local run.

## Conventions

- Semantic HTML, one stylesheet with custom properties for colours, no framework.
- Everything works without JavaScript where possible.

## Verification

- html: `npx --yes html-validate "**/*.html"`
