# 0008. Code is grouped by the user's questions, with the band as infrastructure

Status: proposed (2026-11-26)

## Context
`hooks/register.tsx` grew to about 1,500 lines and `hooks/cache-art.ts` to about 870, each with several roles, and the
files were named after code parts (art, store, register) rather than what they are for. Backlog item 80 asked for
smaller files with one role each. Grouping by feature (`band/`, `card/`, `keepwarm/`, `spend/`, `settings/`) was the
first direction; it splits things that belong together (spend and the cache share the price table) and gives seven
loose folders.

## Decision
- Four domains, each a question the user asks, not a part of the code:

  | Folder | The user's question | Holds |
  |---|---|---|
  | `cost/` | What is this work costing me, and how do I pay less? | prices, spend (turn, subagent, day, per commit/PR), the cache's warm/cold economics, keep warm |
  | `capacity/` | How much room do I have left? | 5h and 7D windows with pace; the context window, turns left and what filled it |
  | `activity/` | What is Claude doing right now? | progress, its themes, the crew of subagents |
  | `safety/` | Is Claude about to do something I can't undo? | the git hold |

- `band/` is infrastructure, not a domain: the render, the row layout, buttons and hovers, the card's frame, the
  settings command, and the look (colours, `svgDoc`, the font). `register.tsx` keeps only the `on(...)` wiring.
- A domain never imports another domain. What one domain needs from another is passed in as data by `register.tsx` or
  `band/`, or the domain keeps its own copy of a small helper (a formatter, `esc`). Copying is preferred over a shared
  utility module.
- A domain may import only one infrastructure file, `band/look.ts`, which imports nothing of the mod's own. That keeps
  one palette without a dependency cycle.
- Each domain owns its state: its atoms (same keys as before, so stored state survives) and its module variables. It
  exports a per-session reset that `register.tsx` calls, so the session handlers do not know any domain's atoms.
- New work goes into the domain whose question it answers: the prompt coach (item 150) is cost, subagent output (140)
  is activity, the security advisor (160) is safety.

## Consequences
- A domain is read whole in one folder; a cross-domain need shows as data passed through `band/` or `register.tsx`.
- Some small helpers exist twice. Acceptable while they are a few lines each; a copy that grows is a sign the data
  should be passed in instead.
- `band/` imports every domain. That is expected: it composes them.
- The check "no domain imports another" is a grep, run in each refactor step and before a PR.
