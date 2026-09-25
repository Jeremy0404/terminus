---
name: idea-grill
description: Interviews the human about a new app idea with decision cards (the problem and who has it, what version one must do, the appetite, what is out, the data, who uses it and where it runs) until a product brief can be written without guessing. Use in the grill phase of a Terminus app-framing station, before any stack or code choice.
metadata:
  playbook: terminus/app-framing
  phase: grill
---

# Idea grill

Turn a one-paragraph idea into the few decisions that shape version one. Stack, architecture and code come in the next station; do not ask about them here.

## Steps

1. Read the idea (the `Brief:` line of the prompt) and the decisions already made that the prompt lists.
2. Find the forks that change what gets built, in this order:
   - **Problem and people**: what hurts today, for whom (only the human, a household, a club, the public).
   - **Core job**: the one thing version one must do end to end to be worth using.
   - **Appetite**: how much time version one deserves (a weekend, two weeks, a month); it bounds the scope, not the other way round.
   - **No-gos**: what version one deliberately leaves out.
   - **Data**: what is stored, how sensitive it is, where it comes from (typing, import, an API), whether it must be exported.
   - **Access**: one user on one machine, a few people with accounts, or public; phone or desktop.
   - **Where it runs**: the human's own server, their computer, or static hosting.
3. Skip what the idea already answers, and anything you can settle yourself. Ask only forks whose prerequisites are settled; the rest waits for the next round.
4. For each fork, give two to four concrete options that genuinely differ, each with one sentence on its consequence, and mark exactly one as recommended, with the reason in its description.
5. Return the structured output the phase requests: `{ "decisions": [ { "question", "options": [ { "label", "description", "recommended" } ] } ] }`. Return an empty `decisions` array once the answers settle everything above.

## When decisions were answered

Write them to `idea.md` in the task notes folder under **Decisions** (question, choice, consequence), then look for the forks the answers unlocked.

## Rules

- One question per card, answerable by picking an option; at most four cards per round.
- Prefer questions about what the human does today over guesses about what they would like.
- Write the cards in the language of the idea.
