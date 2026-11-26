import { expect, mock, test } from 'claude-code/testing'

import { usd } from '../hooks/cost/prices'
import { dayKey } from '../hooks/cost/spend/days'
import { NOW, MIN, PROPS, BAND, engine, seed, keepwarm, USED, done, DAY, FRESH, stored, step, stopStep } from './keepwarm-kit'
test("a finished turn also goes onto today's total, across sessions: a day key holds a number of dollars", async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  await seed($, 18)
  await done($, { usage: USED })
  await done($, { usage: { ...USED, model: 'claude-haiku-5-5' }, agentId: 'sub1' })
  expect(usd(store.get(dayKey(NOW)) as number)).toBe(usd(36.5))
  // A turn with no cost writes nothing more.
  await done($, { usage: null })
  expect(usd(store.get(dayKey(NOW)) as number)).toBe(usd(36.5))
})

test('another session\'s spend earlier today is added to, not replaced', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, prefill: { [dayKey(NOW)]: 10 } })
  await seed($, 18)
  await done($, { usage: USED })
  expect(usd(store.get(dayKey(NOW)) as number)).toBe(usd(42.4))
})

test('at session start the old pace samples go, day totals older than 30 days go, and recent ones stay', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, {
    keep: true,
    prefill: {
      'pace:five_hour': { resetsAt: '2099-01-01T00:00:00Z', used0: 1, at0: NOW },
      'pace:seven_day': 'anything',
      [dayKey(NOW - 31 * DAY)]: 5,
      [dayKey(NOW - 29 * DAY)]: 6,
      [dayKey(NOW)]: 7,
    },
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(store.has('pace:five_hour')).toBe(false)
  expect(store.has('pace:seven_day')).toBe(false)
  expect(store.has(dayKey(NOW - 31 * DAY))).toBe(false)
  expect(store.get(dayKey(NOW - 29 * DAY))).toBe(6)
  expect(store.get(dayKey(NOW))).toBe(7)
})

test('no pace key is written, even with the card open', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160 } })
  await band.press({ key: 'cache-fold' })
  expect([...store.keys()].filter(k => k.startsWith('pace:'))).toEqual([])
  await band.unmount()
})

test('a turn that begins after the hour on a cache the pings kept warm records what it saved', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on)
  stopStep(on)
  await seed($, 0)
  await step($, 0)
  await keepwarm($, '6h')
  await clock.advance(50 * MIN)
  await clock.advance(30 * MIN)
  await step($, 0)
  // 200k tokens on Opus: a cold write is $4 x 2 a million, a read $0.20 a million.
  expect(Math.abs(stored(store).saved! - (1.6 - 0.04))).toBeLessThan(1e-9)
  // Right after, the cache is the turn's own: another request saves nothing more.
  await clock.advance(MIN)
  await step($, 1)
  await step($, 0)
  expect(Math.abs(stored(store).saved! - (1.6 - 0.04))).toBeLessThan(1e-9)
})

test('no savings without pings, or when the gap since the last real request is under the hour', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on)
  stopStep(on)
  await seed($, 0)
  await step($, 0)
  // Cold: no ping kept it.
  await clock.advance(80 * MIN)
  await step($, 0)
  expect(store.get('spend:S1')).toBeUndefined()
  // A ping and a request inside the hour: the cache would have been warm anyway.
  await keepwarm($, '6h every 10m')
  await clock.advance(10 * MIN)
  expect(stored(store).pings).toBeGreaterThan(0)
  await clock.advance(10 * MIN)
  await step($, 0)
  expect(stored(store).saved).toBeUndefined()
})

test('a session record without the keep-warm figures still reads, and keeps its figures when they are added', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, prefill: { 'spend:S1': FRESH(2, 1, 0.5) } })
  await seed($, 18)
  await done($, { usage: USED })
  const s = stored(store)
  expect(usd(s.main)).toBe(usd(34.4))
  expect(s.pings).toBeUndefined()
  expect(s.saved).toBeUndefined()
})
