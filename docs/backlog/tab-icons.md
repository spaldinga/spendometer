---
type: backlog
project: spendometer
order: 120
kind: design
size: S
status: dropped
source: user feedback 2026-11-25
---

# Better tab icons

## Why
"not sure on the icons but good enough for now." In the dark narrow screenshot, `◷` shows as something like `[G]`.

## What
Mockups of other single glyphs for Overview, Context and Cost, and whether the selected tab can be marked without brackets.

## Decision
Keep the current tab glyphs (`◷ ◧ $`) and the bracket marker; no code change. Item dropped.

Mockups: [`assets/mockups-icons/tab-icons.svg`](../../assets/mockups-icons/tab-icons.svg) (written by `tab-icons.sh`) compared three alternatives: A hollow/filled shapes, B `≡ ▒ $` with a `►` marker, C ASCII `= # $` with a `>` marker.

Why:
- The only evidence against the current set is one screenshot where `◷` showed as `[G]`. That may be that screenshot's font, not a general fallback.
- The brackets are clear in both the terminal and the app, and need no new look.
- Every alternative gives up meaning (A, C) or adds a column to the marker (B, C).

Reopen if `◷` or `◧` is seen to fall back in the user's real terminal or the app.
