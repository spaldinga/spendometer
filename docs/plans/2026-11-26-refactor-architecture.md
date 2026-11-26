# Refactor: code by domain, small files, named numbers (backlog 80)

Status: plan, agreed in conversation on 2026-11-26. Not started. Building starts after the user approves this plan.

## Purpose

The code is hard to change safely: `register.tsx` (~1,500 lines) and `cache-art.ts` (~870) carry many roles, files are
named after code parts rather than purpose, and pixel and column figures are unnamed. After this refactor each file has
one role its name says, about 150 to 400 lines, grouped by the question it answers for the user
([ADR 0008](../adr/0008-code-by-domain.md)). It comes before the Context and Cost pictures (items 90 and 100) so they
land in small files.

## Decisions taken in the brainstorm

- Four domains plus infrastructure: `cost/`, `capacity/`, `activity/`, `safety/`, and `band/`. A domain never imports
  another domain; it may import `band/look.ts` only. Small helpers are copied rather than shared.
- Each domain owns its atoms (keys unchanged) and module variables, and exports a per-session reset.
- `keepwarm.ts` and `progress-themes.ts` are split too.
- Tests: a step may change only `import` lines in tests (to a moved path); no test body, name or assertion changes.
  The big test files are split in the last steps, cases unchanged.
- `hooks/register.tsx` stays at its path: `hooks.json` loads it and the tests' `register` comes from it.

## Target layout

Sizes are estimates. Names may shift during a step if the code says otherwise; the role may not.

```
hooks/
  register.tsx            on(...) wiring only: each handler calls one or two domain functions (~250)
  hooks.json
  band/                   infrastructure
    look.ts               colours, LIGHT css, mix/ICE, svgDoc, font import (imports nothing of the mod)
    font.ts               (moved)
    layout.ts             (moved) layoutOf, fitOpen, column figures
    render.tsx            ui.render: reads the domains' views, picks the layout, assembles the row and card
    widths.ts             column estimates for each layout (pure)
    row.tsx               the row's pieces per layout
    buttons.tsx           tab, fold and keep buttons, hover tips; lastWidth and its getter
    card.ts               the card frame: tab, grid of zones, status lines; calls the domains' zone drawers
    settings.ts           /spendometer: parses the keyword, asks the owning domain, writes settings
  cost/
    prices.ts             MODELS, familyOf, cold/warm/turn cost, usd, tok
    cache.ts              cache facts (from cache-store.ts) and viewOf
    spend.ts              the Spent record, addSpend, addToolOut cost side, spendLine, per-session reset
    days.ts, results.ts   (moved)
    chip.ts               WARM/COLD chip, Robo, chipTip, keepWarmCost, cheaperModels
    metrics.ts            hit rate, outliers, delegation (from metrics.ts)
    card-zones.ts         SPEND, DELEGATION, CACHE DISCOUNT, PER MESSAGE, BY MODEL
    keepwarm/
      pinger.ts           window, deadline, retries, ping, warmNow
      switch.ts           records, on/off, checkbox view, keepTip, pressKeep
      command.ts          /keepwarm, status, warnCold, cache-tax detection
  capacity/
    windows.ts            windows atom, clean, trackPace, liveWindows, pull
    pace.ts               (moved)
    pace-art.ts           pies, pace track, paceWords, fmtReset, PACE_TIP
    context.ts            addContext, the measure handler, seen atom, forgetPath, measureCall
    toolout.ts            (moved)
    runway.ts             runway, nextGrowth (from metrics.ts)
    card-zones.ts         pace strip, CONVERSATION SIZE / RE-CACHE, TOOL OUTPUT
  activity/
    progress.ts, progress-art.ts   (moved)
    crew.ts               crew atom, crewText, agent.spawn handling
    themes/
      kit.ts              shared drawing helpers (text, bar, dotted, anim, nodesOf)
      calm.ts, vitals.ts, bridge.ts, wake.ts, dial.ts, comet.ts
      index.ts            THEME_IDS, THEMES, names, isThemeId, themeIdOf, old ids
  safety/
    guard.ts              (moved; keeps the MIT and Blast Radius notices)
    hold.ts               held, ticking, waitAt, waitTick, pass, resetHold, the tool.call hold
    hold-band.tsx         the band shown while a command is held
```

`metricsOf` assembles figures from both cost and capacity for the card, so it goes to `band/card.ts` (or a
`band/card-metrics.ts` if that keeps `card.ts` under 400 lines).

## Rules for every step

- One responsibility moves; no behaviour changes; one commit on `dev`.
- Tests: only import lines may change. If a test fails, the step is wrong, not the test.
- `docs/architecture.md` is updated in the same commit when a responsibility moves (the module table and file paths).
- Verify (Git Bash, in the repo):
  - `BUN_INSPECT= claude plugin test .` all pass, same count as before the step.
  - `BUN_INSPECT= claude plugin validate .` passes.
  - Domain check, both empty (inside a domain, files reach each other with `./` or `../x`, never by a domain name):
    `grep -rnE "from '(\.\./)+(cost|capacity|activity|safety)/" hooks/cost hooks/capacity hooks/activity hooks/safety`
    `grep -rnE "from '(\.\./)+band/" hooks/cost hooks/capacity hooks/activity hooks/safety | grep -v "band/look'"`
  - `wc -l` of the touched files: none over about 400 (until the step that splits it).
- Who does it: a `sonnet-coder` subagent per step with a self-contained brief (the step text, the rules above, the
  verify commands, the machine gotchas from `AGENTS.md`); Opus reviews the diff before the commit.
- After steps marked **app check**, the user runs `/reload-plugins --force` and looks at the band before the next step.

## Steps

1. **Probe: subfolders load.** Move `days.ts` and `results.ts` to `cost/`. Files: those two, their importers, the
   two tests' imports. **App check**: the band still draws after a reload. If the loader cannot resolve subfolders,
   stop and revisit the plan.
2. **`band/look.ts`.** Colours, `LIGHT`, `mix`/`ICE`, `svgDoc` out of `cache-art.ts`; `font.ts` to `band/`.
3. **`cost/prices.ts`.** `MODELS`, `familyOf`, the cost functions, `turnCost`, `usd`, `tok` out of `cache-art.ts`.
4. **`cost/cache.ts`.** `cache-store.ts` plus `viewOf` (from `register.tsx`).
5. **`cost/keepwarm/`.** Split `keepwarm.ts` into `pinger.ts`, `switch.ts`, `command.ts`. Callers keep the same function
   names.
6. **`cost/chip.ts`.** Chip, Robo, `chipTip`, `keepWarmCost`, `cheaperModels`, `fmtBreakEven` out of `cache-art.ts`.
7. **`cost/spend.ts`.** `addSpend`, `readDays`, `addResults`, the cost side of `addToolOut`, `spendLine`, the
   day/spend clean-up constants, out of `register.tsx`.
8. **`capacity/windows.ts`, `pace.ts`, `pace-art.ts`.** Window atom and helpers from `register.tsx`; pies, pace track,
   `paceWords`, `fmtReset` from `cache-art.ts`. A formatter `cost/` also uses is copied, not shared.
9. **`capacity/context.ts`, `toolout.ts`.** `addContext`, the measure logic, `seen`, `forgetPath`, `measureCall`.
10. **Split `metrics.ts`.** Hit rate, outliers, delegation to `cost/metrics.ts`; runway and growth to
    `capacity/runway.ts`; `metricsOf` to `band/`.
11. **Card zones out of `cardSvg`.** First `band/card.ts` with the frame and the zone helpers (`t`, `big`, `dots`,
    `capSize`, `pick`) as functions; zones still inline. Commit.
12. **Capacity zones** to `capacity/card-zones.ts` (pace strip, conversation size, tool output). Each zone is a
    function taking its box and data. **App check**: every tab at a wide and a narrow width.
13. **Cost zones** to `cost/card-zones.ts`. `cache-art.ts` is now empty and is deleted. **App check** as 12.
14. **`activity/`.** `progress.ts`, `progress-art.ts`; `crew.ts` with the crew atom and `crewText`.
15. **`activity/themes/`.** `kit.ts`, one file per theme, `index.ts`. **App check**: `/spendometer progress <id>` for
    each theme.
16. **`safety/`.** `guard.ts`; `hold.ts` with `held`, `ticking`, `waitAt` and the hold logic; `hold-band.tsx` with the
    held band's drawing.
17. **`band/` render split.** `ui.render`'s body into `render.tsx`, `widths.ts`, `row.tsx`, `buttons.tsx`
    (`lastWidth` moves here with a getter). Two commits if one is too large to review: widths first, then row and
    buttons. **App check**: wide, compact, minimal and terminal.
18. **`band/settings.ts`.** `/spendometer` parsing; each domain answers its own keyword.
19. **Per-session resets.** Each domain exports its reset; `session.start`, `session.end`, `classic.SessionStart` and
    `session.compact` call them. `register.tsx` is now wiring only. **App check**: a new conversation starts clean.
20. **Named constants, one commit per folder** (`cost`, `capacity`, `activity`, `safety`, `band`): every pixel and
    column figure gets a name and a comment saying what it measures, grouped per drawing at the top of its file.
21. **Split the big tests, one commit per file**: `keepwarm.test.ts` by keepwarm file, `card.test.ts` and
    `layout.test.ts` by domain/infrastructure. Cases unchanged, same total count.
22. **Close.** `docs/architecture.md` final pass, ADR 0008 to accepted, backlog 80 `status: done` (file and table).

## Done when

No file over about 400 lines; each file has one role its name says; the domain check is empty; magic numbers named;
all tests pass with only import lines changed (until step 21); the band looks the same in the app at every width.

## Risks

- **Subfolder loading** is unverified; step 1 checks it before anything else moves.
- **Closures**: `ui.render` (~650 lines) and `cardSvg` (~415) are closures over many locals. Pulling pieces out means
  passing a context object; a missed variable changes what is drawn without failing a test that does not look at it.
  Hence the app checks after steps 12, 13 and 17.
- **No type-check** on this machine: a wrong import shows only as a test or load failure.
- Other work on `dev` during the refactor (items 90/100 wait; others may not) conflicts with moved files. Keep each step
  short-lived and commit before starting the next.
