# Architecture

One page on how spendometer fits together. Keep it current: a change that moves a responsibility updates this page in
the same commit. Why things are as they are: [`adr/`](adr/). What is next: [`backlog/`](backlog/).

## What it is

A Claude Code mod that draws a band above the prompt: usage limits, the conversation's cost, the cache state with a
keep-warm checkbox, a progress bar, the subagents at work, and a card that opens under it with tabs. It also holds risky
git commands until the user answers, and keeps the prompt cache warm between messages.

## Entry point

`hooks/hooks.json` loads one module, `hooks/register.tsx`. Its `register(on)` wires every event:

| Event | What it does |
|---|---|
| `session.start`, `session.end`, `classic.SessionStart`, `session.compact` | Reset or carry per-conversation state (cache facts, seen files, keep-warm window) |
| `prompt.submit`, `turn.step`, `turn.complete` | Progress, the turn's cost, pace samples, the spend record |
| `session.measure` | The context size; clears the re-read set when the context shrinks |
| `agent.spawn` | Subagents for the crew display and delegation figures |
| `tool.call` | The git hold ([guard](../hooks/guard.ts)); tool output measuring on the listed tools ([ADR 0002](adr/0002-hook-only-listed-tools.md)) |
| `command.run` | `/spendometer` (settings, fold, tab, cost, progress theme; `keepwarm [args]` is `/keepwarm`, and `status` has a keepwarm line) and `/keepwarm` |
| `ui.render` | Draws the band: picks a layout, the row, the buttons, the progress row and the open card |

On this machine `classic.SessionStart` is skipped for user-installed mods; don't rely on it (see `AGENTS.md`).

## Modules

Pure modules take data and return data or an SVG string; they never touch the engine (`$`), so they are tested
directly. Engine code lives in `register.tsx`, `keepwarm.ts`, `guard.ts` and `cache-store.ts`.

| File | Role | Pure |
|---|---|---|
| `register.tsx` | All event wiring; the band's render; the settings command | no |
| `keepwarm.ts` | The keep-warm pinger: window, deadline, retries; the switch (on by default, 24h after each message), the checkbox state (follows the cache: cold stops the window, a click on a cold cache warms it with one ping) and its hover ([ADR 0004](adr/0004-keep-warm-built-in.md), [ADR 0007](adr/0007-keep-warm-on-by-default-24h.md)) | no |
| `guard.ts` | Recognises risky git commands and holds them | no |
| `cache-store.ts` | Reads and writes the cache facts and the session's `Spent` record in atoms and the store | no |
| `cache-art.ts` | Prices and models; the chip, Robo, pie, 5h pace track and card SVGs; the chip's hover text; the 5h pace words | yes |
| `layout.ts` | Chooses the band's layout (wide, compact steps, tight) from estimated column widths; `fitOpen` | yes |
| `metrics.ts` | The card's derived figures from the `Spent` record (hit rate, runway, outliers, delegation) | yes |
| `toolout.ts` | Tool output tokens and the re-read keys | yes |
| `pace.ts`, `days.ts`, `results.ts` | Pace of a usage window; spend per day; commits and PRs from command text | yes |
| `progress.ts`, `progress-art.ts`, `progress-themes.ts` | Where the request is; the progress bar drawings and themes | yes |
| `font.ts` | The embedded Outfit font for SVG text | data |

`types/index.d.ts` holds the shared types (`Spent`, `Fold`, plugin state). Host types are not on disk; the mod has
never been type-checked.

## State

| Where | Lifetime | Holds |
|---|---|---|
| Atoms (`atom({plugin:'spendometer', key})`, in `$.state`) | Survive a reload, not a restart | cache facts, fold, progress, crew, turn, seen files |
| `$.store` | Persistent | settings (`cardTab`, `progressTheme`, `wrapUp`, `hold`, `keepDefault`), `spend:<sessionId>`, `keep:<id>`, days |
| Module variables | Lost on reload | `lastWidth` (for the status command), timers |

The `Spent` record is written read-modify-write through `readSpend`/`recordOf`; new fields must be carried by both.

## The band's render

1. Read the cache view, usage windows, spend and keep-warm state.
2. Estimate each layout's width in columns from the text it will show (`textCols`; about half a column a character
   on the desktop) and let `layoutOf` pick wide, compact (5 steps) or tight. Buttons that do not fit go to their own row.
3. Build the row: label, usage pies (the 5h one with its pace track and words), cost, Robo and the WARM/COLD chip with its hover, the keep-warm checkbox (✓/✗, measured as two columns), then the
   tab buttons (card open), fold and wrap-up.
4. The open card (desktop only, [ADR 0003](adr/0003-card-is-one-svg.md)): `cardSvg` draws the chosen tab at the
   band's width; `fitOpen` drops the progress row if the band would pass `maxRows`.

## Tests

`tests/` uses the plugin test kit: `BUN_INSPECT= claude plugin test .`. Pure modules are tested by value; the band by
rendering through the kit and reading the visible text (`tests/visible.ts` leaves hover boxes out). No `Bun` global,
no `toBeCloseTo`, no dynamic `import()`.

## Known debt

`register.tsx` (about 1,450 lines) and `cache-art.ts` (about 830) carry several roles each, and pixel and column
figures are often unnamed. See [refactor-architecture](backlog/refactor-architecture.md).
