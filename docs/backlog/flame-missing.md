---
type: backlog
project: spendometer
order: 10
kind: bug
size: S
status: todo
source: user feedback 2026-11-25 (screenshots after 3.2.0)
---

# The keep-warm flame is gone from the band

## Why
"the keep warm button has disappeared". The screenshots after 3.2.0 show no 🔥/🧊 after the chip at any width.

## What
Hypothesis, not checked: cache-tax is still installed (the `/keepwarm` answer in the same session came from cache-tax), and the band hides its own switch while cache-tax is there (`keep === null`). Check that first. Then decide: uninstall cache-tax (the README already says to), or show spendometer's switch anyway.

## Done when
The keep-warm switch is visible after the chip whenever there is a cache, and pressing it changes the state.

## Open
- Show it beside cache-tax, or say in the chip hover that cache-tax is in charge?
