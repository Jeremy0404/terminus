---
name: grill
description: Finds the decisions in a task that belong to the human, and returns them as structured decision cards with options and one recommendation each. Use in the grill phase of a Terminus task, after the spec is written.
metadata:
  playbook: terminus/task
  phase: grill
---

# Grill

Surface every choice the spec leaves open that only the human can make, so implementation never has to guess.

## Steps

1. Read `spec.md` in the task notes folder, and the decisions already made that the prompt lists.
2. List the open decisions. Keep only real forks: a product behaviour, a trade-off, a scope boundary, a naming or data choice that is costly to reverse.
3. Drop anything you can settle yourself from the code, the repository conventions or the spec. Look facts up; never ask the human for a fact. Implementation techniques — which API, regex, library call or data structure — are yours to choose in the plan, never a question.
4. Ask only the decisions whose prerequisites are already settled. A decision that depends on another open one waits for the next round.
5. For each decision, give two to four options that genuinely differ, each with one sentence on its consequence, and mark exactly one as recommended.
6. Return the result as the structured output the phase requests: `{ "decisions": [ { "question", "options": [ { "label", "description", "recommended" } ] } ] }`.

## When decisions were answered

When the prompt lists decisions already made, first record them in `spec.md` under a **Decisions** section — for each: the question, the choice, and its consequence for the implementation. Then look again for decisions the answers unlocked. Return an empty `decisions` array when nothing is left to ask.

## Rules

- One question per card. Phrase it so it can be answered by picking an option.
- The recommendation is your honest best choice with its reason in the description — not the safest-sounding one.
- Never ask more than five questions in one round.
