// The subagents at work: the `crew` atom, what the hooks do to it, and the words the band shows for it. Written as
// function declarations: a hook's `$` is followed past an import only into those.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Worker } from '../../types'

const crew = atom({ plugin: 'spendometer', key: 'crew' } as const, [] as Worker[])

export const CREW_MAX = 40
export const CREW_SHOWN = 5

/** The running subagents as the band names them: "Explore 4, sonnet-coder 12", kind and requests made. */
export const crewText = (running: Worker[]): string => {
  const s = running.map(w => `${w.type} ${w.steps}`).join(', ')
  return s.length > CREW_MAX ? s.slice(0, CREW_MAX - 1) + '…' : s
}

/** The subagents still working. */
export async function runningCrew($: EngineInterface): Promise<Worker[]> {
  return (await read($, crew)).filter(w => !w.isDone)
}

/** A new turn: the subagents that finished are dropped. */
export async function dropDoneCrew($: EngineInterface): Promise<void> {
  await update($, crew, list => list.filter(w => !w.isDone))
}

/** A subagent's request. One the band never saw start still gets a place. */
export async function noteCrewStep($: EngineInterface, id: string): Promise<void> {
  await update($, crew, list =>
    list.some(w => w.id === id)
      ? list.map(w => (w.id === id ? { ...w, steps: w.steps + 1, isDone: false } : w))
      : [...list, { id, type: 'agent', steps: 1, isDone: false }].slice(-50),
  )
}

/** A subagent starts. */
export async function addCrew($: EngineInterface, id: string, type: string, startedAt: number): Promise<void> {
  await update($, crew, list => [...list.filter(w => w.id !== id), { id, type, steps: 0, isDone: false, startedAt }].slice(-50))
}

/**
 * A subagent's turn ends: it is marked done, and when it cost something its run interval is kept. The interval is
 * from the spawn to this turn's end; a subagent the band never saw start is dated by the turn's length.
 * Returns what the spend record needs: its type, the interval and the end of its previous interval.
 */
export async function finishCrew(
  $: EngineInterface,
  id: string,
  paid: number,
  durationMs: unknown,
): Promise<{ type: string; start: number; end: number; prevEnd: number | undefined }> {
  const worker = (await read($, crew)).find(w => w.id === id)
  const type = worker?.type ?? 'agent'
  const end = await $.clock.now()
  const start = worker?.startedAt ?? Math.max(0, end - (typeof durationMs === 'number' ? durationMs : 0))
  await update($, crew, list => list.map(w => (w.id === id ? { ...w, isDone: true, ...(paid > 0 ? { startedAt: start, endedAt: end } : {}) } : w)))
  return { type, start, end, prevEnd: worker?.endedAt }
}
