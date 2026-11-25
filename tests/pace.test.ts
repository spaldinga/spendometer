import { expect, test } from 'claude-code/testing'

import { PACE_MIN_MS, WINDOW_MS, paceOf } from '../hooks/pace'

const MIN = 60_000
const HOUR = 60 * MIN
const FIVE = WINDOW_MS.five_hour
const NOW = Date.parse('2098-12-31T20:00:00Z')
/** A window resetting `left` ms after NOW. */
const resetIn = (left: number) => new Date(NOW + left).toISOString()

test('the windows are 5 hours and 7 days long', () => {
  expect(FIVE).toBe(5 * HOUR)
  expect(WINDOW_MS.seven_day).toBe(7 * 24 * HOUR)
})

test('paceOf: 20% used 3 hours into a 5-hour window leaves 12 hours, and the reset is 2 hours away: it lasts', () => {
  const p = paceOf({ percentUsed: 20, resetsAt: resetIn(2 * HOUR) }, FIVE, NOW)!
  expect(Math.abs(p.lastsMs - 12 * HOUR)).toBeLessThan(1)
  expect(p.untilResetMs).toBe(2 * HOUR)
  expect(p.ok).toBe(true)
})

test('paceOf: a fast pace runs out before the reset', () => {
  // 60% in the first hour: 40% more takes 40 minutes; the reset is 4 hours away.
  const p = paceOf({ percentUsed: 60, resetsAt: resetIn(4 * HOUR) }, FIVE, NOW)!
  expect(Math.abs(p.lastsMs - 40 * MIN)).toBeLessThan(1)
  expect(p.untilResetMs).toBe(4 * HOUR)
  expect(p.ok).toBe(false)
})

test('paceOf: using exactly what lasts to the reset counts as ok', () => {
  // Half the window gone, half used: it lasts exactly until the reset.
  const p = paceOf({ percentUsed: 50, resetsAt: resetIn(2.5 * HOUR) }, FIVE, NOW)!
  expect(p.ok).toBe(true)
})

test('paceOf: unknown with no reset time', () => {
  expect(paceOf({ percentUsed: 20 }, FIVE, NOW)).toBeNull()
})

test('paceOf: unknown once the reset has passed, or with a time that is not a date', () => {
  expect(paceOf({ percentUsed: 20, resetsAt: resetIn(0) }, FIVE, NOW)).toBeNull()
  expect(paceOf({ percentUsed: 20, resetsAt: resetIn(-MIN) }, FIVE, NOW)).toBeNull()
  expect(paceOf({ percentUsed: 20, resetsAt: 'soon' }, FIVE, NOW)).toBeNull()
})

test('paceOf: unknown under 10 minutes into the window', () => {
  expect(paceOf({ percentUsed: 5, resetsAt: resetIn(FIVE - PACE_MIN_MS + 1) }, FIVE, NOW)).toBeNull()
  expect(paceOf({ percentUsed: 5, resetsAt: resetIn(FIVE - PACE_MIN_MS) }, FIVE, NOW)).not.toBeNull()
})

test('paceOf: unknown when nothing is used, or the share is not a number', () => {
  expect(paceOf({ percentUsed: 0, resetsAt: resetIn(2 * HOUR) }, FIVE, NOW)).toBeNull()
  expect(paceOf({ percentUsed: -3, resetsAt: resetIn(2 * HOUR) }, FIVE, NOW)).toBeNull()
  expect(paceOf({ percentUsed: NaN, resetsAt: resetIn(2 * HOUR) }, FIVE, NOW)).toBeNull()
})

test('paceOf: a reset further away than the window is long is unknown, not a negative elapsed time', () => {
  expect(paceOf({ percentUsed: 20, resetsAt: resetIn(FIVE + HOUR) }, FIVE, NOW)).toBeNull()
})

test('paceOf: a window already full runs out now', () => {
  const p = paceOf({ percentUsed: 100, resetsAt: resetIn(2 * HOUR) }, FIVE, NOW)!
  expect(p.lastsMs).toBe(0)
  expect(p.ok).toBe(false)
})

test('paceOf: atReset is the forecast share at the reset, whole percent', () => {
  // 39% used, 4h03m of 5h gone: 39 / 0.81 = 48.1.
  expect(paceOf({ percentUsed: 39, resetsAt: resetIn(FIVE - (4 * HOUR + 3 * MIN)) }, FIVE, NOW)!.atReset).toBe(48)
  // Exactly on pace: 100% at the reset, and ok.
  const p = paceOf({ percentUsed: 50, resetsAt: resetIn(2.5 * HOUR) }, FIVE, NOW)!
  expect(p.atReset).toBe(100)
  expect(p.ok).toBe(true)
})
