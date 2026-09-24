---
name: plan
description: Writes the implementation plan in the task notes folder — ordered steps that each keep the build green, the tests to write first, the files touched and the checks to run. Use in the plan phase of a Terminus task, after the spec and its decisions.
metadata:
  playbook: terminus/task
  phase: plan
---

# Plan

Turn the spec and its decisions into steps an implementer can follow one at a time. The human approves this plan before any code is written.

## Steps

1. Read `spec.md` (including its **Decisions**) in the task notes folder. Explore the code it points to; change nothing in the repository.
2. If the whole change fits in one sentence, write a one-step plan and stop there — planning is overhead for trivial diffs.
3. Otherwise write `plan.md` in the task notes folder:
   - **Approach** — the design in a few sentences, and the alternative you rejected with why.
   - **Steps** — ordered; each one small, self-contained and leaving the build and tests green. For each step: the behaviour it adds, the files it touches, and its **test list** (the scenarios to cover, as behaviour, not implementation).
   - Keep refactoring in its own step, before or after the behaviour change, never mixed into it.
   - **Verification** — which verification commands prove each step, and the end-to-end check from the spec.
   - **Risks** — what could go wrong and how you will notice.
4. End with a summary the human can approve in one read.

## Rules

- Every acceptance criterion of the spec maps to at least one test in some step's test list.
- Name real files. If a step needs a new file, say where it goes and why there.
- If the plan would exceed one reviewable pull request, stop and propose splitting the task instead.
