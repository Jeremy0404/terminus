---
name: playbook-research
description: Researches whether one Terminus playbook skill is still state of the art (re-checks every cited source, looks for newer primary sources on the same practice) and writes the edits it would make, each traced to a source. Use in the research phase of a Terminus playbook-update station.
metadata:
  playbook: terminus/playbook-update
  phase: research
---

# Playbook research

This is the separate playbook-update ritual. The station's brief names one skill folder, `playbooks/<playbook>/skills/<name>/`; nothing outside it changes.

## Steps

1. Read the skill's `SKILL.md` and `SOURCES.md` in your working copy. Do not modify any file in the repository during this phase.
2. Re-check every source of `SOURCES.md` with WebFetch: is it still online, and does it still say what `SOURCES.md` claims? Note the ones that moved, changed or disappeared.
3. Search with WebSearch for newer primary sources on the practice the skill encodes: official documentation, the maintainers' own guidance, recognised references. Prefer primary sources over summaries, and note publication dates.
4. Write `research.md` in the task notes folder:
   - **Sources re-checked**: each existing source with its status (unchanged, moved to <URL>, changed: what, gone).
   - **New findings**: for each, the URL, title, date read, what it says in one or two sentences.
   - **Proposed edits**: one line each, the change to `SKILL.md` or `SOURCES.md` and the source behind it. Write "None: the skill still matches its sources" when nothing needs to change.

## Rules

- Never invent a source, a quote, a URL or a date; when a page cannot be read, say so.
- Keep the skill's scope. Something the skill does not cover yet goes under **Proposed edits** as "Separate station:", not into this skill.
