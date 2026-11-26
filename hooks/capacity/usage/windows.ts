// The usage windows (5h and 7D) the band holds: the atom, tidying the engine's list, the pace rows the card draws,
// and reading the windows from the engine. A hook's `$` is followed past an import only into function declarations.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Window } from '../../../types'
import { ORANGE, YELLOW } from '../../band/look'
import { WINDOW_MS, paceOf } from './pace'
import type { PaceRow } from './art'

// Copies of the band's names and colours for a window kind (register.tsx keeps its own): a domain imports nothing
// from the band's files.
const NAMES: Record<string, string> = { seven_day: '7D', five_hour: '5H', spend_limit: 'SPEND' }
const COLORS: Record<string, string> = { seven_day: ORANGE, five_hour: YELLOW }

const windows = atom({ plugin: 'spendometer', key: 'windows' } as const, [] as Window[])

/** The 5-hour window first, as /usage lists it: it is the one that runs out within a working session. */
const ORDER: Record<string, number> = { five_hour: 0, seven_day: 1 }
const clean = (list: readonly Window[]): Window[] =>
  list
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    .sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))

/** The rows the card draws: each window with a colour, its time to reset and its pace over the window so far. */
export const trackPace = (list: readonly Window[], now: number): PaceRow[] => {
  const rows: PaceRow[] = []
  for (const w of list) {
    if (!COLORS[w.kind]) continue
    rows.push({
      label: NAMES[w.kind],
      color: COLORS[w.kind],
      used: w.percentUsed,
      windowMs: WINDOW_MS[w.kind] ?? null,
      untilResetMs: w.resetsAt ? Date.parse(w.resetsAt) - now : null,
      pace: WINDOW_MS[w.kind] ? paceOf(w, WINDOW_MS[w.kind], now) : null,
    })
  }
  return rows
}
/** The pace of the 5-hour window only: the top row shows no pace for 7D. Null while it is unknown. */
export const paceFor = (w: Window, now: number) => (w.kind === 'five_hour' ? paceOf(w, WINDOW_MS.five_hour, now) : null)

export async function pull($: EngineInterface): Promise<void> {
  const u = await $.session.usage()
  await update($, windows, () => clean(u.rateLimits))
}

/** The usage windows straight from the engine, or none when it cannot say. */
export async function liveWindows($: EngineInterface): Promise<Window[]> {
  try {
    return clean((await $.session.usage()).rateLimits)
  } catch {
    return []
  }
}

/** Keeps the engine's windows, tidied, in the atom. */
export async function setWindows($: EngineInterface, list: readonly Window[]): Promise<void> {
  await update($, windows, () => clean(list))
}

/** The windows the atom holds: empty until a reading lands. */
export async function keptWindows($: EngineInterface): Promise<Window[]> {
  return read($, windows)
}
