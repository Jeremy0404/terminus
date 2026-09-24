---
name: spec
description: Writes the task specification in the task notes folder after exploring the code read-only — behaviour, scope, the files and interfaces involved, and checkable acceptance criteria. Use in the spec phase of a Terminus task, before any code changes.
metadata:
  playbook: terminus/task
  phase: spec
---

# Spec

Turn the task title and its context into a specification another agent could implement in a fresh session without asking anything.

## Steps

1. Explore before writing. Read the code, tests and docs the task touches. Do not modify any file in the repository during this phase.
2. Write `spec.md` in the task notes folder named in the prompt, with these sections:
   - **Problem** — what is wrong or missing today, in two or three sentences.
   - **Behaviour** — what the user or caller observes once the task is done.
   - **Scope** — what changes. **Out of scope** — what explicitly does not.
   - **Where** — the files, modules and interfaces involved, by path.
   - **Acceptance criteria** — each one a check that returns pass or fail: a test to write, a command and its expected output, a behaviour to observe.
   - **End-to-end verification** — the single check that proves the whole task works.
   - **Open questions** — anything only the human can decide. Leave them for the grill phase; do not guess.
3. End with a short summary of the spec and the open questions.

## Rules

- Name real paths and symbols you have read, not ones you expect to exist.
- Prefer concrete examples (inputs and expected outputs) over abstract rules.
- If the task is too big for one pull request, say so under **Scope** and propose how to split it.
