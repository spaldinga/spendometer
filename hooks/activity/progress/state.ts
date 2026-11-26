// The request's progress as the band keeps it: the `progress` atom and the `turn` atom (the turn's clock), and the few
// ways the hooks change them. Written as function declarations: a hook's `$` is followed past an import only into those.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Progress, Turn } from '../../../types'
import { afterListCall, afterReport } from './progress'

const progress = atom({ plugin: 'spendometer', key: 'progress' } as const, null as Progress | null)
/** The main thread's turn in flight: when its first request started and how many requests it has made. */
const turn = atom({ plugin: 'spendometer', key: 'turn' } as const, null as Turn | null)

/** The progress as kept, or null before there is any. */
export async function readProgress($: EngineInterface): Promise<Progress | null> {
  return read($, progress)
}

/** A call of a task-list tool, read into the progress. */
export async function noteListCall($: EngineInterface, tool: string, e: Record<string, unknown>): Promise<void> {
  await update($, progress, p => afterListCall(p, tool, e))
}

/** The model's own report through this mod's `progress` tool; returns the progress it left. */
export async function noteReport($: EngineInterface, e: Record<string, unknown>): Promise<Progress | null> {
  return update($, progress, prev => afterReport(prev, e))
}

/** A list finished last turn has had its moment: dropped when a new turn starts. */
export async function dropFinished($: EngineInterface): Promise<void> {
  await update($, progress, p => (p && p.isFinished ? null : p))
}

/** The turn in flight as kept, or null before there is one. */
export async function readTurn($: EngineInterface): Promise<Turn | null> {
  return read($, turn)
}

/** A turn's first request starts its clock. */
export async function startTurn($: EngineInterface, now: number): Promise<void> {
  await update($, turn, () => ({ startedAt: now, steps: 1 }))
}

/** A later request of the turn. One the band never saw start still gets a clock. */
export async function countStep($: EngineInterface, now: number): Promise<void> {
  await update($, turn, t => (t ? { ...t, steps: t.steps + 1 } : { startedAt: now, steps: 1 }))
}
