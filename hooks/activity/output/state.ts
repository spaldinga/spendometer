// The subagent output pane's state: which agent is watched, the lines it has said, and the agents seen lately. The
// pane redraws when an atom changes, so the output is written only when it differs from what is stored. Written as
// function declarations: a hook's `$` is followed past an import only into those.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { AgentOut, Recent, Watched } from '../../../types'
import { outputLines } from './lines'

/** The pane's id, and what `ui.render` and `ui.close` name it by. */
export const OUTPUT_PANE = 'spendometer-output'
/** How many recent agents the pane's switch row lists. */
const RECENT_KEEP = 6

const watched = atom({ plugin: 'spendometer', key: 'watched' } as const, null as Watched | null)
const agentOut = atom({ plugin: 'spendometer', key: 'agentOut' } as const, null as AgentOut | null)
const recentCrew = atom({ plugin: 'spendometer', key: 'recentCrew' } as const, [] as Recent[])

const same = (a: AgentOut | null, b: AgentOut): boolean =>
  !!a && a.id === b.id && a.denied === b.denied && a.lines.length === b.lines.length && a.lines.every((l, i) => l === b.lines[i])

/** Reads the watched agent's messages into `agentOut`; writes only when they changed. Never throws. */
export async function refreshOutput($: EngineInterface, agentId: string): Promise<void> {
  try {
    const w = await read($, watched)
    if (!w || w.id !== agentId) return
    // The whole read: a mod's call takes no `last`; outputLines keeps the newest lines.
    const got = await $.session.messages({ agentId })
    const has = await read($, agentOut)
    let next: AgentOut
    if (Array.isArray(got)) next = { id: agentId, lines: outputLines(got) }
    else if (has && has.id === agentId && has.lines.length > 0) return // finished and no longer readable: what was kept stays
    else next = { id: agentId, lines: [], denied: got.deny }
    if (!same(has, next)) await update($, agentOut, () => next)
  } catch { /* the pane keeps what it shows */ }
}

/** Watches an agent: its pane opens (or is retitled) and fills. */
export async function openOutput($: EngineInterface, id: string, type: string): Promise<void> {
  await update($, watched, () => ({ id, type }))
  await $.ui.open({ id: OUTPUT_PANE, title: `${type} · output` })
  await refreshOutput($, id)
}

/** An agent seen: listed for the pane's switch row (the last RECENT_KEEP, newest last); its place stays when it finishes. */
export async function noteRecent($: EngineInterface, id: string, type: string, isDone: boolean): Promise<void> {
  await update($, recentCrew, list =>
    (list.some(r => r.id === id) ? list.map(r => (r.id === id ? { ...r, isDone } : r)) : [...list, { id, type, isDone }]).slice(-RECENT_KEEP),
  )
}

/** The pane was closed: nothing is watched, so nothing is read. */
export async function closedOutput($: EngineInterface): Promise<void> {
  await update($, watched, () => null)
}

/** A new conversation: the pane's state is forgotten. */
export async function resetOutput($: EngineInterface): Promise<void> {
  await update($, watched, () => null)
  await update($, agentOut, () => null)
  await update($, recentCrew, () => [])
}

/** What the pane draws from: the watched agent, its output (null before the first read) and the recent agents. */
export async function outputView($: EngineInterface): Promise<{ w: Watched | null; out: AgentOut | null; recent: Recent[] }> {
  return { w: await read($, watched), out: await read($, agentOut), recent: await read($, recentCrew) }
}
