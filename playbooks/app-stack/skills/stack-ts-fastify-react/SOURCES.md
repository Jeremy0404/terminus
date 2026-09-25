# Sources

- Fastify, "TypeScript" reference: route typing through generics (`Body`, `Querystring`, `Params`, `Headers`, `Reply`) and type providers such as `@fastify/type-provider-typebox`: https://fastify.dev/docs/latest/Reference/TypeScript/
- Kysely introduction ("a type-safe and autocompletion-friendly TypeScript SQL query builder") and its core dialects, `PostgresDialect` among them: https://kysely.dev/docs/intro, https://kysely.dev/docs/dialects
- React, "Build a React app from scratch": Vite with `npm create vite@latest my-app -- --template react-ts`: https://react.dev/learn/build-a-react-app-from-scratch
- pnpm workspaces: `pnpm-workspace.yaml` at the root and the `workspace:` protocol for local packages: https://pnpm.io/workspaces
- Docker, "Multi-stage builds": copy only the artifacts the final image needs, leaving build tools behind: https://docs.docker.com/build/building/multi-stage/
- The user's shipped app budget-analyser: same server, client and shared layout with a React client, Docker image, Playwright end-to-end tests.

Researched 2026-09-25.
