---
name: execute-tdd
description: Implements the approved plan test-first, one test at a time, and finishes only when the project's verification commands pass. Use in the execute phase of a Terminus task.
metadata:
  playbook: terminus/task
  phase: execute
---

# Execute, test-first

Implement `plan.md` from the task notes folder, step by step, driving every behaviour with a failing test.

## Loop, for each step of the plan

1. Take the step's test list.
2. Turn exactly one item into a concrete, runnable test. Run it and see it fail for the expected reason.
3. Change the code until this test and all previous tests pass.
4. Optionally refactor, with all tests green, then run them again.
5. Repeat until the step's list is empty, then move to the next step.

## Finish

- Run every verification command listed in the prompt. The phase is done only when all of them pass.
- End with evidence: the commands you ran and their results, and anything from the plan you could not do and why.

## Rules

- Never delete or weaken an assertion to make a test pass, and never paste a computed value into an expected value without checking it is right.
- Never mix refactoring into making a test pass. Duplication is a hint, not a command — do not abstract early.
- Fix root causes. Do not suppress an error, skip a test or disable a check to get green.
- When the prompt reports a previous failed attempt, read its diagnosis first and change approach.
- Stay inside the plan. If the plan turns out wrong, stop and explain what you found instead of improvising a different design.
- Do not push. Terminus records checkpoints and publishes the branch after the verification barriers.
- Use a step without a test only for configuration or wiring that no test can observe, and say so.
