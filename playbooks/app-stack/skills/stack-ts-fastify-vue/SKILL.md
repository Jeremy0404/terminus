---
name: stack-ts-fastify-vue
description: "Stack playbook: a TypeScript web app in a pnpm monorepo with a Fastify API, Kysely on PostgreSQL and a Vue 3 client built with Vite, shipped as one Docker image. The user's usual shape for a self-hosted web app. Use when choosing or scaffolding a web app served from the user's own server, for one person reached from a phone or for several people with accounts."
metadata:
  playbook: terminus/app-stack
  kind: stack
---

# TypeScript: Fastify, Kysely, PostgreSQL, Vue 3

## Fits

- The default for anything self-hosted on the user's server, behind their reverse proxy, next to their other apps (partants, holiday-planner, tiny-prm, batchapp-melealis).
- One person reaching the app from a phone, or several people (household, club, friends) with accounts; relational data; a phone-friendly UI.

## Does not fit

- A single-user tool on one machine (use `stack-ts-hono-sqlite-react`), or content without a backend (use `stack-static-site`).

## Layout

- `pnpm-workspace.yaml` with `server/`, `client/` and `shared/`; `shared` holds the types and schemas both sides use, linked with the `workspace:` protocol.
- `server/`: Fastify with typed routes (a type provider such as `@fastify/type-provider-typebox`), Kysely with `PostgresDialect`, migrations in `server/migrations/`, one module per domain area (routes, service, queries); no business logic in route handlers.
- `client/`: Vue 3 created with `create-vue` (Vite, TypeScript, Composition API with `<script setup>`, Vue Router, Pinia); server state through a query library, UI strings through `vue-i18n`.
- `e2e/`: Playwright against the built app.
- `Dockerfile` (multi-stage: install and build, then a slim runtime with only the server, the built client and production dependencies), `docker-compose.yml` for local PostgreSQL.

## Conventions

- Validate every request body and query with the route schema; return typed errors.
- Migrations are forward-only files, run at start-up.
- Accounts: OpenID Connect against the user's identity provider when one exists, otherwise sessions with argon2-hashed passwords.

## Verification

- lint: `pnpm run lint`
- typecheck: `pnpm run typecheck`
- test: `pnpm run test`
- build: `pnpm run build`
