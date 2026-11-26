import { expect, test } from 'claude-code/testing'

import { dayKey, dayOfKey, isOldDay, lastDays } from '../hooks/cost/spend/days'

// Local noon, so the local date is the same in every time zone.
const NOON = new Date(2026, 10, 18, 12).getTime()
const DAY = 24 * 60 * 60 * 1000

test('dayKey is the local date', () => {
  expect(dayKey(NOON)).toBe('day:2026-11-18')
  expect(dayKey(new Date(2026, 0, 5, 0, 1).getTime())).toBe('day:2026-01-05')
  expect(dayKey(new Date(2026, 11, 31, 23, 59).getTime())).toBe('day:2026-12-31')
})

test('lastDays is the seven keys oldest first, ending today', () => {
  expect(lastDays(NOON)).toEqual([
    'day:2026-11-12', 'day:2026-11-13', 'day:2026-11-14', 'day:2026-11-15', 'day:2026-11-16', 'day:2026-11-17', 'day:2026-11-18',
  ])
})

test('lastDays crosses a month and a year', () => {
  expect(lastDays(new Date(2027, 0, 2, 9).getTime(), 4)).toEqual(['day:2026-12-30', 'day:2026-12-31', 'day:2027-01-01', 'day:2027-01-02'])
  expect(lastDays(NOON, 1)).toEqual(['day:2026-11-18'])
})

test('dayOfKey reads a key back, and null for anything else', () => {
  expect(dayOfKey('day:2026-11-18')).toBe(NOON)
  expect(dayOfKey('spend:S1')).toBeNull()
  expect(dayOfKey('day:yesterday')).toBeNull()
})

test('isOldDay: older than 30 days is old, 30 or fewer is not, and a key that does not parse is kept', () => {
  expect(isOldDay('day:2026-10-20', NOON, 30)).toBe(false)
  expect(isOldDay('day:2026-10-17', NOON, 30)).toBe(true)
  expect(isOldDay(dayKey(NOON - 40 * DAY), NOON, 30)).toBe(true)
  expect(isOldDay('day:2026-11-18', NOON, 30)).toBe(false)
  expect(isOldDay('day:oops', NOON, 30)).toBe(false)
})
