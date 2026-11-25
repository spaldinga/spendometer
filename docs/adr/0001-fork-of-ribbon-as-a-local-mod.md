# 0001. A fork of ribbon, installed from this folder

Status: accepted (2026-11-25, recorded after the fact)

## Context
Spendometer started as a band above the prompt with usage, cost and cache state. `robonuggets/ribbon` (MIT) already
drew such a band. Changes need to be seen in the app quickly, one at a time.

## Decision
Fork ribbon and keep its MIT notice. Install the mod as `spendometer@spendometer` from a folder marketplace pointing at
this repo, so the app runs the files here directly; `/reload-plugins --force` picks up a change.

## Consequences
- No build or publish step between an edit and seeing it in the app.
- The app runs whatever branch is checked out: work happens on `dev`, and `main` (what others install from GitHub)
  moves only after the user has seen a change work.
- The upstream MIT notice and the Blast Radius (Apache-2.0) credit in `hooks/guard.ts` must stay.
