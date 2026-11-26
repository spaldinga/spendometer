// What the card's metric row reads from the cost record: cache hit rate, outliers, subagent types and models, delegation.
// Pure: the per-session record in, figures out.

import type { Spent } from '../../../types'

/** A turn this many times the average, over at least OUTLIER_TURNS turns, is flagged. */
export const OUTLIER_X = 3
export const OUTLIER_TURNS = 3

/** Share of input read from the cache (0 to 1), or null before any input is known. `inTok` counts fresh, cache-read and cache-written input. */
export const hitRate = (readTok: number | undefined, inTok: number | undefined): number | null =>
  inTok !== undefined && inTok > 0 ? Math.min(1, Math.max(0, (readTok ?? 0) / inTok)) : null

/** How many times the average the last turn cost, rounded, when it is an outlier; else null. */
export const outlierMultiple = (last: number, avg: number, turns: number): number | null =>
  turns >= OUTLIER_TURNS && avg > 0 && last >= OUTLIER_X * avg ? Math.round(last / avg) : null

/** The `n` subagent types that cost most, dearest first; types that cost nothing are left out. */
export const topTypes = (byType: Record<string, number> | undefined, n: number): [string, number][] =>
  Object.entries(byType ?? {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)

/** The sum of the intervals' lengths (ms): the agent work done. */
export const workMs = (spans: readonly (readonly [number, number])[]): number => spans.reduce((a, s) => a + Math.max(0, s[1] - s[0]), 0)

/** The length of the union of the intervals (ms): the time something was running. */
export const unionMs = (spans: readonly (readonly [number, number])[]): number => {
  const s = spans.filter(x => x[1] > x[0]).map(x => [x[0], x[1]] as [number, number]).sort((a, b) => a[0] - b[0])
  let total = 0
  let from = 0
  let to = -Infinity
  for (const [a, b] of s) {
    if (a > to) {
      if (to > -Infinity) total += to - from
      from = a
      to = b
    } else to = Math.max(to, b)
  }
  return to > -Infinity ? total + (to - from) : total
}

/** The model families that cost something, dearest first: [family id, dollars]. */
export const modelsOf = (byModel: Record<string, number> | undefined): [string, number][] =>
  Object.entries(byModel ?? {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])

/** What delegating to subagents did: dollars saved, actual over at-main-price cost (0 to 1), agent work and the time it took (ms). */
export type Delegation = { saved: number; costRatio: number; workMs: number; wallMs: number }

/** The delegation figures of a record; null until a subagent turn has been priced against the main model. */
export const delegationOf = (s: Spent): Delegation | null => {
  const atMain = s.subsAtMain ?? 0
  // What the tracked subagent turns cost; a record from before subsPaid falls back to all subagent cost.
  const paid = s.subsPaid ?? s.subs
  if (!(atMain > 0) || !(paid > 0)) return null
  const spans = s.spans ?? []
  return { saved: Math.max(0, atMain - paid), costRatio: Math.min(1, paid / atMain), workMs: workMs(spans), wallMs: unionMs(spans) }
}
