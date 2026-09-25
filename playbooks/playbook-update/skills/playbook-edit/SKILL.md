---
name: playbook-edit
description: Applies the edits proposed in research.md to one Terminus playbook skill (SKILL.md and SOURCES.md), updates its Researched date and keeps it valid, touching nothing else. Use in the execute phase of a Terminus playbook-update station.
metadata:
  playbook: terminus/playbook-update
  phase: execute
---

# Playbook edit

## Steps

1. Read `research.md` in the task notes folder, then the skill's `SKILL.md` and `SOURCES.md` (the folder is named in the station's brief).
2. Apply each proposed edit to `SKILL.md`. Keep its `name`, keep the frontmatter to the fields it already uses, and keep the `description` saying what the skill does and when to use it.
3. Update `SOURCES.md`: add each new source with what it supports, fix moved links, remove dead ones, and end with `Researched <today's date>.`.
4. When `research.md` proposes no edit, only update the `Researched` line: the sources were re-checked.
5. Run the verification commands; the playbook loader validates every skill.
6. Commit with `chore(playbooks): refresh the <name> skill`.

## Rules

- Change only the files of that skill folder.
- Every added sentence traces back to a source listed in `SOURCES.md`.
