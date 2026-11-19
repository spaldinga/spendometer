// The metric row's figures. Pure: the per-session record in, what the card writes out.

import type { Spent } from '../types'

/** The weight of the newest context increase in the running growth figure. */
export const GROWTH_ALPHA = 0.3
/** Runways longer than this are shown as `>99`. */
export const RUNWAY_CAP = 99
/** A turn this many times the average, over at least OUTLIER_TURNS turns, is flagged. */
export const OUTLIER_X = 3
export const OUTLIER_TURNS = 3

/** Share of input read from the cache (0 to 1), or null before any input is known. `inTok` counts fresh, cache-read and cache-written input. */
export const hitRate = (readTok: number | undefined, inTok: number | undefined): number | null =>
  inTok !== undefined && inTok > 0 ? Math.min(1, Math.max(0, (readTok ?? 0) / inTok)) : null

/**
 * The running growth of the context per turn: an exponential moving average of the increases between
 * successive main turn completions. A drop (compaction) or no change leaves it as it was; the first increase
 * starts it.
 */
export const nextGrowth = (growth: number | undefined, ctxPrev: number | undefined, ctxNow: number): number | undefined => {
  if (ctxPrev === undefined || ctxNow <= ctxPrev) return growth
  const d = ctxNow - ctxPrev
  return growth === undefined ? d : GROWTH_ALPHA * d + (1 - GROWTH_ALPHA) * growth
}

/** Turns until the context is full at the current growth; null until two turns are known or while there is no growth. */
export const runwayTurns = (free: number, growth: number | undefined, turns: number | undefined): number | null =>
  (turns ?? 0) >= 2 && growth !== undefined && growth > 0 ? Math.max(0, free) / growth : null

/** How many times the average the last turn cost, rounded, when it is an outlier; else null. */
export const outlierMultiple = (last: number, avg: number, turns: number): number | null =>
  turns >= OUTLIER_TURNS && avg > 0 && last >= OUTLIER_X * avg ? Math.round(last / avg) : null

/** The `n` subagent types that cost most, dearest first; types that cost nothing are left out. */
export const topTypes = (byType: Record<string, number> | undefined, n: number): [string, number][] =>
  Object.entries(byType ?? {})
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)

/** What the card's metric row writes; null fields are unknown. */
export type Metrics = {
  /** Share of input read from the cache, 0 to 1. */
  hit: number | null
  /** Average main-turn cost, and the last one. */
  avg: number | null
  last: number | null
  /** The last turn as a multiple of the average, when it is an outlier. */
  multiple: number | null
  /** Turns of free context left, and the context growth a turn it rests on. */
  runway: number | null
  growth: number | null
  /** All subagent cost, and the top types by cost. */
  subs: number
  top: [string, number][]
}

/** The metrics of a session record with `free` tokens of context left; null when the record knows none of them. */
export const metricsOf = (s: Spent | null, free: number): Metrics | null => {
  if (!s) return null
  const turns = s.turns ?? 0
  const avg = turns > 0 && s.paidTurns !== undefined ? s.paidTurns / turns : null
  const last = s.last > 0 ? s.last : null
  const runway = runwayTurns(free, s.growth, turns)
  return {
    hit: hitRate(s.readTok, s.inTok),
    avg,
    last,
    multiple: avg !== null && last !== null ? outlierMultiple(last, avg, turns) : null,
    runway,
    growth: runway !== null ? (s.growth ?? null) : null,
    subs: s.subs,
    top: topTypes(s.byType, 2),
  }
}
