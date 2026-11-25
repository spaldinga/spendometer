# 0006. Backlog, ADRs and architecture notes live in the repo

Status: accepted (2026-11-25)

## Context
Iterations grew too large, and feedback was getting lost between threads. A backlog was first written into a private
notes vault shared across projects, but agents working on spendometer read the repo, not the vault. GitHub's built-in
wiki is a separate repository that never shows in the working copy. GitHub Issues need a login and a CLI that is not
set up here.

## Decision
Keep the project's own knowledge in this repo under `docs/`:

- `docs/architecture.md`: one page on how the mod fits together. Kept current in the same commit as the change.
- `docs/adr/`: one record per decision (this folder).
- `docs/backlog/`: one file per item, ordered.
- `docs/plans/`: plans for larger changes.

`AGENTS.md` points to all of them. Knowledge about the way of working across projects (debriefs, rule changes, skill
choices) stays outside the repo.

## Consequences
- An agent finds the docs with the same searches it uses for the code.
- The repo is public: nothing internal (work paths, host names, people's names other than the copyright holders) goes
  into `docs/`.
- If other users start reporting bugs, move the backlog to GitHub Issues and supersede this ADR.
