---
type: backlog
project: spendometer
order: 20
kind: bug
size: S
status: done
source: screenshots 2026-11-25 (compact row, card open)
---

# The next message's cost is drawn over itself

## Why
In the compact row with the card open, "$0.03 next" after the WARM chip looks struck through, as if two texts overlap. Seen on all three tab screenshots. Not reported by the user: Claude saw it in the screenshots.

## What
Find why the next-cost text overlaps (two Text nodes, or something drawn in the same place) and fix it.

Resolved: the hover tips sat 1 row above their button, so their frame crossed the row text; they now sit TIP_LIFT (2) rows up. The `$` and `0` glyphs in the band font may still look crossed; that is the font, not an overlap.

## Done when
"$0.03 next" reads cleanly at compact widths, card open and closed.
