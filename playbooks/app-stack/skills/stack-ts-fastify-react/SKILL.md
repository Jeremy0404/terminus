---
name: stack-ts-fastify-react
description: "Stack playbook: a TypeScript web app in a pnpm monorepo with a Fastify API, Kysely on PostgreSQL and a React client built with Vite, shipped as one Docker image. Use instead of the Vue variant when the screens are data-heavy (large tables, charts) or the human asks for React."
metadata:
  playbook: terminus/app-stack
  kind: stack
---

# TypeScript: Fastify, Kysely, PostgreSQL, React

## Fits

- The same apps as `stack-ts-fastify-vue`, when the screens are data-heavy (large tables, charts) as in budget-analyser, or when the human asks for React.

## Does not fit

- A single-user tool on one machine (use `stack-ts-hono-sqlite-react`), or content without a backend (use `stack-static-site`).

## Layout

- `pnpm-workspace.yaml` with `server/`, `client/` and `shared/`; `shared` holds the types and schemas both sides use, linked with the `workspace:` protocol.
- `server/`: Fastify with typed routes (a type provider such as `@fastify/type-provider-typebox`), Kysely with `PostgresDialect`, migrations in `server/migrations/`, one module per domain area (routes, service, queries); no business logic in route handlers.
- `client/`: React created with Vite's `react-ts` template; routing with a router library, server state through TanStack Query, UI strings through `react-i18next`.
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
