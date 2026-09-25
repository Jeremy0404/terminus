---
name: scaffold
description: Lays the foundation of a new app from its approved brief and stack (the stack's layout, one thin slice working end to end, tests, the verification commands passing, CI running them, a README and the container build). Use in the execute phase of a Terminus app-scaffold station.
metadata:
  playbook: terminus/app-scaffold
  phase: execute
---

# Scaffold

The repository holds only an empty first commit. Build the foundation every later station extends. The approved brief and stack are in your system prompt ("Product brief (approved)" and "Stack and architecture (approved)").

## Steps

1. Load the chosen stack's skill with the Skill tool (its name is in the stack section, for example `stack-ts-fastify-vue`) and follow its layout and conventions; an approved decision wins where it is more specific.
2. Create the project with the official generators the stack skill names, then trim what the app does not need. Use the latest stable versions; the lock file pins them.
3. Build one thin slice end to end: the smallest piece of the brief's core job that crosses every layer (for a web app: one table, one API route, one screen that shows it). Nothing more of the brief; the next stations build the rest.
4. Tests: a unit test in each layer that holds logic, and one end-to-end check of the slice when the stack has end-to-end tests.
5. Make every verification command listed in the prompt pass in your working copy, installing dependencies first; they are the app's deterministic barrier.
6. CI: a GitHub Actions workflow that installs dependencies and runs the same commands on pull requests and on the base branch.
7. `README.md` for someone who clones the repository: what the app is (one paragraph from the brief), how to run it locally, how to run the checks.
8. Commit in small conventional commits (`chore:`, `feat:`, `test:`, `ci:`, `docs:`).

## Rules

- No feature beyond the thin slice, and no placeholder screens for later features.
- No secret in the repository: configuration through environment variables, documented in a committed `.env.example`.
- Plans, specs and other development notes stay in the task notes folder, not in the repository.
