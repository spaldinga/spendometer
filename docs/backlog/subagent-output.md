---
type: backlog
project: spendometer
order: 140
kind: feature
size: M
status: todo
source: idea from the agent-den mod (stilero/mods-marketplace), 2026-11-26
---

# Open a subagent's output from the band

## Why
The band shows which subagents are at work, but not what they are doing. To see a subagent's output you have to
wait for its report. agent-den shows that clicking a subagent can open its live output.

## What
Clicking a subagent in the crew display opens a pane with that subagent's messages (`$.session.messages({ agentId })`),
updated while it runs and kept for a while after it finishes. Redraw the pane only when its content changed, so an
idle pane costs nothing.

## Done when
In the app, clicking a running subagent opens a pane that shows its output as it grows; clicking a finished one shows
its final output.

## Open
- Pane beside the chat, or a tab in the card under the band?
- How much output to keep: the last N lines, or everything?
- How long a finished subagent stays clickable?
- Do workflow agents expose their messages the same way? (agent-den says their output is limited.)
