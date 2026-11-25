# 0004. Keep warm is built in, passive beside cache-tax

Status: accepted (2026-11-25, recorded after the fact; decided in 3.0.0)

## Context
Keeping the prompt cache warm between messages saves re-paying for the whole context after a break. Spendometer first
drove cache-tax (a separate mod) for this. Two mods then held the state: the button, the `/keepwarm` command and the
timer could disagree.

## Decision
Port cache-tax's pinger (2.3.1, MIT) into `hooks/keepwarm.ts`: one switch per conversation, one record `keep:<id>` in
the store, the band's own cache facts as the clock. Spendometer registers `/keepwarm`. When cache-tax is installed,
spendometer stays passive and shows no keep-warm switch, so two pingers never run at once.

## Consequences
- One state for the command, the button and the timer.
- The cache-tax MIT notice stays in `keepwarm.ts`.
- With cache-tax still installed, the user sees no switch in the band. The README asks users to uninstall cache-tax.
  This is a likely cause of the [missing flame](../backlog/flame-missing.md).
