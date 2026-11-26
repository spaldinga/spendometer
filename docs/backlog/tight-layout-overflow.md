---
type: backlog
project: spendometer
order: 130
kind: bug
size: S
status: dropped
source: user test 2026-11-26
---

# The tight layout cuts off the 7D window

## Why
Seen while testing item 50 at 26 columns: the tight layout draws USAGE, 5H and 7D side by side with three lines
each, and 7D runs past the band's right edge ("7D", "49% used", "resets 2…" are cut off).

## What
Make the tight layout fit its width, for example by dropping the USAGE label, the reset line, or the 7D window
at the narrowest widths.

## Done when
At every width down to the narrowest the app allows, nothing in the band is cut off.

## Open
- What should go first when it does not fit: the label, the reset lines, or 7D?

## Outcome
Dropped on 2026-11-26: item 50 replaced the tight layout on the desktop with a one-row ladder that ends in a
minimal row (5h pie and percent, Robo, `+`), so nothing is cut off there. The terminal keeps its tight layout.
