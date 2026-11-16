import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = Date.parse('2098-12-31T22:00:00Z')
const MIN = 60_000
const WINDOWS = [
  { kind: 'five_hour', percentUsed: 18, resetsAt: '2099-01-01T01:29:00Z' },
  { kind: 'seven_day', percentUsed: 1 },
]
const BAND = {
  plugin: 'wavebar',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 160, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

/** An engine that never delivers session.start or classic.SessionStart to the band: only the store and the usage answer. */
const engine = (on: On, store: Map<string, unknown>, every: { n: number } = { n: 0 }, broken = false) => {
  on('clock.now', () => ({ value: NOW }))
  on('clock.after', () => ({ value: () => {} }))
  on('clock.every', () => { every.n++; return { value: () => {} } })
  on('session.id', () => ({ value: 'S1' }))
  on('store.get', ($, e) => { if (broken) throw new Error('no store'); return { value: store.get(e.key) } })
  on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.delete', ($, e) => { store.delete(e.key); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.usage', () => { if (broken) throw new Error('no usage'); return { value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: WINDOWS } } })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('classic.SessionStart', () => ({}))
  on('command.list', () => ({ value: [] }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
}

const cacheOf = (idleMin: number) => ({ lastAt: NOW - idleMin * MIN, tokens: 200000, window: 1000000, model: 'claude-opus-5-5' })

test('after a resume that never reached the band, the stored facts and the engine give both windows and the cache', async ($, on) => {
  engine(on, new Map([['cache:S1', cacheOf(18)]]))
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ text: ' 99% left' })).toBeDefined()
  expect(await band.find({ text: ' 82% left' })).toBeDefined()
  expect(JSON.stringify(await band.findAll({ type: 'Svg' }))).toContain('WARM')
  await band.unmount()
})

test('a stored cache that has gone cold shows COLD', async ($, on) => {
  engine(on, new Map([['cache:S1', cacheOf(90)]]))
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ text: ' COLD ' })).toBeDefined()
  await band.unmount()
})

test('a turn writes the cache facts to the store, and they survive a /clear: the next conversation has another id', async ($, on) => {
  const store = new Map<string, unknown>()
  engine(on, store)
  on('turn.step', async function* ($, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  for await (const c of $.turn.step({ turnId: 'T1', index: 0, model: 'claude-opus-5-5', messageCount: 2 })) void c
  const kept = store.get('cache:S1') as { lastAt: number; model: string | null }
  expect(kept.lastAt).toBe(NOW)

  await $.session.end({ reason: 'clear', sessionId: 'S1', resume: { id: 'S1' } } as never)
  // Kept on purpose: warm/cold must still be known after a restart, before the first request. Old entries are pruned after a month.
  expect(store.has('cache:S1')).toBe(true)
})

test('a cache entry not written for a month is pruned at session start; a recent one stays', async ($, on) => {
  const store = new Map<string, unknown>([['cache:old', { ...cacheOf(0), lastAt: NOW - 31 * 24 * 60 * MIN }], ['cache:recent', { ...cacheOf(0), lastAt: NOW - 2 * 24 * 60 * MIN }]])
  engine(on, store)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(store.has('cache:old')).toBe(false)
  expect(store.has('cache:recent')).toBe(true)
})

test('the redraw tick is armed once, however many times the band renders, and also with no session.start', async ($, on) => {
  const every = { n: 0 }
  engine(on, new Map(), every)
  for (let i = 0; i < 4; i++) {
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.unmount()
  }
  expect(every.n).toBe(1)
})

test('a failing usage or store read leaves the band drawing what it has', async ($, on) => {
  engine(on, new Map(), { n: 0 }, true)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ text: 'USAGE · waiting for the first reply' })).toBeDefined()
  await band.unmount()
})
