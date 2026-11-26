---
type: backlog
project: spendometer
order: 150
kind: poc
size: M
status: todo
source: idea from the prompt-coach mod (stilero/mods-marketplace), 2026-11-26
---

# POC: coach the first prompt of a conversation

## Why
A vague first prompt costs turns: Claude asks, guesses, or redoes work. prompt-coach scores the first prompt of each
conversation and says what is missing. This is a proof of concept to find out whether that saves anything here before
it becomes a feature.

## What
On the first prompt of a conversation (and after /clear or a compaction), a small Haiku call with a fixed rubric
scores which parts the brief covers: goal, why, constraints, done when, what to reuse. Only parts that apply are
scored. The prompt is fenced as data in the rubric. The result is a hint for next time, never a hold: the prompt is
sent at once. A missing score is only that (fails open).

Show it in the band or the card: the parts covered, and the share of applicable parts over the last 10 briefs
(kept in `$.store`).

## Done when
- In the app, the first prompt of a conversation gets a short score with a question for each missing part.
- After about two weeks of use, the user can answer: did the hints change how they write briefs, and is the Haiku
  cost per conversation worth it? Then keep it (new feature item), change it, or drop it.

## Open
- Where does the score show: the band, a tab in the card, or a toast?
- Does the rubric fit how the user writes (Swedish and English, short go-aheads like "kör")? Skip prompts under
  some length?
- What does one score cost in practice, and should the session cost include it?
