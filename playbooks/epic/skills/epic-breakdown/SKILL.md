---
name: epic-breakdown
description: Drafts an epic's description and breaks it into proposed stations — each one reviewable pull request, ordered, with real dependencies only — after exploring the code read-only. Use when Terminus asks for an assisted epic breakdown.
metadata:
  playbook: terminus/epic
  phase: breakdown
---

# Epic breakdown

Turn the human's brief for an epic into a short description and a list of stations another agent can take one by one. The human edits and accepts your proposal; nothing is created until then.

## Steps

1. Read the brief and the stations already on the network, listed in the prompt. Never propose one of them again.
2. Explore the code the epic touches. This is a disposable checkout: read, do not change anything.
3. Write the `description`: the outcome in one sentence, then what is in scope and what is not, in a few short lines.
4. Break the work into `stations`, in the order they should be built:
   - each station is one self-contained, reviewable pull request that leaves the product working;
   - prefer vertical slices that deliver a visible piece of behaviour over one station per layer;
   - keep pure refactoring in its own station, before the behaviour that needs it;
   - `title`: an imperative sentence, in the language of the repository's commits;
   - `why`: one sentence on what the station brings;
   - `dependsOn`: the indexes (0-based) of earlier stations it cannot start without — only real dependencies, never "everything before".
5. Aim for two to eight stations. If the brief is really one station, return one. If it needs more than eight, the epic is too big: propose the first eight and say so in the description.
6. Return the structured output the run requests.

## Rules

- Name real modules and files you have read when they make a station clearer.
- No station for "write tests" or "update docs" on its own: each station carries its own tests and docs.
- Do not guess product decisions; phrase the station so its spec phase can raise the question.
