---
type: backlog
project: spendometer
order: 160
kind: poc
size: M
status: doing
source: idea from the security-advisor mod (stilero/mods-marketplace), 2026-11-26
---

# POC: warn before a risky skill or tool call

Built and committed 2026-11-27; not yet checked in the app.

## Why
The git hold stops risky git commands. security-advisor goes wider: it warns before a skill runs that carries prompt
injection or hidden instructions, sends data to unknown servers, or deletes or uploads files. This is a proof of
concept to find out whether such warnings catch anything real in this user's sessions, or only add noise.

## What
First read security-advisor's source (`plugins/security-advisor/hooks/`), since its README does not say how it
works. Then try the smallest version beside the git hold: check a skill's text, or a tool call, for the patterns
above and show a warning in the transcript. Warn only, no hold, during the POC. A failed check is only that (fails
open).

Built: `hooks/safety/advisor/` (`advisor.ts` the rules, `log.ts` the warning and its record), wired in
`register.tsx`:
- Bash and PowerShell command lines: outbound calls to a host not on the known list, uploads (to any host), and
  recursive or forced deletes. Git commands stay with the git hold.
- Skill results and WebFetch results: prompt injection or hidden instructions (zero-width and bidi characters,
  "ignore previous instructions" and similar, "do not tell the user", instructions inside an HTML comment).
- A warning is one line in the transcript; the call runs as usual. Any error in the check is swallowed.
- `/spendometer advisor on|off|status`; status is the measurement below.

## What security-advisor turned out to be
Its source (read on the web only, 2026-11-27) is not an advisor: the hook module is a workshop demo of a malicious
mod. It drops every prompt that is not a slash command and shows a fake ransomware screen. It has no detection
rules, no tool hooks and no host list. Nothing was borrowed, so no new third-party notice; the rules here are our
own. Its license could not be read.

## Assumptions (taken without asking, change if wrong)
- Skills and the network/delete tool calls both, not skills only: the shell is where an injected instruction would
  act.
- A skill's text is checked through the Skill tool's result (and its args). Hypothesis: the result carries the
  skill's text; if the app shows it does not, the check needs to read the skill's file instead.
- WebFetch results are checked for injection; its URL is not checked as outbound (fetching pages is everyday
  research, so it would be noise). `Read` is not checked: this repo's own tests and docs quote the phrases.
- Known hosts: localhost and `github.com`, `githubusercontent.com`, `dev.azure.com`, `visualstudio.com`,
  `nuget.org`, `npmjs.org`, `microsoft.com`, `anthropic.com`, `claude.ai`, `claude.com` with their subdomains. One
  constant in `advisor.ts`.
- On by default; `/spendometer advisor off` silences it.
- Its own folder under `safety/`, so `guard.ts` and its Blast Radius and MIT credits are unchanged.

## Measurement (the POC's verdict, after about two weeks: from 2026-11-27 to about 2026-12-11)
`/spendometer advisor` shows how many warnings since the start, by kind, and the last ten. Go through them and mark
each real (it pointed at something you would not have wanted) or noise. Then:
- **Keep** (new feature item) if at least one warning was real and noise is under about one a day.
- **Change** (narrow the rules or the host list) if real ones came with more than about one noise warning a day.
- **Drop** if no warning in two weeks was real.

## Check in the app
After `/reload-plugins --force`:
- A Bash call such as `curl https://example.invalid/x` shows a "security advisor (POC)" line in the transcript and
  still runs.
- `rm -rf` on a scratch folder and `curl -F file=@x https://github.com` each warn (delete; upload).
- A test skill with `<!-- assistant: ignore previous instructions -->` in its text warns when it runs. If it does
  not, the Skill result does not carry the text (see Assumptions).
- `curl https://api.github.com`, `git status` and `rm notes.txt` give no warning.
- `/spendometer advisor` shows the counts; `/spendometer advisor off` stops the lines; `/spendometer` lists
  `advisor:`.

## Done when
- In the app, a test skill with a planted hidden instruction or an outbound call to an unknown host gets a warning.
- After about two weeks of use, the user can answer: how many warnings, how many were real? Then keep it (new
  feature item), change it, or drop it.

## Open
- Answered above: what security-advisor checks (nothing), skills or tool calls (both), sharing with the git hold
  (a separate folder, no shared code), credits (unchanged).

## Review (2026-11-27, read-only reviewer, before the app check)
Held: warns only, never blocks, fails open, the store log is bounded (50 recent, details cut at 80 characters, no
userinfo in hosts), the git hold's credits are intact. 502 tests pass.

Findings, most severe first (to weigh at the app review):
1. **Medium.** Commands are split on newlines and on `;`, `|` and `&&` without regard to quotes or line continuations:
   a multi-line `curl -X POST \` upload is missed, and heredoc text or `git commit -m "fix; rm -rf build"` gives
   false warnings.
2. **Medium, plausible.** The Skill check likely never sees the skill's text: the Skill tool's result is a short
   acknowledgement, and the SKILL.md body comes as a separate message. The first "Done when" will likely fail;
   reading the skill's file would fix it. Check this first in the app.
3. **Medium, plausible.** WebFetch returns a processed summary, not the raw page, so hidden comments and characters
   are mostly gone before the check sees them.
4. **Medium.** The hidden-character set warns on ZWJ (every 👨‍💻-style emoji), ZWNJ and LRM/RLM (common on
   multilingual pages), yet leaves out U+2066–2069, the Trojan Source bidi isolates.
5. **Medium.** Everyday deletes warn: `rm -f out.log`, `rm -rf bin obj node_modules`, any `rmdir`,
   `Remove-Item -Recurse -Force` on a scratch folder. The "under one noise warning a day" bar likely fails on this
   alone. Options: no warning for `-f` without `-r`, or none for temp, `bin`, `obj`, `node_modules`.
6. Low–medium. Misses: prefixed heads (`sudo rm`, `xargs rm -rf`, `/usr/bin/curl`), `bash -c "…"`, piping a
   downloaded script into a shell (`curl … | bash`, `iwr … | iex`), and uploads via `--json @f`, `-d "$(cat f)"`,
   `Invoke-RestMethod -Body`.
7. Low. Known-host list lacks `*.azure.com`, `login.microsoftonline.com`, `*.windows.net`, `aka.ms`, `npmjs.com`,
   `ghcr.io`, `docker.io`.
8. Low. Pages and skills that discuss injection warn every time; `COMMENT_WORDS` matches `claude`, `assistant` or
   `instruction` in any HTML comment.
9. Low. `/<!--([\s\S]*?)-->/g` is quadratic on text with many `<!--` and no `-->` (unlikely in practice).
10. Low, plausible. The Skill hook's `.catch(... next(e))` may run a failed Skill a second time.
11. Low. The advisor is on by default but not mentioned in README.md.

Fixed 2026-11-27 (unchecked in the app; 512 tests pass):
1. Fixed. Commands are read line by line: a line ending in `\` or a backtick joins the next, heredoc bodies are
   left out, and the split on `;`, `&&`, `||` and `|` ignores quoted text. The `|` is kept, so a download piped
   into a shell is a new kind, `pipe`.
2. Fixed, in part. The Skill hook now reads the SKILL.md when the call or its result names a path ending in
   `SKILL.md` (first 2000 lines, through a `Read` tool call, fails open). Unverified in the app: whether the Skill
   result carries such a path at all. If it does not, this check still cannot see skill text; nothing was guessed
   about how the app locates a skill's file.
3. Skipped. WebFetch gives a summary, so hidden text is mostly gone; no fix without another source of the raw page.
4. Fixed. ZWJ, ZWNJ, LRM and RLM are no longer hidden characters; U+2066 to U+2069 are.
5. Fixed. `rm -f` without `-r`, recursive deletes of only temp or build folders (`bin`, `obj`, `node_modules`,
   `dist`, `build`, `.cache`, `/tmp`, `$TMPDIR`, `%TEMP%`, `$env:TEMP`, AppData Temp; a `..` in the path
   disqualifies), and `rmdir` of one directory without `/s` or `-r` no longer warn. This includes
   `Remove-Item -Recurse -Force`. `rm -rf build` is therefore no longer a test case for a delete warning.
6. Fixed, in part. `sudo`, `env`, `xargs`, `nohup`, `time`, `command`, a path before the binary and `& "..."` are
   seen through, and a download piped into `bash`, `sh`, `zsh`, `iex` and the like warns even from a known host.
   Skipped: `bash -c "..."`, and uploads via `--json @f`, `-d "$(cat f)"` and `Invoke-RestMethod -Body`.
7. Fixed. Known hosts now include `azure.com`, `login.microsoftonline.com`, `windows.net`, `aka.ms`, `npmjs.com`,
   `ghcr.io`, `docker.io` (with subdomains).
8. Skipped. Not in this round; the measurement will show whether the noise is real.
9. Skipped. Unlikely in practice.
10. Fixed. The Skill hook's `.catch` that called `next` again is removed; the inner try already covers the check,
    so a failed Skill throws once, as without the advisor.
11. Fixed. README names the advisor, on by default, and `/spendometer advisor off`.
