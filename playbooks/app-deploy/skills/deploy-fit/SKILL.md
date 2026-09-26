---
name: deploy-fit
description: Decides whether a newly founded app is meant to run in production at all, from its approved brief, stack and scaffolded repository, and offers to close the production station when the app is meant to stay on the user's machine. Use in the fit phase of a Terminus app-deploy station.
metadata:
  playbook: terminus/app-deploy
  phase: fit
---

# Deploy fit

Every new app gets a "Mettre en production" station. Some apps are never meant to leave the user's machine. Say which case this app is, so that the human can close the station in one click when it has nothing to do.

## Steps

1. Read the approved brief and stack in your system prompt ("Product brief (approved)", "Stack and architecture (approved)"). Look at who uses the app, from where, and where it runs.
2. Look at the repository: a root `Dockerfile`, a server that listens on a port, accounts or access control, a local-only data file.
3. Return the structured output the phase requests: a short `summary`, and a `verdict`:
   - `continue`: the brief has the app reached from somewhere other than the user's own machine (a phone, other people, the internet), or it does not say. This is the normal case.
   - `close`, with `closeReason: obsolete`, only when the brief says the app stays on the user's machine (a local tool, no remote use). Put the brief's own words in `evidence`, and say that the app stays local.

   Give the `reason` in one or two sentences, in the language of the brief.

## Rules

- When in doubt, `continue`. Closing is the human's call, and the options phase can still ask.
- Change nothing in the repository or the task notes.
