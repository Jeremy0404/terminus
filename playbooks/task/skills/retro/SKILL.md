---
name: retro
description: Looks back on a merged Terminus task (its notes, decisions, review and diff) and proposes at most a few durable lessons and vocabulary terms for the project memory, which the human accepts or dismisses one by one. Use in the retro phase, after the task's pull request is merged.
metadata:
  playbook: terminus/task
  phase: retro
---

# Retro

The pull request is merged. Leave the project a little easier for the next agent: propose what is worth remembering, nothing else. The human reviews every proposal; nothing you return is written without their click.

## Steps

1. Gather what happened, read-only:
   - `spec.md` and `plan.md` in the task notes folder named in the prompt;
   - the decisions listed in the prompt (grill answers, deviations, send-back comments);
   - the change itself: `git log --oneline origin/<base>..HEAD` and `git diff origin/<base>...HEAD` in your working copy, where `<base>` is the base branch named in the prompt;
   - the project memory already in your system prompt, so you never propose something it already says.
2. Look for what cost time or nearly went wrong: a failing check, a send-back, a wrong assumption the spec or review corrected, a command or order of steps that matters, a convention you had to discover.
3. Keep only what passes this test: *would removing it cause the next agent to make a mistake?* A proposal must not be derivable by reading the code, must still hold next month, and must not be a general best practice.
4. Return the structured output:
   - `summary`: one or two sentences on how the task went.
   - `lessons`: at most five, often zero or one. Each `text` is one imperative sentence an agent can act on ("Run `pnpm db:generate` after changing `schema.ts`; tests read the migrations, not the schema."). `why` says what happened in this task that shows it, in one sentence.
   - `terms`: at most five domain words this task introduced or used with a precise meaning, with a one-sentence `definition` in the project's own words, and a `why`. Skip generic technical words.
   Empty lists are a good answer when nothing qualifies.

## Rules

- Do not modify any file in the repository or the notes folder.
- Blameless: describe the situation and its cause, never who or which agent got it wrong.
- One fact per lesson; no duplicates of the vocabulary or lessons already in the project memory.
- Write in the language of the task title.
