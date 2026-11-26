---
type: backlog
project: spendometer
order: 50
kind: change
size: M
status: done
source: user feedback 2026-11-25
---

# Buttons that are always there

## Why
"I don't like that all buttons disappear, I would always like to be able to go to them."

## What
Settle the Open question first. A likely shape: the tab buttons also show while the card is closed, and pressing one opens the card on that tab; `−` closes it.

## Done when
Every button can be reached with one press from any state.

## Open
- Which buttons disappear for you, and when: the tabs while the card is closed, the keep-warm flame, or buttons at narrow widths?
  **Answered 2026-11-26:** the tab buttons (Overview / Context / Cost) while the card is closed.
- Settled with the user on 2026-11-26:
  - The tab buttons show whenever the card can exist (the desktop, after the first reply), open or closed.
  - Card closed: pressing a tab opens the card on that tab. Card open: pressing another tab switches to it;
    pressing the tab already in use closes the card.
  - The tab in use keeps its brackets while the card is closed, so they show which tab `+` opens on.
  - `+` / `−` stays as it is.
  - The layout counts the tab buttons in its widths open or closed, so opening or closing never moves the row
    between wide, compact and the buttons row.
- Narrow widths, settled with the user on 2026-11-26 from screenshots at 58, 51, 34 and 26 columns:
  - The compact estimates are measured again (about 10.2 px a column): an icon button is 4 columns, not 6, and
    the row's pace track and keep box take fewer columns, so the buttons no longer leave a half-empty row.
  - Where the buttons do not fit on the first row, they go to the right end of the progress row (the bar gets
    shorter) instead of a row of their own.
  - Below the compact widths `+` / `−` is hidden: a tab opens the card, the tab in use closes it.
  - The tight layout cutting off 7D at about 26 columns is older than this item: see
    [tight-layout-overflow.md](tight-layout-overflow.md).
- Revised the same day after testing at 46, 45, 30 and 25 columns (replaces the progress-row and buttons-row
  points above, on the desktop):
  - The band is always one row on the desktop. After the compact steps with `+` and the step without `+`, the
    ladder drops the 5h pace track, then the keep ✓, then the 7D window.
  - Below that, a minimal row: the 5h pie with its percent, Robo and `+`. It replaces the three-line tight
    layout on the desktop. The tabs are hidden there; `+` opens the card on the last tab.
  - No buttons row and no buttons on the progress row on the desktop. The terminal keeps its layouts.
