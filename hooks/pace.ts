// How fast a usage window is being used up, from its own average since the window began. Pure: it
// needs no history, only the share used, the window's length and the time left.

/** Under this long into a window the rate is too noisy to show. */
export const PACE_MIN_MS = 10 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/** How long each usage window is; a kind not listed has no pace. */
export const WINDOW_MS: Record<string, number> = { five_hour: 5 * HOUR_MS, seven_day: 7 * 24 * HOUR_MS }

/** A window as the band holds it. */
export type PaceWindow = { percentUsed: number; resetsAt?: string }
/** When the window runs out at the pace so far, against when it resets; `ok` when it lasts until the reset. `atReset` is the whole percent used at the reset if the pace holds (used / share of the time gone). */
export type Pace = { lastsMs: number; untilResetMs: number; ok: boolean; atReset: number }

/**
 * The pace of a window over its whole length so far, or null while it is unknown: no reset time, a reset
 * that has passed or is further away than the window is long, under 10 minutes into the window, or nothing used.
 */
export const paceOf = (w: PaceWindow, windowMs: number, now: number): Pace | null => {
  if (!w.resetsAt) return null
  const untilResetMs = Date.parse(w.resetsAt) - now
  if (Number.isNaN(untilResetMs) || untilResetMs <= 0 || untilResetMs > windowMs) return null
  const elapsed = windowMs - untilResetMs
  if (!(elapsed >= PACE_MIN_MS) || !(w.percentUsed > 0)) return null
  const rate = w.percentUsed / elapsed
  const lastsMs = Math.max(0, 100 - w.percentUsed) / rate
  return { lastsMs, untilResetMs, ok: lastsMs >= untilResetMs, atReset: Math.round((w.percentUsed * windowMs) / elapsed) }
}
