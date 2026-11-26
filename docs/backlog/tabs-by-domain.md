---
type: backlog
project: spendometer
order: 85
kind: design
size: M
status: todo
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

## Done when
The card's tabs are the domains; every figure the card shows today is on the tab of its domain; the tab setting
(`/spendometer tab ...`, the store key `cardTab`) maps the old tab names to the new ones, so a stored choice still
opens a tab.

## Open
- What happens to Overview: dropped, or kept as a summary of all four?
- Activity and Safety have no card figures today. Tabs for them now, or only when they get content (items 140, 160)?
- Icons for each tab (item 120 picked 📊 🧠 💰 for the current three).
- Order against items 90 and 100: doing this first means their pictures land in the Capacity and Cost tabs directly.
  It comes after the refactor (80), which moves code and changes nothing the user sees.
