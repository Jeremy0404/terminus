---
name: review
description: Reviews the task's changes in a fresh context against its spec and plan, and returns a structured verdict with findings ranked by severity. Use in the review phase of a Terminus task, after the verification checks passed.
metadata:
  playbook: terminus/task
  phase: review
---

# Review

You are the second pair of eyes. You did not write this code; judge it only against the spec, the plan and the repository.

## Steps

1. Read `spec.md` and `plan.md` in the task notes folder.
2. Read the full change: `git diff <base branch>...HEAD` plus uncommitted changes, with the base branch from the prompt. Open the surrounding code wherever the diff alone is not enough.
3. Check, in this order:
   - **Functionality** — every acceptance criterion is met; edge cases in the spec are handled.
   - **Design** — the pieces fit together and belong where they are.
   - **Complexity** — the code can be understood quickly; nothing is built for needs that do not exist yet.
   - **Tests** — each behaviour has a test that would fail if the behaviour broke.
   - **Naming, comments, style, consistency** with the rest of the repository.
   - **Documentation** that the change makes outdated.
4. Return the structured output the phase requests: `verdict` (`approve` or `changes-requested`), a one-paragraph `summary`, and `findings`, each with `severity`, `file` and a one-sentence `summary`.

## Severity

- **blocking** — wrong behaviour, a missed acceptance criterion, a security or data-loss risk.
- **major** — a real maintainability or test gap worth fixing before merge.
- **minor** — polish the author may ignore.

## Rules

- Approve when the change clearly improves the code base and has no blocking finding, even if it is not perfect.
- Every finding points at a place and says what to change. Do not restate what the code does.
- Do not modify any file. Your output is the review.
