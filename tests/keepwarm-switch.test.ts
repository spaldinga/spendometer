import { expect, mock, test } from 'claude-code/testing'

import { NOW, MIN, HOUR, BAND, COLD, engine, seed, keepwarm, settle, recOf, label, hold, USED, done, stopStep } from './keepwarm-kit'
test('the tooltip no longer names cache-tax', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(JSON.stringify(await band.findAll({ type: 'Text' }))).not.toContain('cache-tax')
  await band.unmount()
})

test('a conversation with no choice of its own follows the default; its own choice wins over it', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { session } = engine(on, { keep: true, prefill: { 'keep:S2': { on: false, at: NOW } } })
  await seed($, 18)
  const shown = async () => {
    const b = await $.ui.mount({ ...BAND, surface: 'desktop' })
    const l = await label(b)
    await b.unmount()
    return l
  }
  expect(await shown()).toBe('✓')
  session.id = 'S2'
  expect(await shown()).toBe('✗')
})

test('the switch shows in the terminal too, and before the first reply', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await label(band)).toBe('✗')
  await band.unmount()
})

test('the first session ever stores nothing; a later session leaves a saved choice alone', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, ran } = engine(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  expect(store.has('keepDefault')).toBe(false)
  expect(store.has('keep:S1')).toBe(false)
  expect(ran).toEqual([])
  store.set('keepDefault', false)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(store.get('keepDefault')).toBe(false)
})

test('with the switch on, a turn that reached the cache renews the window to 24 hours from then, and never shortens a longer one', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { prefill: { 'keep:S1': { on: true, at: NOW } } })
  await seed($, 18)
  // A turn that reported no usage touched nothing: no window.
  await done($, { usage: null })
  expect(recOf(store)?.deadline).toBeUndefined()
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 24 * HOUR)
  await clock.advance(4 * HOUR)
  await done($, { usage: USED })
  // Each message starts the 24 hours again from then, restarting the window rather than extending it a fixed step.
  expect(recOf(store)?.deadline).toBe(NOW + 4 * HOUR + 24 * HOUR)
  await keepwarm($, '48h')
  await clock.advance(HOUR)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 4 * HOUR + 48 * HOUR)
  // A subagent's turn renews nothing.
  const before = recOf(store)?.deadline
  await clock.advance(HOUR)
  await done($, { usage: USED, agentId: 'sub1' })
  expect(recOf(store)?.deadline).toBe(before)
})

test('with the switch off a turn opens no window, and a window a typed duration opened is left as it is', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: false })
  await seed($, 18)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBeUndefined()
  await keepwarm($, '2h')
  await clock.advance(30 * MIN)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 2 * HOUR)
})

test('a conversation with its own switch on while the default is off renews too', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: false, prefill: { 'keep:S1': { on: true, at: NOW } } })
  await seed($, 18)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 24 * HOUR)
})

test("a restart restores the conversation's window from the store, with its testing period", async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { prefill: { 'keep:S1': { on: false, deadline: NOW + 3 * HOUR, every: 20 * MIN, at: NOW } } })
  await seed($, 5)
  expect(await keepwarm($, 'status')).toMatch(/^keepwarm 3h00m left · ping in 15m/)
  await clock.advance(14 * MIN)
  expect(forks.length).toBe(0)
  await clock.advance(MIN)
  expect(forks.length).toBe(1)
})

test('a restart with nothing to fork waits for the first turn instead of stopping', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { forks: [{ isAnswered: false, reason: 'nothing-to-fork' }], prefill: { 'keep:S1': { deadline: NOW + 3 * HOUR, at: NOW } } })
  await seed($, 40)
  await clock.advance(10 * MIN)
  expect(forks.length).toBe(1)
  expect(await keepwarm($, 'status')).toMatch(/nothing to fork yet/)
})

test('a window that ran out while the app was closed is not restored', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { keep: false, prefill: { 'keep:S1': { deadline: NOW - MIN, at: NOW - HOUR } } })
  await seed($, 40)
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(0)
  expect(await keepwarm($, 'status')).toBe('keepwarm is off')
})

test('/clear drops the old conversation\'s window; the next one arms from its own switch at its first turn', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, session, forks } = engine(on, { keep: true })
  await seed($, 0)
  await keepwarm($, '6h')
  expect(recOf(store)?.deadline).toBe(NOW + 6 * HOUR)
  await $.session.end({ sessionId: 'S1', reason: 'clear' } as never)
  session.id = 'S2'
  expect(recOf(store)?.deadline).toBeUndefined()
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(0)
  // The new conversation has no choice of its own: it follows the default, on.
  await done($, { usage: USED })
  expect(recOf(store, 'S2')?.deadline).toBe(NOW + 2 * HOUR + 24 * HOUR)
  expect(recOf(store)?.deadline).toBeUndefined()
})

test('a ping in flight when /clear lands is dropped: nothing is counted for the new conversation and its window is not stopped', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const held = hold()
  const { store, session, forks } = engine(on, { forks: [COLD], gate: held.gate })
  await seed($, 0)
  await keepwarm($, '6h')
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(1)
  await $.session.end({ sessionId: 'S1', reason: 'clear' } as never)
  session.id = 'S2'
  await keepwarm($, '3h')
  held.release()
  await settle()
  expect(await keepwarm($, 'status')).not.toMatch(/stopped/)
  expect(recOf(store, 'S2')?.deadline).toBe(NOW + 50 * MIN + 3 * HOUR)
})

test('a conversation that changed without a session.end is told by its id: the old window goes', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, session, forks } = engine(on)
  await seed($, 0)
  await keepwarm($, '6h')
  session.id = 'S2'
  await done($, { usage: null })
  expect(recOf(store)?.deadline).toBeUndefined()
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(0)
})

test('a session id that cannot be read leaves the commands answering and throws nothing', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { idThrows: true, keep: false })
  await seed($, 0)
  expect(await keepwarm($, '1h')).toContain('window of 1h00m')
  await clock.advance(2 * HOUR)
  expect(await keepwarm($, 'status')).toBe('keepwarm is off')
  // Nothing can be written under an id that is not there.
  expect([...store.keys()].filter(k => k.startsWith('keep:'))).toEqual([])
})

test('session records of conversations untouched for a month are pruned with the others', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const old = NOW - 31 * 24 * 60 * MIN
  const { store } = engine(on, { keep: true, prefill: { 'keep:OLD': { on: true, at: old }, 'keep:NEW': { on: true, at: NOW - MIN } } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  expect(store.has('keep:OLD')).toBe(false)
  expect(store.has('keep:NEW')).toBe(true)
  expect(store.get('keepDefault')).toBe(true)
})

test('a new conversation with no switch and no default is on: a turn with usage opens a 24-hour window', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on)
  await seed($, 18)
  expect(await keepwarm($, 'status')).toBe('keepwarm is on, no window open: the next turn opens one')
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 24 * HOUR)
  // Nothing is written for the switch or the default: it is on because nothing says off.
  expect(recOf(store)?.on).toBeUndefined()
  expect(store.has('keepDefault')).toBe(false)
})

test('every message restarts the 24 hours: a second turn 5 hours later ends 24 hours from then', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on)
  await seed($, 18)
  await done($, { usage: USED })
  await clock.advance(5 * HOUR)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 5 * HOUR + 24 * HOUR)
})

test('the default turned off by /keepwarm off leaves a new conversation unticked; a stale false under the old key does not', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, session } = engine(on)
  await seed($, 18)
  await keepwarm($, 'off')
  expect(store.get('keepDefault')).toBe(false)
  session.id = 'S2'
  await done($, { usage: USED })
  expect(recOf(store, 'S2')?.deadline).toBeUndefined()
  const b = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(b)).toBe('✗')
  await b.unmount()
})

test('a false stored under the old keep key is ignored: the default is still on', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { prefill: { keep: false } })
  await seed($, 18)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 24 * HOUR)
  const b = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(b)).toBe('✓')
  await b.unmount()
})

test('turning it off is sticky: the next turn opens no window and the box stays unticked', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, forks } = engine(on)
  await seed($, 0)
  await done($, { usage: USED })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(band)).toBe('✓')
  await keepwarm($, 'off')
  expect(await label(band)).toBe('✗')
  expect(recOf(store)?.on).toBe(false)
  await clock.advance(HOUR)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBeUndefined()
  expect(recOf(store)?.on).toBe(false)
  expect(await label(band)).toBe('✗')
  await clock.advance(3 * HOUR)
  expect(forks.length).toBe(0)
  await keepwarm($, 'on')
  expect(await label(band)).toBe('✓')
  await band.unmount()
})

test('a new conversation before its first reply, with the switch on, shows ticked', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(band)).toBe('✓')
  await band.unmount()
})

test('a late timer after a sleep: the box is off at the draw, the window stops with the cold reason, the switch stays on, and the next turn ticks it again', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const held = hold()
  // The ping out at 50 minutes finds nothing to fork and is held: no timer can run until it settles, as when the computer sleeps.
  const { store, forks } = engine(on, { forks: [{ isAnswered: false, reason: 'nothing-to-fork' }], gate: held.gate, prefill: { 'keep:S1': { on: true, at: NOW } } })
  await seed($, 0)
  await keepwarm($, '6h')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(band)).toBe('✓')
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(1)
  await clock.advance(11 * MIN)
  // 61 minutes since the last request and the window is still open in the state: the draw already says off.
  expect(await label(band)).toBe('✗')
  held.release()
  await settle()
  expect(await keepwarm($, 'status')).toBe('keepwarm stopped, the cache went cold')
  expect(recOf(store)?.deadline).toBeUndefined()
  expect(recOf(store)?.on).toBe(true)
  expect(await label(band)).toBe('✗')
  // The next message opens 24 hours again.
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 61 * MIN + 24 * HOUR)
  expect(await label(band)).toBe('✓')
  await band.unmount()
})

test('cold ends the window in the waitForTurn and compacted states too', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { forks: [{ isAnswered: false, reason: 'nothing-to-fork' }] })
  stopStep(on)
  await seed($, 0)
  await keepwarm($, '6h')
  await clock.advance(50 * MIN)
  expect(await keepwarm($, 'status')).toMatch(/nothing to fork yet/)
  await clock.advance(11 * MIN)
  expect(forks.length).toBe(1)
  expect(await keepwarm($, 'status')).toBe('keepwarm stopped, the cache went cold')
  await done($, { usage: USED })
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never)
  expect(await keepwarm($, 'status')).toMatch(/waiting for the first turn after compaction/)
  await clock.advance(61 * MIN)
  expect(await keepwarm($, 'status')).toBe('keepwarm stopped, the cache went cold')
})

test('a restored window whose cache is already cold is stopped: the box is off and nothing is pinged', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, forks } = engine(on, {
    prefill: {
      'keep:S1': { on: true, deadline: NOW + 3 * HOUR, at: NOW },
      'cache:S1': { lastAt: NOW - 2 * HOUR, tokens: 200000, window: 1000000, model: 'claude-opus-5-5' },
    },
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(band)).toBe('✗')
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(0)
  expect(await keepwarm($, 'status')).toBe('keepwarm stopped, the cache went cold')
  expect(recOf(store)?.deadline).toBeUndefined()
  expect(recOf(store)?.on).toBe(true)
  await band.unmount()
})

test('turning it off is not undone by cold or by a turn: the box stays off', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on)
  await seed($, 0)
  await done($, { usage: USED })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await keepwarm($, 'off')
  expect(await label(band)).toBe('✗')
  await clock.advance(2 * HOUR)
  await done($, { usage: USED })
  expect(await label(band)).toBe('✗')
  expect(recOf(store)?.on).toBe(false)
  expect(recOf(store)?.deadline).toBeUndefined()
  await band.unmount()
})
