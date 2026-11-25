# 0005. Tabs on the card replace the metric row

Status: accepted (2026-11-25; built in 3.1.0 and 3.2.0)

## Context
The open card showed everything at once: pace, delegation, cache, spend, keep warm and a metric row. On a wide band
(four card columns) the metric row never fitted under the band's 12-row cap, so its figures were never seen. The user
reads pace, delegation and spend; the other figures were unused or not understood. Plan:
[2026-11-24-card-tabs](../plans/2026-11-24-card-tabs.md).

## Decision
- Keep warm leaves the card: a flame button right after the WARM/COLD chip, its figures in the chip's hover.
- The card shows one tab at a time: Overview (pace, delegation, spend), Context (conversation size, tool output),
  Cost (cache discount, per message, by model). The choice is kept in the store (`cardTab`) and set by the tab buttons
  or `/spendometer tab`.
- The tab buttons have no hotkeys: a hotkey fires in an empty composer, so a letter would swallow the first letter of
  a message.
- The chosen tab is marked with brackets, since no dimmed style on `Button` is known for certain.
- No tab is taller than the old card at the same width.

## Consequences
- Every figure is reachable, and the card is shorter.
- Pace is on Overview only, so it is hidden on the other tabs. The user misses it: see
  [the 5-hour pace in the top bar](../backlog/pace-in-top-bar.md).
- Each tab defines its own 3, 2 and 1 column forms.
