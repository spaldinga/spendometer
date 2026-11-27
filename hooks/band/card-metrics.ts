// The metric row's figures as the card writes them: assembled from the record's cost figures (cost/spend/metrics)
// and the context runway (capacity/context/runway), so it sits in the band. Pure: the per-session record in.

import type { Spent } from '../../types'
import { runwayTurns } from '../capacity/context/runway'
import { topTools } from '../capacity/context/toolout'
import { delegationOf, hitRate, modelsOf, outlierMultiple, topTypes } from '../cost/spend/metrics'
import type { Delegation } from '../cost/spend/metrics'

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
  /** Tool output tokens that entered the main context: the top tools, the sum over all of them. */
  tools: [string, number][]
  toolTok: number
  /** Files re-read unchanged, and what those re-reads cost in tokens. */
  rereads: number
  rereadTok: number
  /** The context size after the first main turn (an estimate of the setup), and the most recently re-read files with their counts, newest first. */
  ctxFirst: number | null
  rereadFiles: [string, number][]
  /** The priced main turns so far: what the average and the outlier caption count, however few bars are kept. */
  turns: number
  /** The last main-turn costs, oldest first (up to 10); empty when unknown. */
  recent: number[]
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
    tools: topTools(s.byTool, 3),
    toolTok: Object.values(s.byTool ?? {}).reduce((a, n) => a + (n > 0 ? n : 0), 0),
    rereads: s.rereads ?? 0,
    rereadTok: s.rereadTok ?? 0,
    ctxFirst: s.ctxFirst ?? null,
    rereadFiles: Object.entries(s.rereadFiles ?? {}).reverse(),
    turns,
    recent: [...(s.recent ?? [])],
  }
}
