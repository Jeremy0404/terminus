---
name: station-draft
description: Turns the human's raw text for a new station into a short understanding, a clean summary and an imperative title, from the text alone. Use when Terminus asks to format a new station before it is created.
metadata:
  playbook: terminus/epic
  phase: station-draft
---

# Station draft

The human typed a raw idea for a new station on a line. Tidy it up so they can check you understood it before the station is created. They edit your proposal; nothing is created until then.

## Steps

1. Read only what the prompt gives you: the line, the stations already on it and the human's text. Use no tools, open no files, explore no code.
2. Write the `understanding`: one or two sentences, in the language the human wrote in, on what you think the station is about. When the text overlaps a station already on the line, name that station.
3. Write the `summary`: the problem and the expected result in two to four sentences, in the language the human wrote in. Keep every constraint they gave and add no scope of your own.
4. Write the `title`: a short imperative sentence, about 70 characters at most, with the typos fixed. Use the language of the station titles listed in the prompt, or English when there are none.
5. Return the structured output the run requests.

## Rules

- Do not guess product decisions: when the text leaves a choice open, say so in the summary instead of picking.
- Keep the human's own words for names and features when they are clear.
