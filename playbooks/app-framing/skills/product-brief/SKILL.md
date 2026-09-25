---
name: product-brief
description: Writes the product brief of a new app from its idea and the decisions of the idea grill (problem, appetite, version one, rabbit holes, no-gos, success) and returns it for the human's approval. Use in the brief phase of a Terminus app-framing station.
metadata:
  playbook: terminus/app-framing
  phase: brief
---

# Product brief

Write the page every later agent of this app will read first. Once approved, Terminus stores it on the app and adds it to every run's context.

## Steps

1. Read the idea (the `Brief:` line of the prompt), the decisions already made that the prompt lists, and `idea.md` in the task notes folder if it exists.
2. Write the brief in Markdown, entirely in the language of the idea (section titles included), with these sections:
   - **Problem**: what hurts today and for whom, in two or three sentences.
   - **Appetite**: the time version one deserves, and what that rules out.
   - **Version one**: the core job end to end, then the few supporting features, as a short list. Name the screens or commands a user touches.
   - **Rabbit holes**: the details likely to swallow time, and the simple way around each.
   - **No-gos**: what version one deliberately does not do.
   - **Data and access**: what is stored, who uses it, where it runs.
   - **Done when**: two to four observable checks that say version one works.
3. Save it as `brief.md` in the task notes folder, and return the structured output the phase requests: `summary` (one sentence) and `brief` (the full Markdown).

## Rules

- Everything in the brief comes from the idea or a recorded decision; if something essential is missing, say so under **Rabbit holes** instead of inventing it.
- No stack, framework or code: the next station chooses them from this brief.
- Fits on one screen: short sentences, lists over paragraphs.
