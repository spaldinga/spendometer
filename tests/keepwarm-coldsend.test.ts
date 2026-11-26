import { expect, mock, test } from 'claude-code/testing'

import { BG, NOW, MIN, HOUR, BAND, COLD, engine, seed, keepwarm, settle, recOf, label, submit, USED, done } from './keepwarm-kit'
// ---------- cache-tax installed ----------

test('with cache-tax installed the mod stays passive: one note, no command, no button, no pings', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, logs, registered, forks } = engine(on, { commands: ['keepwarm', 'cache-tax'], keep: true })
  await seed($, 18)
  expect(logs.filter(l => l.includes('cache-tax'))).toEqual([
    'cache-tax is installed and would ping too. Uninstall it with `claude plugin uninstall cache-tax@claude-code-mods` so spendometer keeps the cache warm.',
  ])
  expect(registered).not.toContain('keepwarm')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'keep' })).toBeUndefined()
  await band.unmount()
  await done($, { usage: USED })
  await clock.advance(3 * HOUR)
  expect(forks.length).toBe(0)
  expect(store.has('keep:S1')).toBe(false)
  // Nor does it warn about a cold send: cache-tax's guard does.
  await submit($, 'hi')
  expect(logs.length).toBe(1)
})

test('without cache-tax there is a button, and the note is not shown', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { logs } = engine(on)
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'keep' })).toBeDefined()
  expect(logs).toEqual([])
  await band.unmount()
})

// ---------- The cold send ----------

test('a cold send is warned about once, with what it costs and what a warm turn would have; the prompt goes on', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { logs } = engine(on)
  await seed($, 70)
  const r = await submit($, 'hello again')
  expect((r as { drop?: string }).drop).toBeUndefined()
  expect(logs.length).toBe(1)
  // 200k tokens on Opus: a cold write is $4 x 2 a million, a read $0.20 a million.
  expect(logs[0]).toContain('$1.60')
  expect(logs[0]).toContain('$0.04')
  expect(logs[0]).toContain('200,000 tokens')
  await submit($, 'and again')
  expect(logs.length).toBe(1)
})

test('the cold-send warning comes again after the cache was warm in between', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { logs } = engine(on)
  await seed($, 70)
  await submit($, 'one')
  await done($, { usage: null })
  await submit($, 'warm: nothing')
  expect(logs.length).toBe(1)
  await clock.advance(70 * MIN)
  await submit($, 'two')
  expect(logs.length).toBe(2)
})

test('no cold-send warning for a slash command, a command prompt, a plugin prompt, a warm cache or under 50k tokens', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { logs } = engine(on)
  await seed($, 70)
  await submit($, '/wavebar fold')
  await $.prompt.submit({ text: 'x', command: 'review', wait: false, origin: { kind: 'composer' } } as never)
  await submit($, 'from a plugin', { kind: 'plugin' })
  expect(logs).toEqual([])
  await seed($, 70, { tokens: 49_999 })
  await submit($, 'small')
  expect(logs).toEqual([])
  await seed($, 10)
  await submit($, 'warm')
  expect(logs).toEqual([])
})

test('a model the table does not price gets the token count without a price', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { logs } = engine(on)
  await seed($, 70, { model: 'mystery-1' })
  await submit($, 'hi')
  expect(logs.length).toBe(1)
  expect(logs[0]).toContain('200,000 tokens')
  expect(logs[0]).not.toContain('$')
})

test('the band and the card paint no background of their own', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true })
  await seed($, 3 * 24 * 60)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const card = await band.find({ key: 'card' })
  expect(card).toBeDefined()
  const tree = JSON.stringify([card, await band.findAll({ type: 'Box' })])
  expect(tree).not.toContain(BG)
  expect(tree).not.toContain('backgroundColor')
  await band.unmount()
})

// ---------- /keepwarm on warms a cold cache now ----------

const cacheOf = (store: Map<string, unknown>) => store.get('cache:S1') as { lastAt: number }

test('/keepwarm on with a cold cache warms it now, now', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, forks } = engine(on, { forks: [COLD] })
  await seed($, 18 * 60)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await keepwarm($, 'on')).toMatch(/cache is cold, so one ping re-writes it now/)
  await settle()
  expect(forks.length).toBe(1)
  expect(cacheOf(store).lastAt).toBe(NOW)
  expect(await label(band)).toBe('✓')
  expect(recOf(store)).toMatchObject({ on: true, deadline: NOW + 24 * HOUR })
  await band.unmount()
})
