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

/** How many subagent run intervals the record keeps. */
export const SPAN_KEEP = 200

/**
 * `spans` with a subagent's run interval added. A subagent's interval grows with each turn it completes: the one
 * written for its previous end (`prevEnd`, same start) is replaced; a new one is added otherwise. Keeps the last SPAN_KEEP.
 */
export const putSpan = (spans: readonly [number, number][] | undefined, start: number, end: number, prevEnd?: number): [number, number][] => {
  const list = (spans ?? []).map(s => [s[0], s[1]] as [number, number])
  let at = -1
  if (prevEnd !== undefined) for (let i = list.length - 1; i >= 0 && at < 0; i--) if (list[i][0] === start && list[i][1] === prevEnd) at = i
  if (at >= 0) list[at] = [start, Math.max(end, prevEnd!)]
  else list.push([start, Math.max(end, start)])
  return list.slice(-SPAN_KEEP)
}

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

/** What the card's metric row writes; null fields are unknown. */
export type Metrics = {
  /** Share of input read from the cache, 0 to 1. */
  hit: number | null
  /** What a million tokens cost over everything this thread spent (dollars), when known. */
  perM: number | null
  /** Average main-turn cost, and the last one. */
  avg: number | null
  last: number | null
  /** The last turn as a multiple of the average, when it is an outlier. */
  multiple: number | null
  /** Turns of free context left, and the context growth a turn it rests on. */
  runway: number | null
  growth: number | null
  /** Cost per model family, dearest first. */
  models: [string, number][]
  /** What delegating did; null while no subagent turn is tracked. */
  deleg: Delegation | null
  /** All subagent cost, and the top types by cost (for the card's alt text). */
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
  const models = modelsOf(s.byModel)
  const tracked = models.reduce((a, [, c]) => a + c, 0)
  return {
    hit: hitRate(s.readTok, s.inTok),
    perM: tracked > 0 && (s.totTok ?? 0) > 0 ? (tracked / s.totTok!) * 1e6 : null,
    avg,
    last,
    multiple: avg !== null && last !== null ? outlierMultiple(last, avg, turns) : null,
    runway,
    growth: runway !== null ? (s.growth ?? null) : null,
    models,
    deleg: delegationOf(s),
    subs: s.subs,
    top: topTypes(s.byType, 3),
  }
}
