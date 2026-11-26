# Backlog

What is next for spendometer, one file per item, so each item ships and is seen in the app on its own.

| Order | Item | Kind | Size |
|---|---|---|---|
| 10 | [The keep-warm flame is gone from the band](flame-missing.md) | bug | S |
| 20 | [The next message's cost is drawn over itself](next-cost-overlap.md) | bug | S |
| 30 | [Remove the Wrap up button](remove-wrap-up.md) | change | S |
| 40 | [Even spacing between the buttons](button-spacing.md) | bug | S |
| 50 | [Buttons that are always there](buttons-always-reachable.md) | change | M |
| 60 | [Keep warm as a checkbox](keep-warm-checkbox.md) | design | S |
| 65 | [Keep warm follows the cache's WARM/COLD state](keep-warm-follows-cold.md) | change | S |
| 70 | [The 5-hour pace in the top bar](pace-in-top-bar.md) | design | M |
| 80 | [Architecture: smaller files, clear roles, named numbers](refactor-architecture.md) | refactor | L |
| 85 | [Card tabs follow the domains](tabs-by-domain.md) | design | M |
| 90 | [Context tab pictures](context-pictures.md) | feature | M |
| 100 | [Cost tab pictures](cost-pictures.md) | feature | M |
| 110 | [README images and mockups for the tabs](readme-mockups.md) | change | S |
| 120 | [Better tab icons](tab-icons.md) | design | S |
| 130 | [The tight layout cuts off the 7D window](tight-layout-overflow.md) | bug | S |
| 140 | [Open a subagent's output from the band](subagent-output.md) | feature | M |
| 150 | [POC: coach the first prompt of a conversation](poc-prompt-coach.md) | poc | M |
| 160 | [POC: warn before a risky skill or tool call](poc-security-advisor.md) | poc | M |

## Format

- One file per item, named by its slug. Frontmatter: `type: backlog`, `order` (lower = sooner), `kind` (bug | feature |
  change | design | refactor | poc), `size` (S | M | L), `status` (todo | doing | done | dropped), `source`.
- Body: **Why** (the feedback, in the user's words where possible), **What**, **Done when** (what the user sees in the
  app), **Open** (questions to settle before building).
- The table above follows the frontmatter: when an item's order or status changes, change both in the same commit.

## Working rule

- One item per thread and per iteration: build it (tests first), the user checks it in the app with
  `/reload-plugins --force`, then commit to `dev` with the item's `status: done` in the same commit.
- Items of kind `design` get mockups, and the user picks one, before any code.
- A decision worth keeping (why it is built this way, not only what) gets an ADR in [`../adr/`](../adr/).
- New ideas go in as a new file with `status: todo`, not into the item being worked on.
