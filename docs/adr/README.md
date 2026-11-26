# Architecture decision records

One file per decision that shapes the code: what was decided, why, and what it costs. They say *why*, which the code
cannot, so a later change does not undo a decision without knowing it.

- Name: `NNNN-short-title.md`, numbered in order. Never renumber.
- Status: `accepted`, `superseded by NNNN`, or `proposed`.
- An ADR is not edited once accepted, apart from its status. A changed decision is a new ADR that supersedes the old.
- Write one when a change picks one of several reasonable ways and a later reader might ask "why not the other?".

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-fork-of-ribbon-as-a-local-mod.md) | A fork of ribbon, installed from this folder | accepted |
| [0002](0002-hook-only-listed-tools.md) | Hook only the tools that are measured | accepted |
| [0003](0003-card-is-one-svg.md) | The card is one hand-drawn SVG; the terminal gets no card | accepted |
| [0004](0004-keep-warm-built-in.md) | Keep warm is built in, passive beside cache-tax | accepted, partly superseded by 0007 |
| [0005](0005-card-tabs-replace-metric-row.md) | Tabs on the card replace the metric row | accepted |
| [0006](0006-docs-live-in-the-repo.md) | Backlog, ADRs and architecture notes live in the repo | accepted |
| [0007](0007-keep-warm-on-by-default-24h.md) | Keep warm is on by default, 24h after each message, shown as a checkbox (partly supersedes 0004) | accepted |
| [0008](0008-code-by-domain.md) | Code grouped by the user's questions (cost, capacity, activity, safety), with `band/` as infrastructure | proposed |

Template:

```markdown
# NNNN. Title

Status: accepted (YYYY-MM-DD)

## Context
What forced a choice: the problem, the constraints, the options.

## Decision
What we do.

## Consequences
What gets easier, what gets harder, what to watch.
```
