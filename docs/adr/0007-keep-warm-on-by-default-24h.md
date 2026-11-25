# 0007. Keep warm is on by default, 24h after each message

Status: accepted (2026-11-25)

## Context
[ADR 0004](0004-keep-warm-built-in.md) built keep warm in as a per-conversation switch that started off, held a window
of 6 hours after each turn, and was shown as a flame or an ice cube. User feedback after using it:

- A new conversation started unticked, so the cache went cold unless the user remembered to turn it on.
- 6 hours does not cover a night or a long break.
- A flame against an ice cube does not read as a switch, and the button showed the switch, not the cache, so a
  cold-looking button next to a WARM chip made it hard to trust that keep warm was on.

## Decision
- On by default: a conversation with no switch of its own is on unless the default was turned off. The default has its
  own store key (`keepDefault`), read as on unless it is exactly `false`, so a stale `false` under the old key from the
  time the default was off does not turn it off.
- Every message that reached the cache holds a window of 24 hours from then; the next message starts the 24 hours again.
- Unticking is sticky per conversation: the switch stays off, and a message neither ticks it back nor opens a window.
- The button is a checkbox, `☑` or `☐`. Its hover says what the state means, including "ticked, but the cache went
  cold" (the computer slept or was off, so nothing could ping) and a window that stopped with its reason. The next
  message re-writes the cache and starts the pings again.
- `/keepwarm on` is the bare form, and `/spendometer keepwarm [args]` does what `/keepwarm` does. `/spendometer status`
  has a keepwarm line.

## Consequences
- An idle conversation pings up to about 29 times a day (every 50 minutes for 24 hours), each a few cents. Unticking
  is the way to stop it, and it is remembered for that conversation.
- A computer that is off or asleep cannot ping: the cache can still go cold overnight. The box stays ticked and the
  hover says why, so it can be trusted.
- The label `☑`/`☐` is one character, but a font may draw it as two columns; the layout measures it as two.
- ADR 0004 still holds for the pinger and for staying passive beside cache-tax; its switch defaults and the 6-hour
  window are replaced by this decision.
