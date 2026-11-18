// How fast a usage window is being used up, from samples kept in the store. Pure: the band reads
// and writes the store, this decides what a sample means.

/** Where a window's own record lives in the store, one per window kind, for the whole account: `pace:five_hour`. */
export const PACE_PREFIX = 'pace:'
/** Under this long since the first sample the rate is too noisy to show. */
export const PACE_MIN_MS = 10 * 60 * 1000

/** The first reading seen of a window: when it resets (names the window), the share used then, and the time. */
export type PaceSample = { resetsAt: string; used0: number; at0: number }
/** A window as the band holds it. */
export type PaceWindow = { percentUsed: number; resetsAt?: string }
/** When the window runs out at the pace so far, against when it resets; `ok` when it lasts until the reset. */
export type Pace = { lastsMs: number; untilResetMs: number; ok: boolean }

/**
 * The sample to keep after seeing `w` at `now`: the old one while it is still this window, a new one for a
 * new window (the reset time differs) or when the share used fell. Null when the window has no reset time to
 * name it by. The same object comes back when nothing changed, so the caller writes only on a difference.
 */
export const nextSample = (prev: PaceSample | null | undefined, w: PaceWindow, now: number): PaceSample | null => {
  if (!w.resetsAt) return null
  if (prev && prev.resetsAt === w.resetsAt && w.percentUsed >= prev.used0) return prev
  return { resetsAt: w.resetsAt, used0: w.percentUsed, at0: now }
}

/** The pace of a window, or null while it is unknown: no sample for this window, under 10 minutes, or no growth. */
export const paceOf = (sample: PaceSample | null | undefined, w: PaceWindow, now: number): Pace | null => {
  if (!sample || !w.resetsAt || sample.resetsAt !== w.resetsAt) return null
  const elapsed = now - sample.at0
  if (!(elapsed >= PACE_MIN_MS) || !(w.percentUsed > sample.used0)) return null
  const untilResetMs = Date.parse(w.resetsAt) - now
  if (Number.isNaN(untilResetMs) || untilResetMs <= 0) return null
  const rate = (w.percentUsed - sample.used0) / elapsed
  const lastsMs = Math.max(0, 100 - w.percentUsed) / rate
  return { lastsMs, untilResetMs, ok: lastsMs >= untilResetMs }
}

/** Whether a stored value is a sample worth trusting. */
export const asSample = (v: unknown): PaceSample | null => {
  const s = v as Partial<PaceSample> | null | undefined
  return s && typeof s.resetsAt === 'string' && typeof s.used0 === 'number' && typeof s.at0 === 'number'
    ? { resetsAt: s.resetsAt, used0: s.used0, at0: s.at0 }
    : null
}
