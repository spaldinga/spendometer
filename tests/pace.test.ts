import { expect, test } from 'claude-code/testing'

import { PACE_MIN_MS, asSample, nextSample, paceOf } from '../hooks/pace'

const RESET = '2098-12-31T23:00:00Z'
const T0 = Date.parse('2098-12-31T20:00:00Z')
const MIN = 60_000
const SAMPLE = { resetsAt: RESET, used0: 10, at0: T0 }

test('paceOf: 10 points an hour from 20% leaves 8 hours, and the window resets in 2: it lasts', () => {
  const now = T0 + 60 * MIN
  const p = paceOf(SAMPLE, { percentUsed: 20, resetsAt: RESET }, now)!
  expect(Math.abs(p.lastsMs - 8 * 60 * MIN)).toBeLessThan(1)
  expect(p.untilResetMs).toBe(2 * 60 * MIN)
  expect(p.ok).toBe(true)
})

test('paceOf: a fast pace runs out before the reset', () => {
  const now = T0 + 60 * MIN
  const p = paceOf(SAMPLE, { percentUsed: 60, resetsAt: RESET }, now)!
  // 50 points an hour, 40 points left: 48 minutes; the reset is 120 minutes away.
  expect(Math.abs(p.lastsMs - 48 * MIN)).toBeLessThan(1)
  expect(p.ok).toBe(false)
})

test('paceOf: unknown under 10 minutes, with no growth, for another window, or past the reset', () => {
  const w = { percentUsed: 20, resetsAt: RESET }
  expect(paceOf(SAMPLE, w, T0 + PACE_MIN_MS - 1)).toBeNull()
  expect(paceOf(SAMPLE, w, T0 + PACE_MIN_MS)).not.toBeNull()
  expect(paceOf(SAMPLE, { percentUsed: 10, resetsAt: RESET }, T0 + 60 * MIN)).toBeNull()
  expect(paceOf(SAMPLE, { percentUsed: 5, resetsAt: RESET }, T0 + 60 * MIN)).toBeNull()
  expect(paceOf(SAMPLE, { percentUsed: 20, resetsAt: '2099-01-07T23:00:00Z' }, T0 + 60 * MIN)).toBeNull()
  expect(paceOf(SAMPLE, { percentUsed: 20 }, T0 + 60 * MIN)).toBeNull()
  expect(paceOf(null, w, T0 + 60 * MIN)).toBeNull()
  expect(paceOf(SAMPLE, w, Date.parse(RESET) + MIN)).toBeNull()
})

test('nextSample: the first reading starts a sample; the same window keeps it', () => {
  const first = nextSample(null, { percentUsed: 10, resetsAt: RESET }, T0)!
  expect(first).toEqual(SAMPLE)
  expect(nextSample(first, { percentUsed: 30, resetsAt: RESET }, T0 + 60 * MIN)).toBe(first)
})

test('nextSample: a new window (another reset time) or a fall in the share used replaces the sample', () => {
  const later = T0 + 6 * 60 * MIN
  const fresh = nextSample(SAMPLE, { percentUsed: 2, resetsAt: '2099-01-01T04:00:00Z' }, later)!
  expect(fresh).toEqual({ resetsAt: '2099-01-01T04:00:00Z', used0: 2, at0: later })
  expect(nextSample(SAMPLE, { percentUsed: 4, resetsAt: RESET }, later)).toEqual({ resetsAt: RESET, used0: 4, at0: later })
})

test('nextSample: a window with no reset time keeps no sample', () => {
  expect(nextSample(SAMPLE, { percentUsed: 0 }, T0)).toBeNull()
})

test('asSample trusts only a whole sample', () => {
  expect(asSample(SAMPLE)).toEqual(SAMPLE)
  expect(asSample({ resetsAt: RESET })).toBeNull()
  expect(asSample(null)).toBeNull()
  expect(asSample('x')).toBeNull()
})
