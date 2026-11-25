---
type: backlog
project: spendometer
order: 20
kind: bug
size: S
status: todo
source: screenshots 2026-11-25 (compact row, card open)
---

# The next message's cost is drawn over itself

## Why
In the compact row with the card open, "$0.03 next" after the WARM chip looks struck through, as if two texts overlap. Seen on all three tab screenshots. Not reported by the user: Claude saw it in the screenshots.

## What
Find why the next-cost text overlaps (two Text nodes, or something drawn in the same place) and fix it.

## Done when
"$0.03 next" reads cleanly at compact widths, card open and closed.
