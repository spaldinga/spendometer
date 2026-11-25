---
type: backlog
project: spendometer
order: 70
kind: design
size: M
status: todo
source: user feedback 2026-11-25
---

# The 5-hour pace in the always-visible top bar

## Why
"the 5h window and my pace is something I have been expanding the bar to see, and it becomes more important now that it disappears when I change tab." The 7-day pace is less interesting.

## What
Mockups first, at wide, compact and narrow widths: the 5H block with its pace in it (a used bar with the time tick; "lasts ~4h 50m ✓", or "out in ~1h" in red), and a variant with both windows. Then decide whether PACE VS RESET stays on the Overview tab.

## Reading problem found 2026-11-25
The PACE VS RESET strip was read the wrong way round: the tick looked like a limit that the user was close to.
The figures were correct (5H 39% used, 57m to reset: the tick is at 81% of the window's time, so the bar is well
behind it). Two causes:
- The tick has no name. It is the "today" marker of budget bars (time gone in the window), but nothing says so.
- "lasts ~6h 18m" is longer than the window that is left, so it answers a question nobody asks. The window
  resets before the time runs out.

Fix as part of this item:
- When on pace, write the forecast at the reset: "~48% at reset ✓" (used ÷ share of time gone). Keep
  "out in ~1h" in red when it runs out first; that time is shorter than the reset, so it means something.
- Name the tick: a hover tip ("the line is how much of the window's time has gone; a bar left of it is
  under pace"), or a small "now" label under it on the wide card.
- Use one wording in the top bar and the strip, so the user learns it once.

## Done when
The user can see the 5-hour pace without opening the card, and can tell from the bar or its words alone
whether they are under or over pace.
