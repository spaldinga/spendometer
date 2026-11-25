# spendometer

**Know where you stand while Claude works.** A band above the Claude Code prompt shows how much of
your usage you have used (as pies) and when it resets, what the conversation has cost, whether the prompt cache is
still warm, how far the current request has come, and which subagents are running. It also stops a
`git reset --hard` until you have seen what it would throw away.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/card-b-1200-warm-dark.svg">
  <img alt="The spendometer band with its card open: pies for the 5-hour and 7-day limits, the conversation's cost, the cache WARM with 32 minutes left, and a card led by the pace of each limit against its reset, then what delegating to subagents saved, the cache size with turns of context left, the spend over seven days, keep warm as a status line, the cache hit rate, cost per turn and cost by model" src="assets/card-b-1200-warm-light.svg">
</picture>

spendometer is a [Claude Code mod](https://code.claude.com/docs): it draws and listens, and never calls a
model by itself. No setup, no keys, no account. Pictures in this README are mockups with example
numbers, shown in your GitHub theme.

## Install

One line in a terminal (bash, zsh or PowerShell 7):

```bash
claude plugin marketplace add spaldinga/spendometer && claude plugin install spendometer@spendometer
```

Then, in a Claude Code session that is already open, run `/reload-plugins --force` (a new session
picks it up by itself). That's it: the band appears above the prompt.

Or from inside Claude Code:

```
/plugin marketplace add spaldinga/spendometer
/plugin install spendometer@spendometer
/reload-plugins --force
```

No script is downloaded or run: both ways use Claude Code's own plugin commands. Needs Claude Code
2.1.287 or later; more under [Requirements](#requirements). In Windows PowerShell 5.1, use `;`
instead of `&&`.

## What you get

### Your limits, your cost and your cache, in one row

The top row is always there: the 5-hour and 7-day limits, first as `/usage` lists them, each as a small pie of what is used with the percent used and when it resets (on a narrow band: `5h ◔ 10%  week ◔ 31%`, then the pies and percents alone; the terminal has no pies and keeps its dots and percent left),
what this conversation has cost and what the last turn cost, and the prompt cache: `WARM` with the
minutes left, or `COLD` with what the next message will cost to re-cache. Hover a limit for the
details.

### A card with the numbers behind it

Press `+` on the band (or type `/spendometer fold`) to open the card. It shows one tab at a time, picked with the buttons before `−` (words on a wide band, a glyph each on a narrow one; the one in use is in brackets) or with `/spendometer tab overview|context|cost`; the choice is kept. **Overview** is the pace of each usage window against its reset (the bar is how much of the limit is used, red when it runs out before the reset; the tick is how much of the window's time has gone), then delegation (what subagents saved) and the spend (this thread and the last seven days, with the commits and pull requests it made and what a result cost). **Context** is the conversation size with the turns left, and the tool output (tokens by tool, with how many files were read again unchanged). **Cost** is the cache discount, the cost per message (red when the last one cost three times the average or more) and the cost by model. What keeping the cache warm costs is the hover of the WARM/COLD chip, beside the keep warm checkbox. A zone with no column of its own becomes one status line below.

**Wide.** Overview in two columns.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/card-b-1200-warm-dark.svg">
  <img alt="The open card, wide and warm: the pace of the 5-hour window running out in about 2h 40m and the 7-day window lasting past its reset, then columns for delegation (about $3.40 saved), 190k tokens in cache with about 40 turns of context left, and $16.61 spent in this thread with seven day bars, a status line for keep warm at $0.05 an hour with $4.20 saved, and a row with a 96% cache hit, $0.38 a turn and Opus at 78% of the cost" src="assets/card-b-1200-warm-light.svg">
</picture>

**Narrow.** One column and a status line each for the cache and the spend (the cache line reads re-cache, once the cache has gone cold). Keep warm is in the chip's hover.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/card-b-600-warm-dark.svg">
  <img alt="The narrow card, warm: the pace strip, the delegation column, and status lines for the cache, the spend and keep warm $0.05 an hour with $4.20 saved" src="assets/card-b-600-warm-light.svg" width="49%">
</picture>
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/card-b-600-cold-dark.svg">
  <img alt="The narrow card, cold: re-cache $1.52 on Opus, with Sonnet and Haiku cheaper" src="assets/card-b-600-cold-light.svg" width="49%">
</picture>

### Progress you can read at a glance, in six styles

While Claude works through a task list, the band shows how far it has come, the step in progress,
and the subagents running. Pick a style with `/spendometer progress <id>`; the choice is kept for every
session.

**`comet`** (default): a comet streaks to the current step and sets it ringing.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/theme-comet-dark.svg">
  <img alt="Comet: nodes on a line, three done, a comet flying to the fourth, named Run tests" src="assets/theme-comet-light.svg">
</picture>

**`calm`**: one quiet segment per step, the current one breathing. The least motion.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/theme-calm-dark.svg">
  <img alt="Calm: seven segments, three orange, the fourth pulsing" src="assets/theme-calm-light.svg">
</picture>

**`vitals`**: a monitor pen writes each finished step as a heartbeat; a heart beats at the step in
progress.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/theme-vitals-dark.svg">
  <img alt="Vitals: an ECG trace with three beats ending at a beating heart, named Run tests" src="assets/theme-vitals-light.svg">
</picture>

**`bridge`**: a starship console, every step a labelled panel, the active one blinking.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/theme-bridge-dark.svg">
  <img alt="Bridge: console blocks READ CODE, PLAN, WRITE CODE done, RUN TESTS blinking, the rest dimmed" src="assets/theme-bridge-light.svg">
</picture>

**`wake`**: the step names as breadcrumbs, riding a wave that swells under the current step.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/theme-wake-dark.svg">
  <img alt="Wake: breadcrumbs with Plan and Write code ticked and Run tests current, a wave under them" src="assets/theme-wake-light.svg">
</picture>

**`dial`**: every step a dial that fills like a clock hand; full dials are done.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/theme-dial-dark.svg">
  <img alt="Dial: three full discs, the fourth filling like a clock, named Run tests" src="assets/theme-dial-light.svg">
</picture>

### A second look before git throws work away

When Claude runs `git reset --hard`, a discarding `git checkout` or `git restore`, a forced
`git clean` or a force push, spendometer holds it and shows what would be lost. Nothing runs until you
press **Proceed**.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/hold-dark.svg">
  <img alt="A held git reset --hard HEAD~2: it would drop two commits and discard changes in three files, with Cancel and Proceed buttons" src="assets/hold-light.svg">
</picture>

### Keep the cache warm, wrap up cleanly

- **Keep warm** (built in; uninstall [cache-tax](https://github.com/karanb192/cache-tax) if you have it): a checkbox, per conversation, on by default. It keeps the
  prompt cache alive for 24 hours after each of your messages (every message starts the 24 hours again), so coming back after a break doesn't re-pay for the
  whole context. The box is ✓ ticked or ✗ unticked, right after the WARM/COLD chip: untick it and it stays off in that conversation. Its hover says what the state means, including "ticked, but the cache went cold" when the computer slept or was off and nothing could ping. Hover the chip to see what keeping warm costs an hour and what it has saved.
- **Wrap up** (optional): runs your `/debrief` with the conversation's cost, then lets this
  conversation's cache go cold.

## What it shows

| Part | What you see | Where it comes from |
|---|---|---|
| **Usage** | 5-hour and 7-day limits as small pies with percent used and reset time (the terminal: dot bars and percent left); `LOW` under 15% left | Claude Code's own rate-limit figures |
| **Prompt cache** | `WARM` with minutes left, or `COLD` with the idle time and what the next message costs to re-cache. `+` opens a card with the context size and free room, what is spent (this conversation and the last seven days), keep-warm cost and savings, how fast each usage window is being used against its reset and, while cold, what re-caching costs on this model and the cheaper ones. On a wide band a second row shows the cache hit rate, the average and last turn's cost, how many turns of context are left at the current growth, and what subagents have cost. Hover a usage window or the compact chip for the limit and reset time or the minutes left | A clock from the last main-thread request, one hour long |
| **Progress** | Six styles to choose from (comet by default), with the count and the step in progress | The task list Claude already keeps, or the `progress` tool (below) |
| **Activity** | With no task list: each style's working animation and `working · 4 steps · 1m 12s` | Turn events |
| **Subagents** | One small orange dot per running subagent, `×2 Explore 4, sonnet-coder 12` | Subagent start, request and finish events |
| **Cost** | `COST ≈$12.40 · last $0.35`: the conversation so far and the latest turn | Token counts per finished turn at list prices |

## What it does

- **Keep warm checkbox** (built in). One box per conversation and the typed `/keepwarm` drive one state. It is on
  by default. With it on, every turn that reached the cache holds a window of 24 hours from then, so each message
  starts the 24 hours again; while the window is open and the cache is warm, a short ping goes out 50 minutes after
  your last request, so the cache is read, not re-written, when you come back. The box is ✓ when this conversation's
  switch is on (or a one-off window is open), else ✗: unticking turns the switch off and stops the window, and the
  conversation stays unticked until you tick it again; a message does not tick it back. A computer that is off or
  asleep cannot ping, so the cache can still go cold overnight: the box stays ✓, its hover says so, and the next
  message re-writes the cache and starts the pings again.
  `/keepwarm` or `/keepwarm on` (switch on, 24h), `90m` / `1h30m` (a one-off window), `always` (on for this and new
  conversations), `off` (off for this and new conversations, window stopped), `status` (time left, next ping, last ping).
  `/spendometer keepwarm [on | off | status | 90m | always]` does the same, and `/spendometer status` has a
  `keepwarm:` line.
  A ping that fails or finds the cache gone stops the window and says why.
  Before a send that would re-write a cold cache of 50,000 tokens or more, one line says what it will cost.
  With cache-tax installed spendometer stays passive (no pings, no button) and says so once: uninstall it with
  `claude plugin uninstall cache-tax@claude-code-mods`.
- **Hold for risky git commands.** When Claude runs `git reset --hard`, a `git checkout` or
  `git restore` that discards changes, a forced `git clean`, or a force push, through the Bash or
  PowerShell tool, spendometer holds the call and shows what it would lose (files, untracked paths,
  or the commits a force push would drop) with **Cancel** and **Proceed**.
- **Wrap up button** (off by default). Runs your `/debrief` command, writes the conversation's
  cost into the transcript for it to quote, and then stops keeping this conversation's cache
  warm while leaving the switch on for the next one.
- **A `progress` tool** Claude can call to report steps on a request it keeps no task list for.

## Requirements

- Claude Code 2.1.287 or later (mods load by default from that version).
- `git` on your `PATH`, for the hold.
- Optional: a `/debrief` command or skill for the Wrap up button. Without it that button does not appear.
  Keep warm is built in. Uninstall cache-tax (`claude plugin uninstall cache-tax@claude-code-mods`): installed, it
  pings too, and spendometer stays passive.

Built and used on Windows 11 in the Claude desktop app, in dark and light themes. See
[Limitations](#limitations) for what that means elsewhere.

## Other ways to install

From a local clone:

```bash
git clone https://github.com/spaldinga/spendometer.git
claude plugin marketplace add ./spendometer
claude plugin install spendometer@spendometer --scope user
```

If you have the original `ribbon` mod installed, uninstall it first: both draw the same band.

Remove it with `/plugin uninstall spendometer@spendometer`.

## Settings

```
/spendometer fold           open or close the cache card from the keyboard
/spendometer cost           print this conversation's cost (Wrap up runs it for the debrief)
/spendometer progress       list the progress row themes (comet, calm, vitals, bridge, wake, dial)
/spendometer progress dial  draw the progress row as dials (default: comet; also calm, vitals, bridge, wake)
/spendometer wrapup on      show the Wrap up button (default: off)
/spendometer hold off       stop holding risky git commands (default: on)
/spendometer                show the settings and the width the band was drawn at
```

The Keep warm checkbox is in the band, saved per conversation (on until unticked; a typed `/keepwarm always|off` sets the default for new conversations). Other settings are saved for every session.

## How it works

- **No model calls.** Everything is read from events Claude Code already raises: rate limits,
  turn and subagent events, tool calls. The exceptions are yours to trigger: the Keep warm checkbox
  (its pings cost a few cents each) and Wrap up (runs your debrief).
- **Progress without tokens.** The bar follows the task-list tool calls Claude makes
  (`TodoWrite`, the Task tools, the desktop app's plan). The text bar counts a step in progress as half; the drawn bar
  pulses the step in progress and turns it solid when it lands.
- **Cost is an estimate, not a bill.** Each finished turn's tokens are priced from a built-in
  list-price table (input, output, cache reads, cache writes at the 1-hour rate) and kept per
  session, so the total survives a restart.
- **The hold reads the command's text and asks only git.** Every measurement is a git command
  with paths passed as arguments, never through a shell. Cancel, no answer in ten minutes, or an
  interrupted turn refuse the command and tell Claude why. If the hold itself fails, the command
  runs as usual with a note in the transcript: it is a second look, not a lock.

## Limitations

- **Light and dark themes.** The band's text uses the app's own text colours, so it follows the theme.
  The drawings (the card, Robo, the chip, the progress line) are painted in the dark palette and carry a
  light-scheme override, so they follow the system's light/dark setting, not the app's theme setting. That
  the app passes the system setting on to a drawing is a hypothesis until it is checked in the app; if it
  does not, the drawings stay dark.
- **The hold is not a permission system.** It does not see commands inside `bash -c "..."`,
  scripts or aliases, and it only knows the git commands listed above. Use
  [permission rules](https://code.claude.com/docs/en/settings) for a hard block.
- **The cache state is a clock, not a server check.** It assumes a one-hour cache lifetime.
- **Prices are a table in the code** (`hooks/cache-art.ts`) and go stale when list prices change.
  A model the table does not know adds nothing to the cost.
- **Only one mod can draw the band.** spendometer takes the whole band above the prompt, so another
  mod that draws there will not show.
- **The `progress` tool is always listed**, which adds its short description to every request.
- **On managed (Team/Enterprise) installs**, some session events never reach user-installed mods.
  spendometer is built around that, but a resumed conversation shows no cache state until its first
  reply.
- Tested by its own test suite and by daily use on one Windows machine. The terminal layout and
  macOS/Linux are covered by tests only.

## Develop

```bash
claude plugin test .       # the test suite; no login needed
claude plugin validate .   # manifest and hook checks
claude --plugin-dir .      # try it for one session
```

```
hooks/
  register.tsx       hooks and the band
  cache-art.ts       colours (dark and light), prices, the cache card and the robot
  metrics.ts         the card's metric row: hit rate, runway, outlier (pure)
  progress.ts        task list and report tracking (pure)
  progress-art.ts    the calm progress line, the sweep and the subagent dots
  progress-themes.ts the progress styles: comet, calm, vitals, bridge, wake, dial
  pace.ts            each usage window's pace against its reset (pure)
  days.ts            spend per day across sessions (pure)
  layout.ts          which layout fits the band (pure)
  guard.ts           risky git commands: classify and measure
  font.ts            Outfit, embedded so the drawings render anywhere
tests/               one file per area
types/index.d.ts     the mod's state
```

`AGENTS.md` has the working notes for coding agents.

## Credits

spendometer is a fork of [ribbon](https://github.com/robonuggets/ribbon) by Jay E (RoboNuggets),
which provides the usage bars, the cache card and Robo, the robot. Ideas and behaviour also come
from:

- [cache-tax](https://github.com/karanb192/cache-tax) by Karan Bansal: keep-warm. spendometer's pinger in
  `hooks/keepwarm.ts` is ported from it (MIT, see the table below), so cache-tax is no longer needed.
- [savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress) by
  JohnnyVizz: the idea of a progress bar and a subagent display above the prompt.
- [Blast Radius](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/blast-radius)
  by Anthropic: holding a risky command and showing what it would change. spendometer's git
  measurements follow it.

## License

MIT, see [LICENSE](LICENSE). Copyright (c) 2026 Jay E | RoboNuggets for the original ribbon;
Copyright (c) 2026 Alexander Spalding for the changes in this fork, under the same licence.

Third-party material:

| What | From | Licence |
|---|---|---|
| The band, usage bars, cache card, Robo and their tests | [ribbon](https://github.com/robonuggets/ribbon), Copyright (c) 2026 Jay E \| RoboNuggets | MIT, in [LICENSE](LICENSE) |
| Parts of `hooks/guard.ts`: how risky git commands are measured and reported | [Blast Radius](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods/blast-radius), Copyright 2026 Anthropic PBC | Apache-2.0, in [LICENSES/Apache-2.0.txt](LICENSES/Apache-2.0.txt); the changes are listed at the top of the file |
| The keep-warm pinger in `hooks/keepwarm.ts`: its timing, retries and race handling, and the rule for "a ping kept the cache warm" | [cache-tax](https://github.com/karanb192/cache-tax), Copyright (c) 2026 Karan Bansal | MIT |
| The embedded font | [Outfit](https://github.com/Outfitio/Outfit-Fonts) | SIL Open Font License 1.1 |

[savvy-progress](https://github.com/JohnnyVizz/claude-kit/tree/main/plugins/savvy-progress)
(MIT, Copyright (c) 2026 johnnyvizz) inspired the progress bar and the subagent display; no code
from it is included.

Not affiliated with Anthropic or with the projects credited above.
