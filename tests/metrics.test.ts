import { expect, test } from 'claude-code/testing'

import { delegationOf, hitRate, metricsOf, modelsOf, nextGrowth, outlierMultiple, runwayTurns, topTypes, unionMs, workMs } from '../hooks/metrics'
import { putSpan } from '../hooks/cost/spend/record'
import type { Spent } from '../types'

const near = (a: number | null | undefined, b: number) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(1e-9)

test('the hit rate is cache reads over all input, and unknown before any input', () => {
  near(hitRate(96, 100), 0.96)
  near(hitRate(0, 100), 0)
  near(hitRate(undefined, 100), 0)
  expect(hitRate(5, 0)).toBeNull()
  expect(hitRate(5, undefined)).toBeNull()
  near(hitRate(500, 100), 1)
})

test('context growth: the first increase starts it, later ones average in at 0.3, drops and standstills are ignored', () => {
  expect(nextGrowth(undefined, undefined, 50_000)).toBeUndefined()
  near(nextGrowth(undefined, 50_000, 56_000), 6000)
  near(nextGrowth(6000, 56_000, 66_000), 0.3 * 10_000 + 0.7 * 6000)
  // A compaction shrinks the context: no change to the figure.
  near(nextGrowth(7200, 66_000, 20_000), 7200)
  near(nextGrowth(7200, 20_000, 20_000), 7200)
  expect(nextGrowth(undefined, 66_000, 20_000)).toBeUndefined()
  // The turn after a drop grows from the new, smaller size.
  near(nextGrowth(7200, 20_000, 23_000), 0.3 * 3000 + 0.7 * 7200)
})

test('the runway is free context over growth, unknown until two turns and while there is no growth', () => {
  near(runwayTurns(240_000, 6000, 2), 40)
  expect(runwayTurns(240_000, 6000, 1)).toBeNull()
  expect(runwayTurns(240_000, 6000, undefined)).toBeNull()
  expect(runwayTurns(240_000, 0, 5)).toBeNull()
  expect(runwayTurns(240_000, undefined, 5)).toBeNull()
  near(runwayTurns(0, 6000, 5), 0)
  near(runwayTurns(-1, 6000, 5), 0)
})

test('a turn is an outlier at 3 times the average or more, over at least 3 turns, and the multiple is rounded', () => {
  expect(outlierMultiple(2.11, 0.38, 5)).toBe(6)
  expect(outlierMultiple(1.25, 0.4, 5)).toBe(3)
  expect(outlierMultiple(1.1, 0.4, 5)).toBeNull()
  expect(outlierMultiple(2.11, 0.38, 2)).toBeNull()
  expect(outlierMultiple(2.11, 0, 5)).toBeNull()
  expect(outlierMultiple(1.4, 0.38, 3)).toBe(4)
})

test('the top subagent types, dearest first, without the free ones', () => {
  expect(topTypes({ coder: 1.24, Explore: 3.9, haiku: 0.1, none: 0 }, 2)).toEqual([['Explore', 3.9], ['coder', 1.24]])
  expect(topTypes({}, 2)).toEqual([])
  expect(topTypes(undefined, 2)).toEqual([])
})

const REC: Spent = { main: 10, subs: 5, last: 2.11, at: 1, turns: 4, paidTurns: 1.52, readTok: 960, inTok: 1000, growth: 6000, byType: { Explore: 3.9 } }

test('metricsOf reads the record: average over the tracked turns, the outlier, the runway and the top types', () => {
  const m = metricsOf(REC, 240_000)!
  near(m.hit, 0.96)
  near(m.avg, 0.38)
  near(m.last, 2.11)
  expect(m.multiple).toBe(6)
  near(m.runway, 40)
  near(m.growth, 6000)
  near(m.subs, 5)
  expect(m.top).toEqual([['Explore', 3.9]])
})

test('metricsOf on an old record, or none, knows nothing but the subagent total', () => {
  expect(metricsOf(null, 1000)).toBeNull()
  const m = metricsOf({ main: 3, subs: 1, last: 0.5, at: 1 }, 1000)!
  expect(m.hit).toBeNull()
  expect(m.avg).toBeNull()
  expect(m.multiple).toBeNull()
  expect(m.runway).toBeNull()
  expect(m.growth).toBeNull()
  expect(m.top).toEqual([])
  near(m.subs, 1)
})

const MIN = 60_000

test('the by-model split: models with cost, dearest first, free and empty ones left out', () => {
  expect(modelsOf({ haiku: 1.09, opus: 14.2, sonnet: 5.1, fable: 0 })).toEqual([['opus', 14.2], ['sonnet', 5.1], ['haiku', 1.09]])
  expect(modelsOf({})).toEqual([])
  expect(modelsOf(undefined)).toEqual([])
  const m = metricsOf({ ...REC, byModel: { opus: 14.2, sonnet: 5.1, haiku: 1.09 } }, 240_000)!
  expect(m.models.map(([id]) => id)).toEqual(['opus', 'sonnet', 'haiku'])
  // The shares the card draws: 14.20 of 20.39.
  const total = m.models.reduce((a, [, c]) => a + c, 0)
  near(total, 20.39)
  near(m.models[0][1] / total, 14.2 / 20.39)
})

test('the effective price is tracked cost over all tracked tokens per million, unknown without either', () => {
  near(metricsOf({ ...REC, byModel: { opus: 12.4, haiku: 0.6 }, totTok: 21_000_000 }, 1000)!.perM, 13 / 21)
  expect(metricsOf({ ...REC, byModel: { opus: 12.4 } }, 1000)!.perM).toBeNull()
  expect(metricsOf({ ...REC, totTok: 1e6 }, 1000)!.perM).toBeNull()
  expect(metricsOf(REC, 1000)!.perM).toBeNull()
})

test('wall time is the length of the union of the run intervals; work is their sum', () => {
  const s: [number, number][] = [[0, 10 * MIN], [4 * MIN, 8 * MIN], [20 * MIN, 25 * MIN]]
  expect(unionMs(s)).toBe(15 * MIN)
  expect(workMs(s)).toBe(19 * MIN)
  // Touching or nested intervals, unsorted ones, empty and backwards ones.
  expect(unionMs([[5, 10], [0, 5]])).toBe(10)
  expect(unionMs([[0, 10], [2, 3]])).toBe(10)
  expect(unionMs([[3, 3], [9, 4]])).toBe(0)
  expect(unionMs([])).toBe(0)
  expect(workMs([[9, 4]])).toBe(0)
})

test('delegation: saved is the at-main price less the cost, 1.0x with no overlap, null before a subagent turn is tracked', () => {
  const base: Spent = { main: 10, subs: 2, last: 1, at: 1, subsAtMain: 5.1, spans: [[0, 5 * MIN], [5 * MIN, 12 * MIN]] }
  const d = delegationOf(base)!
  near(d.saved, 3.1)
  near(d.costRatio, 2 / 5.1)
  expect(d.workMs).toBe(12 * MIN)
  expect(d.wallMs).toBe(12 * MIN)
  expect(d.workMs / d.wallMs).toBe(1)
  // Overlapping runs: 12 minutes of work in 5.
  const par = delegationOf({ ...base, spans: [[0, 5 * MIN], [0, 5 * MIN], [0, 2 * MIN]] })!
  expect(par.workMs).toBe(12 * MIN)
  expect(par.wallMs).toBe(5 * MIN)
  expect((par.workMs / par.wallMs).toFixed(1)).toBe('2.4')
  // The same model as the main one: at-main equals the cost, nothing saved, never below 0.
  const same = delegationOf({ ...base, subs: 5.1 })!
  expect(same.saved).toBe(0)
  near(same.costRatio, 1)
  expect(delegationOf({ ...base, subs: 6 })!.saved).toBe(0)
  expect(delegationOf({ ...base, subs: 6 })!.costRatio).toBe(1)
  // No subagent tracked: nothing, and metricsOf carries it.
  expect(delegationOf({ main: 1, subs: 0, last: 0, at: 1 })).toBeNull()
  expect(delegationOf({ main: 1, subs: 3, last: 0, at: 1 })).toBeNull()
  expect(metricsOf(base, 1000)!.deleg!.saved).toBeGreaterThan(3)
  expect(metricsOf(REC, 1000)!.deleg).toBeNull()
})

test('a subagent interval grows with its turns; the record keeps the last 200', () => {
  let s = putSpan(undefined, 100, 160)
  expect(s).toEqual([[100, 160]])
  // Its next turn ends later: the same interval is extended, not added.
  s = putSpan(s, 100, 220, 160)
  expect(s).toEqual([[100, 220]])
  // Another subagent that started at the same moment but ended elsewhere is a new interval.
  s = putSpan(s, 100, 130)
  expect(s).toEqual([[100, 220], [100, 130]])
  let many: [number, number][] | undefined
  for (let i = 0; i < 230; i++) many = putSpan(many, i, i + 1)
  expect(many!.length).toBe(200)
  expect(many![0]).toEqual([30, 31])
  expect(many![199]).toEqual([229, 230])
})

test('delegation measures only the subagent cost tracked with its main-model price, not spend from before', () => {
  // A record from before tracking: $5 of old subagent spend, then one tracked turn of $1 that would have cost $3 on the main model.
  const s = { main: 10, subs: 6, last: 0, at: 0, subsAtMain: 3, subsPaid: 1 }
  const d = delegationOf(s)!
  expect(d.saved).toBe(2)
  expect(Math.abs(d.costRatio - 1 / 3)).toBeLessThan(1e-9)
})

test('the tool output figures: top three tools, the sum over all, and the re-reads', () => {
  const s: Spent = { main: 1, subs: 0, last: 0, at: 0, byTool: { Bash: 18000, Read: 12000, Grep: 6000, Glob: 500 }, rereads: 4, rereadTok: 9000 }
  const m = metricsOf(s, 0)!
  expect(m.tools).toEqual([['Bash', 18000], ['Read', 12000], ['Grep', 6000]])
  expect(m.toolTok).toBe(36500)
  expect(m.rereads).toBe(4)
  expect(m.rereadTok).toBe(9000)
  const old = metricsOf({ main: 1, subs: 0, last: 0, at: 0 }, 0)!
  expect([old.tools, old.toolTok, old.rereads, old.rereadTok]).toEqual([[], 0, 0, 0])
})
