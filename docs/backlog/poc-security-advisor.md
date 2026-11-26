---
type: backlog
project: spendometer
order: 160
kind: poc
size: M
status: todo
source: idea from the security-advisor mod (stilero/mods-marketplace), 2026-11-26
---

# POC: warn before a risky skill or tool call

## Why
The git hold stops risky git commands. security-advisor goes wider: it warns before a skill runs that carries prompt
injection or hidden instructions, sends data to unknown servers, or deletes or uploads files. This is a proof of
concept to find out whether such warnings catch anything real in this user's sessions, or only add noise.

## What
First read security-advisor's source (`plugins/security-advisor/hooks/`), since its README does not say how it
works. Then try the smallest version beside the git hold in `hooks/guard.ts`: check a skill's text, or a tool call,
for the patterns above and show a warning in the transcript. Warn only, no hold, during the POC. A failed check is
only that (fails open).

## Done when
- In the app, a test skill with a planted hidden instruction or an outbound call to an unknown host gets a warning.
- After about two weeks of use, the user can answer: how many warnings, how many were real? Then keep it (new
  feature item), change it, or drop it.

## Open
- What does security-advisor actually check, and with which hooks? (Read its source first.)
- Warn on skills only, or on every tool call that reaches the network or deletes files?
- How does it share rules and wording with the git hold without making `guard.ts` larger?
- Keep the Blast Radius credit and any new third-party notice in `guard.ts` if code is borrowed.
