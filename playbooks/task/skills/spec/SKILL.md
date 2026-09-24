---
name: spec
description: Writes the task specification in the task notes folder after exploring the code read-only — behaviour, scope, the files and interfaces involved, and checkable acceptance criteria — and gives a verdict on the task (continue, close, split or lighten). Use in the spec phase of a Terminus task, before any code changes.
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
3. Return the structured output the phase requests: a short `summary`, and a `verdict` on the task itself:
   - `continue` — the normal case.
   - `close` — nothing to do: the behaviour already exists (`already-done`), no longer makes sense (`obsolete`) or is covered by another station (`duplicate`). Put the proof in `evidence`: the merged pull request, commit or file that already does it.
   - `split` — more than one reviewable pull request of work; list the `stations` (title and why), each self-contained.
   - `lighten` — the change fits in one sentence and has no open question, so grill and plan would add nothing.
   The human decides; give the `reason` in one or two sentences.

## Rules

- Name real paths and symbols you have read, not ones you expect to exist.
- Prefer concrete examples (inputs and expected outputs) over abstract rules.
- If the task is too big for one pull request, say so under **Scope** and propose how to split it.
