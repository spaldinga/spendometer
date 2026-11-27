# spendometer: working notes for agents

A Claude Code mod: a band above the prompt. A fork of `robonuggets/ribbon` (MIT), installed locally as
`spendometer@spendometer` from a folder marketplace, so the app reads the files in this repo directly. It
keeps the prompt cache warm itself (`hooks/cost/cache/keepwarm/`, ported from cache-tax; it stays passive when cache-tax is
installed) and adds a progress bar, subagent display, session cost and a hold for risky git commands.

## Read first

- [`docs/architecture.md`](docs/architecture.md): how the mod fits together, which file does what, where state lives.
  Update it in the same commit when a change moves a responsibility.
- [`docs/adr/`](docs/adr/): why it is built this way. Check before undoing a decision; a new decision worth keeping
  gets a new ADR.
- [`docs/backlog/`](docs/backlog/): what is next, one file per item. Work on one item per thread; set its
  `status: done` (file and table) in the commit that finishes it. New ideas become new items, not scope creep.
  Before building an item, restate its purpose in two or three lines and check that it has Why, What, Done when
  and Open. If it does not, or the user's view of it differs, refine it with the user first.
- [`docs/plans/`](docs/plans/): plans for larger changes.

The repo is public: nothing internal (work paths, host names, people's names) goes into `docs/`.

## Branches

- **`dev`** is where work goes. Commit there and push `dev` (`git push origin dev`) once the tests pass.
- **`main`** is what people install from GitHub. It only moves when the user says the change works as
  expected in the app: then fast-forward it to `dev` without leaving `dev`
  (`git fetch . dev:main && git push origin main`). This refuses anything but a fast-forward and works
  with uncommitted files, which `git switch main` does not. Never commit straight to `main`, and never
  push `main` on your own judgement.
- The app runs whatever branch is checked out here (the plugin is installed from this folder), so keep
  `dev` checked out while working.
- At the start of a session, if `git status` shows changes this session did not make, name them and ask
  the user to keep, commit or discard them before starting work. Don't leave work in progress
  uncommitted without saying so.

## Dev loop

1. Change code in `hooks/`, tests in `tests/`. Write the test first.
2. `claude plugin test .` (no login needed) and `claude plugin validate .`
3. To see it in the app: ask the user to run `/reload-plugins --force` in the open session; fall
   back to restarting the app. Confirmed in the desktop app on 2026-11-17: without `--force` the
   changes were not picked up.
4. Ship one visible change at a time, so each is seen in the app before the next is built.

A reload re-runs `register`: `$.state` and `$.store` keep their values; module variables and
timers are lost.

## Machine gotchas (Windows, this user)

- "Failed to start server. Is port 9220 in use?" from test or validate means the shell has
  `BUN_INSPECT` set. Prefix the command with `BUN_INSPECT=` in Git Bash.
- No Python and no Node. Edit with the editor tools, not scripts.
- The test kit has no `Bun` global and no `toBeCloseTo`, and refuses dynamic `import()`.
- Host type definitions are not on disk (`.claude-plugin/types/` is written only by a
  `claude --plugin-dir .` load, which needs the CLI logged in). The mod has never been type-checked;
  call shapes were taken from other mods' tests and probe tests.
- On this managed machine `classic.SessionStart` hooks are skipped for user-installed mods. Don't
  rely on that event; use `session.start`, `turn.step`, `turn.complete` and `$.store`.

## Conventions

- `on(...)` and `$.noun.method(...)` are spelled literally; helpers that take `$` are top-level
  functions. Code is grouped by domain (`cost/`, `capacity/`, `activity/`, `safety/`, plus `band/`;
  [ADR 0008](docs/adr/0008-code-by-domain.md)); a domain imports no other domain, and pure logic stays apart from `$`.
- Calls that drive Claude (`$.command.run`) are fired, never awaited, inside a hook.
- Anything that can stop the user's work (the git hold) fails open with a note in the transcript.
- Keep the upstream MIT notice and the Blast Radius (Apache-2.0) credit in `hooks/safety/guard/guard.ts`.
