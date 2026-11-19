import { expect, test } from 'claude-code/testing'

import { hitRate, metricsOf, nextGrowth, outlierMultiple, runwayTurns, topTypes } from '../hooks/metrics'
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
