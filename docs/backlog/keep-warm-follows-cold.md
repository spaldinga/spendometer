---
type: backlog
project: spendometer
order: 65
kind: change
size: S
status: done
source: user feedback 2026-11-26
---

# Keep warm follows the cache's WARM/COLD state

## Why
"when the cold state is changed I would expect that the keepwarm is turned off and that the check mark is changed to off ... the current states that are disconnected makes no sense"

After the computer slept past a ping, the chip said COLD while the box still said ✓ and the status said "7h54m left · cold now".

## What
- **Cold turns the box off.** When keep warm finds the cache cold with its window open, it ends the window with the reason `the cache went cold`, and the box shows ✗. This holds when a timer fires late after a sleep, when a stored window is restored over a cold cache, and while waiting for a turn or after a compaction. The box also reads cold at draw time, before any timer fires.
- **Cold is not an untick.** The switch stays on: the next message opens 24 hours again and shows ✓. Only a user untick stays off.
- **A click on ✗ while the cache is cold warms it now:** one ping, sent even though the cache is cold, that re-writes the cache. On a reply the cache clock restarts, its cost is recorded and 24 hours open. If it fails, one log line says why, and the box stays ✗ with the switch on. An untick while it is out wins.
- A warm-now ping is not counted as "saved by keep warm" by the next message: it paid the re-write.
- The hover says which state the ✗ is: cold (with the re-write cost), stopped (with the reason), or unticked.

## Done when
- After a sleep past the cache's hour, the chip says COLD and the box says ✗; `/spendometer status` says `keepwarm: stopped, the cache went cold`.
- The next message turns the box ✓ with a new 24h window.
- A click on ✗ over a cold cache turns it ✓ and the chip WARM (about the price of a re-write).

## Open
None. Decided with the user 2026-11-26.
