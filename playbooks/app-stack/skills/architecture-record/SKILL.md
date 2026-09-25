---
name: architecture-record
description: Records the chosen stack and the architecture decisions of a new app, from the answered decision cards, as short decision records and the verification commands of the stack, for the human's approval. Use in the architecture phase of a Terminus app-stack station.
metadata:
  playbook: terminus/app-stack
  phase: architecture
---

# Architecture record

Turn the answered cards into what every later agent of this app must respect. Once approved, Terminus stores it on the app, adds it to every run's context and uses the verification commands as the app's checks.

## Steps

1. Read the brief (system prompt), the decisions already made that the prompt lists, and load the chosen stack's skill with the Skill tool (for example `stack-ts-fastify-vue`).
2. Write `architecture.md` in the task notes folder: the stack and one short record per decision, each with its context (one sentence from the brief or the card), the decision in active voice, and its consequence for the code.
3. Return the structured output the phase requests:
   - `summary`: one sentence.
   - `stackId`: the chosen stack skill's name, exactly (for example `stack-ts-fastify-vue`); `stackName`: its title.
   - `decisions`: one entry per record, `{ "title", "decision", "why" }`, in the language of the brief, each one sentence.
   - `verification`: the stack's **Verification** commands, exactly as its skill lists them, as `{ "name", "command" }`.

## Rules

- Only what was decided or what the stack skill states; no new choice made silently. If something the scaffold needs is still open, add it as a decision titled "Open:" instead of choosing.
- Three to eight decisions; fewer is better than padded.
