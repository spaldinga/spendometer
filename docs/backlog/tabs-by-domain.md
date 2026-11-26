---
type: backlog
project: spendometer
order: 85
kind: design
size: M
status: doing
source: user decision 2026-11-26, in the item 80 brainstorm
---

# Card tabs follow the domains

## Why
"The card tabs should follow the domains." The code is grouped by the four questions the user asks (cost, capacity,
activity, safety; [ADR 0008](../adr/0008-code-by-domain.md)), but the card's tabs are Overview, Context and Cost.
Overview mixes capacity (the pace strip) with cost (delegation, spend), so a figure's tab does not say which question
it answers.

## What
One tab per domain, each showing that domain's figures:
- Cost: spend (thread, today, week, per commit/PR), delegation, the cache's discount, per message, by model.
- Capacity: the 5h and 7D pace, the conversation's size, turns left, tool output.
- Activity and Safety: see Open.

Mockups first (kind `design`): the user picks one before code.

Built and committed 2026-11-26; not yet checked in the app.

### Check in the app
After `/reload-plugins --force`:
- The tab buttons are 💰 Cost then 🔋 Capacity (words on a wide band, the emoji alone on a narrow one); the tab in use
  is the undimmed one, and pressing it again closes the card.
- Cost, wide: SPEND, DELEGATION and CACHE DISCOUNT as columns, PER MESSAGE and BY MODEL as lines below. Narrow: SPEND
  and four lines, delegation's line among them.
- Capacity: the pace strip at the top, then CONVERSATION SIZE and TOOL OUTPUT (tool output as a line when narrow).
- A tab stored before the change still opens: Overview opens Cost, Context opens Capacity.
- `/spendometer tab` lists cost and capacity; `/spendometer tab overview` answers `tab: cost`.
- The band's narrow steps (no +, no keep box, 5h only, minimal) still fit, now about 5 columns later than before.

## Done when
The card's tabs are the domains; every figure the card shows today is on the tab of its domain; the tab setting
(`/spendometer tab ...`, the store key `cardTab`) maps the old tab names to the new ones, so a stored choice still
opens a tab.

## Open
Settled with the user on 2026-11-26:
- Overview is dropped. Its pace strip moves to Capacity; delegation and spend move to Cost. Two tabs: Cost, Capacity.
- Activity and Safety get no tab now; items 140 and 160 add theirs when they give them content.
- Order: Cost first, then Capacity (the ADR's order). Old stored tabs map: `overview` → Cost (its spend and
  delegation are there), `context` → Capacity, `cost` → Cost.
- Icons: Cost 💰, Capacity 🔋 (picked from `assets/mockups-tabs/tabs-by-domain.svg`, which also has the layout the user chose).
- Order against items 90 and 100: 85 comes first, so their pictures land in the Capacity and Cost tabs directly.
