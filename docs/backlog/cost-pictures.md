---
type: backlog
project: spendometer
order: 100
kind: feature
size: M
status: doing
source: docs/plans/2026-11-24-card-tabs.md, step 4
---

# Cost tab pictures

## Why
Numbers alone are hard to read: every figure on the card should have a picture next to it. The Capacity tab got its
pictures in item 90; this is the same for the 💰 Cost tab.

## What
A bar per message for the last 10 (an outlier in red, the last in orange; needs `recent`), a split bar for the cache
discount, and warm against cold as two bars. Details in [the plan](../plans/2026-11-24-card-tabs.md).

Built and committed 2026-11-26; not yet checked in the app.

### Check in the app
After `/reload-plugins --force`, on the 💰 Cost tab:
- CACHE DISCOUNT: under the percentage, a thin bar split green (read from cache) and grey (the rest), its green part
  about as long as the percentage says. Right of the percentage, two rows: `warm` (red, an hour of keeping the cache
  warm) and `cold` (blue, one re-cache), the dearer one full.
- PER MESSAGE (needs a band wide enough for 4 columns): up to 10 small bars under the average, oldest left; the last
  one orange, a message 3× the average or more red.
- On a narrower band the CACHE DISCOUNT status line, when it is a line, reads `... · warm $X/h, cold $Y` when it fits.
- The card is no taller than before on any width.
- A conversation started before this change shows no message bars until its next message, then one bar.

## Done when
The Cost tab shows pictures, not only figures.

## Open
Assumptions taken while building (no questions asked; change them here if the app shows otherwise):
- `recent` holds the same value as `last` (the main turn plus the subagent cost since the previous one), so the last
  bar equals the "last $x" caption. Kept: 10, oldest first.
- A bar is an outlier by the caption's own rule (3× the average, from 3 messages on), counted over the bars shown. An
  outlier that is also the last bar is red, as the caption flags it in red.
- Warm against cold sits in CACHE DISCOUNT, as two compare rows like DELEGATION's (shared helper `compareRows`), not
  as a zone of its own: a sixth zone would only add a status line. Warm is one hour of pings, cold one re-cache, both
  on this session's model; scaled to the dearer.
- The zone order item 85 settled is kept, so PER MESSAGE has a column, and its bars, only at 4 columns; below that it
  stays a text line. Showing the bars on narrower cards (a tiny inline chart in the status line, or a different zone
  order) is a decision for the user after seeing it.
