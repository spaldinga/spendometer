---
type: backlog
project: spendometer
order: 90
kind: feature
size: M
status: doing
source: docs/plans/2026-11-24-card-tabs.md, step 3
---

# Context tab pictures

## Purpose
The 🔋 Capacity tab (the plan's "Context tab"; item 85 renamed it) says how full the conversation is and what filled
it, but only in figures and dots. Give it pictures that answer "what filled it" and "how long does it last" at a
glance, without making the tab taller.

## Why
From the plan (2026-11-24): "Numbers alone are hard to read: every figure should have a picture next to it." The
plan's Context row asks for one stacked bar (setup, chat, tool output by tool), a gauge of turns left and file chips for
re-reads.

## What
Mapped onto today's files (the plan predates the refactor of item 80 and the tabs of item 85):
- **Stacked bar** in CONVERSATION SIZE (`sizeZone`, `hooks/capacity/context/card.ts`), in place of the dot chart:
  setup, chat, tool output by its top tools, then free. Setup is `ctxFirst`, an estimate: the alt text says so.
- **Gauge of turns left**: a half-circle at the right of the CONVERSATION SIZE figure, from the runway
  (`hooks/capacity/context/runway.ts`). The runway text line stays.
- **File chips** in TOOL OUTPUT (`toolsZone`): one chip per re-read file, basename and count, newest first, as many as
  fit.
- Data: `Spent.ctxFirst` (set by `addContext` on the first priced main turn only; an older record gets none) and `Spent.rereadFiles`
  (basename → re-reads, the 5 most recent files; `addToolOut` gets the basename from `measureCall`), both carried by
  `readSpend` and `recordOf` (`hooks/cost/spend/record.ts`). `metricsOf` (`hooks/band/card-metrics.ts`) passes them on.

## Done when
The Capacity tab shows the stacked bar, the gauge and the chips at 3, 2 and 1 columns, and is no taller at any width
than before this item.

Built and committed 2026-11-26; not yet checked in the app.

### Check in the app
After `/reload-plugins --force`, open the card on 🔋 Capacity:
- CONVERSATION SIZE has one bar in place of the dots: grey setup, the hue for chat, the tool colours, then empty free
  room. The tool names in TOOL OUTPUT's caption have the same colours as their bar parts.
- After two turns, a half-circle gauge at the right of the token figure shows the turns left (`~12`), red at 5 or
  fewer, orange at 15 or fewer, green above. On a narrow column the gauge is left out; the runway line stays.
- Read the same file twice: TOOL OUTPUT shows a chip `name.ts ×1` under the figure; more files give more chips, newest
  first, as many as fit.
- On a narrow band (1 column) the tool output status line names the most re-read file.
- The card is as tall as before at wide, medium and narrow widths.
- The alt text (hover the card or a screen reader) lists setup, chat and tool output, says setup is an estimate, and
  names the re-read files.

## Open
Assumptions taken while building without the user (2026-11-26), for review in the app:
- Setup is the context after the first main turn (`ctxFirst`), so it also holds the first message and reply. The bar
  calls it setup; the alt text says it is an estimate. A record from before this item has no `ctxFirst`: the bar then
  has no setup part (chat starts at zero).
- Tool output is cumulative and counts output a compaction since dropped, so the bar clamps it to what fits in the
  context after setup; chat is the rest. The top 3 tools get their own colour, the rest one "other" part.
- The gauge's full scale is 40 turns (more shows a full arc); colours at 5 and 15 turns. It needs a column of at least
  260 px; below that only the runway line shows.
- Chips show basename and count (`card.ts ×2`); two files with the same basename count together. Capped at 5 files,
  most recent re-read first; a chip that does not fit is dropped, not shortened.
- The dot chart goes: the bar replaces it, so the zone keeps its height (218 px wide, 249 px narrow, pinned in
  `tests/card-pictures.test.ts`). The bar sits a few px higher than the dots did, to clear the caption.
- Tool colours: the top three tools blue, lilac and peach, other tools tan. Tan is near the warm chat hue: check it.
- A file named like an integer (`123`) would sort first in the stored object and so look oldest. Not guarded.

## Review (2026-11-27, read-only reviewer, before the app check)
The record's read-modify-write carries `ctxFirst` and `rereadFiles`; the bar adds up to the column width; no SVG
overflow at 1 column. 502 tests pass.

Findings, most severe first (to weigh at the app review):
1. **Medium.** `hooks/cost/spend/record.ts:242` sets `ctxFirst` on any turn whose record lacks it, not only the first.
   A conversation recorded before this change (say 150k tokens) gets the whole context labelled "setup" on its next
   turn, against this item's Open (an old record gets no setup part). A test pins the wrong behaviour
   (`tests/keepwarm-cost.test.ts`, the second ctxFirst test). Fix: set it only when `turns === 1`.
2. Medium, plausible. `ctxFirst` is never reset after a compaction, so a context compacted below it shows as all setup.
3. Low. The 1-column status line names the most recently re-read file, not the most re-read one as the check list
   says (`hooks/band/card.ts:143`). Fix the code or the wording.
4. Low. The gauge colours by the raw runway but prints it rounded: 5.4 shows `~5` in orange, though ≤5 is red. Colour
   by the rounded figure.
5. Low. The "as tall as before" test cannot fail from data and was not compared with the height before the change.

Fixed 2026-11-27:
1. `addContext` sets `ctxFirst` only when `turns === 1`; an older record keeps no setup part. The keepwarm-cost test now pins that.
2. After a compaction: chose to show no setup part when the context is below `ctxFirst` (`stackOf`), over dropping `ctxFirst` on compaction; it needs no compaction hook. (If the context grows past `ctxFirst` again, setup shows again as an estimate.)
3. Low: the 1-column line names the file with the most re-reads (ties: the most recent).
4. Low: the gauge colours by the rounded figure it prints (5.4 shows `~5`, red).
5. Not changed: the "as tall as before" test (not a finding to fix in code).
