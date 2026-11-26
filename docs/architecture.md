# Architecture

One page on how spendometer fits together. Keep it current: a change that moves a responsibility updates this page in
the same commit. Why things are as they are: [`adr/`](adr/). What is next: [`backlog/`](backlog/).

## What it is

A Claude Code mod that draws a band above the prompt: usage limits, the conversation's cost, the cache state with a
keep-warm mark, a progress bar, the subagents at work, and a card that opens under it with tabs. It also holds risky
git commands until the user answers, and keeps the prompt cache warm between messages.

## Entry point

`hooks/hooks.json` loads one module, `hooks/register.tsx`. Its `register(on)` wires every event:

| Event | What it does |
|---|---|
| `session.start`, `session.end`, `classic.SessionStart`, `session.compact` | Reset or carry per-conversation state (cache facts, seen files, keep-warm window) |
| `prompt.submit`, `turn.step`, `turn.complete` | Progress, the turn's cost, pace samples, the spend record |
| `session.measure` | The context size; clears the re-read set when the context shrinks |
| `agent.spawn` | Subagents for the crew display and delegation figures |
| `tool.call` | The git hold ([guard](../hooks/safety/guard/guard.ts)); tool output measuring on the listed tools ([ADR 0002](adr/0002-hook-only-listed-tools.md)) |
| `command.run` | `/spendometer` (settings, fold, tab, cost, progress theme; `keepwarm [args]` is `/keepwarm`, and `status` has a keepwarm line) and `/keepwarm` |
| `ui.render` | Draws the band: picks a layout, the row, the buttons, the progress row and the open card |

On this machine `classic.SessionStart` is skipped for user-installed mods; don't rely on it (see `AGENTS.md`).

## Modules

Pure modules take data and return data or an SVG string; they never touch the engine (`$`), so they are tested
directly. Engine code lives in `register.tsx`, `cost/cache/keepwarm/`, `safety/guard/` and the stores under `cost/`.

| File | Role | Pure |
|---|---|---|
| `register.tsx` | All event wiring: `on(...)` calls, the per-session resets (until step 19), the clean-up of old saved state, `countCall` and `afterShell`; the `ui.render` handler is one line calling `renderBand`, and `/spendometer` calls `settingsAnswer` | no |
| `band/render.tsx` | `renderBand` (`ui.render`): reads the domains' views, measures, picks the layout, builds the band and the open card; `arm`, the 30 s redraw timer | no |
| `band/row.tsx` | The row's pieces per layout: window blocks (pie, pace track and words), the cost box, the chip with Robo, the assembled rows (`RowCtx`, `Pieces`) | no |
| `band/progress-row.tsx` | The progress row: bar, words and crew fitted to the room (`progressRowOf`) | no |
| `band/buttons.tsx` | The fold button, the tabs and the keep-warm mark, the hover box (`tip`), `toggleFold`, `pressTab`, `tabOf`; the `fold` atom and the card tab in the store | no |
| `band/width-note.ts` | The width the band was last drawn at (`noteWidth`, `noteFit`, `widthLine`), for the status command | no |
| `band/settings.ts` | `/spendometer`: `settingsAnswer` parses the keyword and asks the owner (the `keepwarm` keyword goes to the keepwarm command); `SETTINGS`, `HOLD_KEY`, `THEME_KEY`, `switchOf`, `themeOf`, the theme and tab lists | no |
| `cost/cache/keepwarm/pinger.ts` | The keep-warm pinger: window, deadline, timers, retries, the warm-now ping ([ADR 0004](adr/0004-keep-warm-built-in.md)) | no |
| `cost/cache/keepwarm/state.ts` | The switch's state: the `Keep` record, the per-conversation records in the store, the constants (on by default, 24h after each message; [ADR 0007](adr/0007-keep-warm-on-by-default-24h.md)) | no |
| `cost/cache/keepwarm/lifecycle.ts` | The conversation lifecycle (seat, detect cache-tax, restore, the band's hooks) and the mark's state and hover (follows the cache: cold stops the window) | no |
| `cost/cache/keepwarm/command.ts` | `/keepwarm` and its status line, the durations, and the cold-send warning | no |
| `safety/guard/guard.ts` | Recognises risky git commands and measures what they would lose (keeps the MIT and Blast Radius notices) | no |
| `safety/guard/hold.ts` | The hold: `holdCommand`, `heldNow`, `SHELLS`, `resetHold`; the held call and the working wait are private module variables | no |
| `safety/guard/band.tsx` | `heldBand`: the band drawn while a command is held | no |
| `cost/cache/facts.ts` | The cache facts in atoms and the store, and `viewOf`, `CacheView`, `TTL_*`, `fmtIdle`, `mineModel` | no |
| `cost/cache/chip.ts` | The WARM/COLD chip and Robo; keep-warm cost figures (`keepWarmCost`, `cheaperModels`) and the chip's hover text | yes |
| `cost/spend/record.ts` | The session's `Spent` record in the store: read it, and add a turn's cost (`addSpend`, with the `subsSince` atom and `putSpan`), commits and PRs (`addResults`), tool output (`addToolOut`), context size and growth (`addContext`), keep-warm figures; `readDays`, `spendLine`, the clean-up ages | no |
| `cost/prices.ts` | The price table (`MODELS`), what a turn cost, `usd` and `tok` as the card writes them | yes |
| `band/card.ts` | The card frame (`cardSvg`): the tab, the columns, where each zone goes, status lines, alt text; its tabs and spend type | yes |
| `capacity/usage/card.ts` | The pace strip (`paceStrip`) | yes |
| `capacity/context/card.ts` | CONVERSATION SIZE / RE-CACHE (`sizeZone`), TOOL OUTPUT (`toolsZone`), `runwayOf` | yes |
| `cost/spend/card.ts` | SPEND (`spendZone`, with `spendFiguresOf` and the `CardSpend` type), DELEGATION (`delegZone`), PER MESSAGE (`avgZone`), BY MODEL (`modelsZone`, `MODEL_COLOR`) | yes |
| `cost/cache/card.ts` | CACHE DISCOUNT (`discountZone`) | yes |
| `band/widths.ts` | The row's width in columns for each layout (`needOf`, `WidthIn`), from plain data; the window names and cell counts (`NAMES`, `SHORT`, `CELLS`, `LOW_AT`, `TIGHT_CELLS`) | yes |
| `layout.ts` | Chooses the band's layout (wide, compact steps, tight) from estimated column widths; `fitOpen`; `Kind`, `bandPx` | yes |
| `cost/spend/metrics.ts` | Cost-side figures from the `Spent` record: hit rate, outliers, top types and models, delegation | yes |
| `capacity/context/runway.ts` | Context growth (`nextGrowth`) and runway turns | yes |
| `band/card-metrics.ts` | `metricsOf` and `Metrics`: the card's metric row, assembled from both domains | yes |
| `capacity/context/toolout.ts` | Tool output tokens and the re-read keys | yes |
| `capacity/context/size.ts` | The `seen` atom (re-read keys), `clearSeen`, `measureCall` (returns the tool, tokens and re-read flag), `forgetPath`, `isDeny` | no |
| `capacity/usage/pace.ts` | Pace of a usage window | yes |
| `capacity/usage/windows.ts` | The `windows` atom, `clean`, `trackPace`, `paceFor`, `liveWindows`, `pull`, `setWindows`, `keptWindows` | no |
| `capacity/usage/art.ts` | The pie, 5h pace track, `paceWords`, `fmtReset`, `fmtSpan`, `PACE_TIP`, `PaceRow` | yes |
| `cost/spend/days.ts`, `cost/spend/results.ts` | Spend per day; commits and PRs from command text | yes |
| `activity/progress/progress.ts`, `activity/progress/art.ts` | Where the request is; the progress bar drawings | yes |
| `activity/progress/themes/` | The progress themes: `kit.ts` (shared drawing helpers, `Theme`), one file per theme (`calm`, `vitals`, `bridge`, `wake`, `dial`, `comet`), `index.ts` (`THEMES`, ids, names, `themeIdOf`) | yes |
| `activity/progress/state.ts` | The `progress` atom (`readProgress`, `noteListCall`, `noteReport`, `dropFinished`) and the `turn` atom (`readTurn`, `startTurn`, `countStep`) | no |
| `activity/crew.ts` | The `crew` atom, `crewText`, `CREW_SHOWN`, and what the spawn, step and turn hooks do to the crew | no |
| `band/look.ts` | The band's palette (TEXT, HUE, LC_*, ICE, LIGHT...), `svgDoc`, the SVG wrapper, and the drawing kit (`Kit`, `kitOf(W, mode)`: `t`, `big`, `dots`, `pick`, `capPick`, `hline`...) the zones share; the one file domains may import | yes |
| `band/font.ts` | The embedded Outfit font for SVG text | data |

`types/index.d.ts` holds the shared types (`Spent`, `Fold`, plugin state). Host types are not on disk; the mod has
never been type-checked.

## State

| Where | Lifetime | Holds |
|---|---|---|
| Atoms (`atom({plugin:'spendometer', key})`, in `$.state`) | Survive a reload, not a restart | cache facts, fold (`band/buttons.tsx`), progress and turn (`activity/progress/state.ts`), crew (`activity/crew.ts`), seen files (`capacity/context/size.ts`), usage windows (`capacity/usage/windows.ts`), subagent cost since the last turn (`subsSince`, in `cost/spend/record.ts`) |
| `$.store` | Persistent | settings (`cardTab`, `progressTheme`, `hold`, `keepDefault`), `spend:<sessionId>`, `keep:<id>`, days |
| Module variables | Lost on reload | `lastWidth` (for the status command, in `band/width-note.ts`), timers, the redraw flag (`ticking`, in `band/render.tsx`), the held call and the working wait (`held`, `waitAt`, in `safety/guard/hold.ts`) |

The `Spent` record is written read-modify-write through `readSpend`/`recordOf`; new fields must be carried by both.

## The band's render

`ui.render` calls `renderBand` (`band/render.tsx`), which does the four steps below; `RowCtx` (`band/row.tsx`) carries the surface, the windows, the cost and the chosen layout to the row's pieces.

1. Read the cache view, usage windows, spend, fold and tab, keep-warm state, the crew, the progress and the theme.
2. Estimate each layout's width in columns from the text it will show (`needOf` in `band/widths.ts`, over `textCols`; about half a column a character
   on the desktop) and let `layoutOf` pick the layout. From the first reply on the desktop the band is one row at every width: wide, compact (5 steps, tabs and + inline), step 4 without + (the tabs open and close the card), then slimmer variants (no 5h pace track, no keep box, the 5h window only), and last the minimal row (5h pie and percent, Robo, +; no tabs), chosen even when it does not fit. There is no buttons row and no tight layout there. The terminal, and the desktop before the first reply, keep compact, tight and a row of their own for buttons that do not fit.
3. Build the row (`band/row.tsx`; buttons in `band/buttons.tsx`, the progress row in `band/progress-row.tsx`): label, usage pies (the 5h one with its pace track and words), cost, Robo and the WARM/COLD chip with its hover, the keep-warm mark (a green ✓ only while on), then the
   tab buttons (desktop, once there is a cache view, card open or closed: a press opens the card on that tab, or closes it on the tab in use; `pressTab` over `toggleFold`), and fold (not from compact step 4 down, until the minimal row, see 2).
4. The open card (desktop only, [ADR 0003](adr/0003-card-is-one-svg.md)): `cardSvg` builds the drawing kit (`kitOf`) and draws the chosen tab at the
   band's width, handing each zone function in a slice's `card.ts` the kit, its box and its data; `fitOpen` drops the progress row if the band would pass `maxRows`.

## Tests

`tests/` uses the plugin test kit: `BUN_INSPECT= claude plugin test .`. Pure modules are tested by value; the band by
rendering through the kit and reading the visible text (`tests/visible.ts` leaves hover boxes out). No `Bun` global,
no `toBeCloseTo`, no dynamic `import()`.

## Known debt

`register.tsx` (about 330 lines) still holds the per-session resets and the clean-up of
old saved state, and pixel and column figures are often unnamed. See [refactor-architecture](backlog/refactor-architecture.md).
