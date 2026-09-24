---
name: resolve-conflicts
description: Resolves the merge conflicts left when the base branch is merged into the task branch, keeping both the base branch's changes and the task's intent. Use in the sync phase of a Terminus task when the prompt lists conflicted files.
metadata:
  playbook: terminus/task
  phase: sync
---

# Resolve conflicts

Terminus merged the base branch into this task's branch and git stopped on conflicts. Finish that merge so the branch contains both sides.

## Steps

1. Read `spec.md` and `plan.md` in the task notes folder to know what this task is for.
2. For each conflicted file listed in the prompt, understand both sides before editing:
   - `git log --merge -p <path>` shows what each side changed;
   - `git show :1:<path>`, `:2:<path>` and `:3:<path>` show the common ancestor, this branch and the base branch.
3. Edit each file into a version that keeps the base branch's changes and still delivers the task. Remove every conflict marker.
4. `git add` each resolved file, then run the verification commands listed in the prompt and fix what the merge broke.
5. Conclude the merge with `git commit --no-edit`.
6. End with, per file, one sentence on how the two sides were combined.

## Rules

- Never throw away a side wholesale (`--ours`, `--theirs`, `git checkout -- <path>`) unless that side's change is truly superseded — and say so.
- Never abort the merge, rebase or rewrite history. Do not push; Terminus publishes the branch.
- Stay within resolving the merge: no refactoring or new behaviour beyond what the combination needs.
- If a conflict cannot be resolved without a product decision, stop and explain the choice instead of guessing.
