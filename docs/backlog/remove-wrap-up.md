---
type: backlog
project: spendometer
order: 30
kind: change
size: S
status: done
source: user feedback 2026-11-25
---

# Remove the Wrap up button

## Why
"wrap up seems like it has played its role in this tool, I think it is enough as a skill and is not something the spendometer needs."

## What
Remove the Wrap up button, its `wrapup` setting and its width accounting. `/debrief` stays a skill. Decide what replaces "a wrap-up stops this conversation's keep warm" (likely: the keep-warm switch or `/keepwarm off`).
Decision: nothing replaces it. A finished conversation goes cold by unticking the keep-warm box or typing `/keepwarm off`.

## Done when
No 🎌 button at any width; `/spendometer wrapup` is gone from the usage text; tests and README updated.
