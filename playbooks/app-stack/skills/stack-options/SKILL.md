---
name: stack-options
description: Chooses, with the human, the stack and the architecture of a new app from the approved product brief and the stack catalog (the skills named stack-*), as decision cards with one recommendation each. Use in the options phase of a Terminus app-stack station.
metadata:
  playbook: terminus/app-stack
  phase: options
---

# Stack options

Match the approved product brief (in your system prompt, "Product brief (approved)") to the stack catalog, and let the human decide the forks that shape the code.

## Steps

1. Read the brief and the decisions already made that the prompt lists.
2. The skills named `stack-*` in your skill list are the whole catalog; their descriptions are enough to shortlist. Load the two or three that could fit with the Skill tool (for example `stack-ts-fastify-vue`) and read their **Fits** and **Does not fit** sections. Do not search the file system for them. Never propose a stack outside the catalog; if none fits, say so in a card's descriptions and recommend the closest.
3. First round: one card, "Which stack?", with the fitting catalog stacks as options (their skill name in the label), the best fit recommended and why in terms of the brief.
4. Next rounds, once the stack is chosen: the forks that stack leaves open and the brief does not settle, such as accounts (none, local accounts, the user's identity provider), where the data lives, the languages of the interface, offline use, what gets tested end to end. At most four cards per round, two to four options each, one recommended with its reason.
5. Return the structured output the phase requests: `{ "decisions": [ { "question", "options": [ { "label", "description", "recommended" } ] } ] }`, and an empty `decisions` array once everything that changes the scaffold is settled.

## Rules

- An app reachable from the internet always has access control. Offer accounts, one shared password, or access only through the user's private network, never an open app; say so in the card.
- A fork is worth a card only if picking the other option would change the scaffold or be costly to reverse.
- Library versions, file names and code style are not questions: the stack skill and the scaffold decide them.
- Write the cards in the language of the brief.
