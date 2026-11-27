---
type: backlog
project: spendometer
order: 140
kind: feature
size: M
status: doing
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

Built and committed 2026-11-26; not yet checked in the app.

### Check in the app
After `/reload-plugins --force`, start a turn that runs two or more subagents:
- The crew on the progress row shows each subagent's name as a dim button (`Explore 3`), at most five, with `+N` for
  the rest; the row still fits at narrow widths (each button's frame is counted as 4 columns; it may be generous).
- Clicking a name opens a pane beside the chat titled `<type> · output`: the header `<type> · running`, the prompt as
  `▸ …`, then its text and `→ Tool arg` lines, growing as it works.
- When the subagent finishes, the header says `done` and the final output stays.
- With more than one subagent seen, the pane has a row of their names; clicking one switches the pane to it,
  finished ones included.
- Closing the pane stops the reading; clicking a name again opens it.
- After `/clear` the pane's list is empty.
- To open a finished subagent with the pane closed: `/spendometer output` opens the latest subagent, and
  `/spendometer output explore` the newest whose name contains "explore"; the header says `done` and the final output
  shows. With none, it answers "no subagent in this conversation yet".

## Done when
In the app, clicking a running subagent opens a pane that shows its output as it grows; clicking a finished one shows
its final output.

## Open
Assumptions taken while building (2026-11-26), to be confirmed in the app:
- **A pane beside the chat, not a card tab.** The host offers panes (`$.ui.open` with a `ui.render` hook on `Pane`),
  drawn with text, scrolling and placed at any width when a press opens them. The card is one SVG
  ([ADR 0003](../adr/0003-card-is-one-svg.md)) sized to the band: wrong for growing text. The host also has
  `$.ui.view({ agentId })`, which swaps the main view to the agent's transcript; not used, as it takes over the
  prompt and hides the main conversation.
- **How much output:** the newest 200 lines, each cut to 300 characters; tool results are left out, tool uses are one
  line. The host refuses `last` on `$.session.messages` from a mod, so the whole transcript is read and cut here.
  It is read only for the watched agent, after each of its steps and when it finishes, and the pane's state is
  written only when its lines changed.
- **How long a finished subagent stays clickable:** the band's crew shows running ones only (as before); the pane's
  switch row keeps the last 6 subagents of the conversation until `/clear`.
- **Workflow agents:** the host's types say `$.session.messages({ agentId })` does not read "an agent a workflow run
  filed under the run". Such an agent shows "This agent's output can't be read here: <reason>". Not verified live.
- If the host denies the read after an agent finishes, the lines read while it ran stay.
- Not tested: the `ui.close` hook (the test kit has no `$.ui.close`), and the crew buttons' real width.

## Review (2026-11-27, read-only reviewer, before the app check)
Host calls match how other mods use `$.ui.open`, the `Pane` render and `ui.close`; `$.session.messages` is used by no
other mod on disk, so its shape is unverified. Width accounting looks consistent. 502 tests pass.

Findings, most severe first (to weigh at the app review):
1. **Medium.** A finished subagent cannot be opened once the pane is closed: the band has buttons for running
   subagents only, the pane's switch row exists only while it is open, and no command opens it. This breaks "Done when:
   clicking a finished one shows its final output".
2. Medium, plausible. The idle pane re-renders on the 30 s tick and on every band redraw and crew step, against "an
   idle pane costs nothing". The transcript read itself is correctly gated on the watched agent.
3. Medium, plausible. Switching agents can be overwritten by a slower read of the previous one (`state.ts`, `watched`
   is checked before the await, not after), leaving the new agent at "No output yet."
4. Medium, plausible. One message without `text` makes `outputLines` throw, and the pane stays empty for that agent.
5. Low, plausible. `ui.close` is not filtered to the person's own close (other mods check `e.origin.kind === 'person'`);
   if the host closes on re-open, the watched agent is lost.
6. Low. An agent no longer in the last 6 shows `done` in its header as a guess.
7. Low. README not updated (see item 110's review).

Fixed 2026-11-27:
1. **Finished subagent cannot be opened:** `/spendometer output [agent]` opens the pane on the newest recent subagent,
   or the newest whose id or type contains the text, finished ones included (`openRecent` in `output/state.ts`).
   Chosen over keeping finished buttons in the band: no change to the band's width accounting, and the pane's list
   (last 6, until `/clear`) already holds them.
2. **Idle pane redraws:** the host calls the render on every band redraw and gives no way to skip it. The render only
   reads three atoms and the crew; a test shows drawing the pane reads no transcript. No memoising built.
3. **Stale read on switch:** `refreshOutput` re-reads `watched` after the `await $.session.messages(...)` and drops
   an answer for an agent that is no longer watched (test with a held read).
4. **Message without `text` or `toolUses`:** `outputLines` treats a missing one as empty, so the rest still shows.
5. **`ui.close`:** acts only when `origin` is missing or `origin.kind === 'person'`. Not tested: the test kit has no
   `ui.close` to fire.
6-7. Not in the brief; left open.
