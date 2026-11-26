---
type: backlog
project: spendometer
order: 80
kind: refactor
size: L
status: todo
source: user feedback 2026-11-25
---

# Architecture: smaller files, clear roles, named numbers

## Why
"I think the architecture is off, not sure on the domains or responsibilities of the different classes, a lot of magic numbers in the code and classes are becoming large." `hooks/register.tsx` is about 1,400 lines (hooks, band layout, buttons, keep warm, settings command, spend recording); `hooks/cache-art.ts` is about 800 (all SVG drawing, plus prices).

## What
Brainstorm first, then a plan, then small refactor steps that change no behaviour (tests green after each). Direction to discuss:
- Folders by feature: `band/` (row layout, buttons), `card/` (one file per tab, shared zone helpers), `keepwarm/`, `spend/` (recording, prices), `settings/` (the command).
- `register.tsx` keeps only the `on(...)` wiring and calls into those.
- Named constants, each with a comment, for the pixel and column figures, grouped per drawing.
- Pure logic stays apart from rendering, as `progress.ts`, `guard.ts` and `metrics.ts` already are.

Why this helps an AI coder: it reads a 300-line file whole and in one go, while a 1,400-line file is read in parts and the part it skipped is where the mistake comes from. A file name that says its role lets it find the right place with one search. Very many tiny files cost too: every hop is another read. Aim for one role per file, about 150 to 400 lines.

## Done when
No file over about 400 lines; each file has one role that its name says; magic numbers named; all tests pass unchanged.

## Open
- Settled 2026-11-26: before the Context and Cost pictures (items 90 and 100), so they land in small files.
- Settled 2026-11-26: the code is grouped by four domains, each a question the user asks (cost, capacity, activity,
  safety), plus `band/` as infrastructure; domains do not import each other. See [ADR 0008](../adr/0008-code-by-domain.md)
  and the plan [2026-11-26-refactor-architecture](../plans/2026-11-26-refactor-architecture.md).
