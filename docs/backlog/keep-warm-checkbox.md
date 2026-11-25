---
type: backlog
project: spendometer
order: 60
kind: design
size: S
status: done
source: user feedback 2026-11-25
---

# Keep warm as a checkbox

## Why
"I have been thinking that maybe it should be a checkbox instead that is ticked or unticked." A flame against an ice cube does not say clearly that it is a switch.

Second round of feedback (2026-11-25): the states are not what the user expects. The switch starts off in every new
conversation, a window lasts only 6h, and the 🔥/🧊 button shows the switch, not the cache, so a 🧊 next to WARM makes
it hard to trust that keep warm is on. The user expects every message to turn it on for 24h, with a box they can untick,
and to drive and read it from `/spendometer` the way they did with cache-tax.

## What
- **On by default.** Every conversation starts ticked. A message (a turn that reached the cache) opens a window of
  24h, and each message starts the 24h again. With no message for 24h the window ends by itself.
- **Untick stays off.** Unticking stops the window, and the conversation stays unticked until ticked again; a message
  does not tick it back.
- **The button is a checkbox:** `✓` ticked, `✗` unticked, at every width, after the WARM/COLD chip. Its hover says
  what the state means, including "ticked, but the cache went cold" (the computer slept or was off, so nothing could
  ping): the next message re-writes the cache and the pings start again.
- **Commands.** `/spendometer keepwarm [on | off | status | 90m | always]` does what `/keepwarm` does (`on` is new on both
  and means the bare form). `/spendometer status` gets a keepwarm line: on or off, time left, next ping, last ping cost.
- A computer that is off cannot ping: the cache going cold overnight is not fixed by this item.

## Done when
- A new conversation shows `✓`, and after a message `/spendometer keepwarm status` says about 24h left.
- Unticking shows `✗`; the next message leaves it `✗` and opens no window.
- After a night with the laptop off, the box is still `✓`, its hover says the cache went cold, and the first message
  starts a new 24h.
- `/spendometer status` has the keepwarm line.

## Open
None. Decided with the user 2026-11-25: on by default everywhere, untick stays off, label `✓`/`✗` drawn white (the desktop button keeps its own text colour; `✅` was tried and not preferred).

## Depends on
[flame-missing](flame-missing.md)
