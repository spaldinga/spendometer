---
type: backlog
project: spendometer
order: 150
kind: poc
size: M
status: doing
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

## How it is judged (after about two weeks of use)
`/spendometer coach status` prints the figures: `coach: on · 23 briefs · first 10: 48% → last 10: 71% · Haiku $0.021
total, $0.001 a brief · 1 not scored`.

| Measure | Read from | Keep if | Drop if |
|---|---|---|---|
| Did the hints change the briefs? | the share of applicable parts covered, first 10 scored briefs against the last 10 | it rose by 15 points or more | flat or within 5 points |
| Is it worth the cost? | Haiku total and per brief | under $1 for the two weeks | more than the turns it plausibly saved |
| Does it work at all? | "not scored" against briefs | under 1 in 10 not scored | most calls fail |
| Is it noise? | the user's own view: how often a hint made them add something next time | it did, now and then | the line was skipped every time |

Keep → a new feature item (where it shows, the rubric's wording). Change → a new item for what to change. Drop →
`status: dropped` here, and remove `hooks/cost/coach/`.

## Open
Settled as assumptions when it was built (no user at hand; change any of them):
- **Off by default**, `/spendometer coach on|off|status`. The README promised no model calls; turning the coach on
  costs one small Haiku call per first prompt, and the README says so.
- **Where it shows:** one line in the transcript (`$.ui.log`), like keep warm's notes. No band or card space for a POC;
  a keep decision picks the place.
- **The call:** `$.model.complete` on `haiku` with only the rubric and the fenced prompt, not `$.model.fork`
  (a fork re-sends the whole conversation). 300 output tokens, 20 s timeout, fired and never awaited by the prompt.
- **First prompt:** the first prompt of 40 characters or more in a conversation (by session id), and again after
  `/clear` or a compaction. Shorter prompts ("kör", "ok go"), `/commands` and prompts from plugins are skipped and
  do not use up the slot. A conversation resumed after an app restart may be scored once more.
- **Language:** the rubric takes Swedish or English and asks its questions in the brief's language.
- **Cost:** kept as the coach's own tally (status line), not added to the session cost on the band, so the band
  keeps meaning what Claude's own turns cost.
- **History:** the last 200 scored briefs (enough for two weeks, so the first 10 stay to compare with) in `$.store` (`coachHistory`), and a count of calls with no score
  (`coachFails`). A score with no applicable part is not kept.

Built and committed 2026-11-27; not yet checked in the app.

### Check in the app
After `/reload-plugins --force`:
- `/spendometer` shows `coach: off · nothing scored yet`; nothing is scored and no model call is made while it is off.
- `/spendometer coach on`, then a new conversation with a real first brief: the prompt goes at once, and a moment
  later one line `brief coach: 2 of 4 parts · goal ✓ … · last 10: …% · Haiku $0.00x` with a question for each missing
  part, in the brief's language.
- The second prompt gets no line; `/clear` and a first brief after it gets one again.
- A first prompt of "kör" gets no line, and the next real brief does.
- `/spendometer coach status` shows the briefs, the first-10/last-10 share and the Haiku cost.
- Hypothesis to check: `model: 'haiku'` resolves to the current Haiku and is allowed on this account; if not,
  nothing shows and `not scored` counts up.
