import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { turnCost, usd } from '../hooks/cache-art'
import { dayKey } from '../hooks/days'
import { metricsOf } from '../hooks/metrics'
import type { Spent } from '../types'
import { pingKeptCacheWarm } from '../hooks/register'

/** The brown the band used to paint behind itself. */
const BG = '#24221c'
const NOW = Date.parse('2098-12-31T22:00:00Z')
const MIN = 60_000
const HOUR = 60 * MIN
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const
const BAND = { plugin: 'spendometer', component: 'AbovePrompt', props: PROPS } as const
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

/** What a fork answers: a ping's cache figures, null (the engine sent nothing), or the whole result. */
type Answer = { read: number; write: number } | null | { isAnswered: false; reason: 'nothing-to-fork' | 'aborted' | 'api-error'; status?: number | null; error?: string }
const WARM: Answer = { read: 200000, write: 0 }
const COLD: Answer = { read: 0, write: 200000 }
const BUSY: Answer = { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit' }

type Opts = {
  keep?: boolean
  commands?: string[]
  /** The forks' answers in order; once they run out every fork answers WARM. */
  forks?: Answer[]
  prefill?: Record<string, unknown>
  idThrows?: boolean
  registerThrows?: boolean
  /** Holds each fork until released; `forks.length` says how many were sent. */
  gate?: () => Promise<void>
}

/** The engine beneath the band: a store to inspect, the commands it lists, and what a fork answers. */
const engine = (on: On, opts: Opts = {}) => {
  const store = new Map<string, unknown>(Object.entries(opts.prefill ?? {}))
  if (opts.keep !== undefined) store.set('keep', opts.keep)
  const ran: string[] = []
  const logs: string[] = []
  const forks: number[] = []
  const session = { id: 'S1' }
  const registered: string[] = []
  const answers = [...(opts.forks ?? [])]
  on('session.id', () => { if (opts.idThrows) throw new Error('no id'); return { value: session.id } })
  on('command.register', ($, e) => { if (opts.registerThrows) throw new Error('nope'); registered.push(e.name); return { value: undefined } })
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.delete', ($, e) => { store.delete(e.key); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.compact', ($, e) => ({ messages: e.messages }))
  on('classic.SessionStart', () => ({}))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('ui.log', ($, e) => { logs.push(e.text); return { value: undefined } })
  on('command.list', () => ({ value: (opts.commands ?? []).map(name => ({ name, description: '', source: 'plugin' as const })) }))
  on('command.run', ($, e) => { ran.push(`${e.command} ${e.args}`.trim()); return { text: '' } })
  on('model.fork', async () => {
    forks.push(forks.length)
    if (opts.gate) await opts.gate()
    const a = answers.length ? answers.shift()! : WARM
    if (a === null) return { value: null as never }
    if ('isAnswered' in a) return { value: a as never }
    return {
      value: {
        isAnswered: true as const,
        text: 'warm',
        usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: a.read, cache_creation_input_tokens: a.write },
      },
    }
  })
  return { store, ran, logs, forks, session, registered }
}

const WRAP = { wrapUp: true }
type $ = Parameters<Parameters<typeof test>[1]>[0]

/** A session whose last main-thread request was `idleMin` minutes before the clock's now. */
const seed = async ($: $, idleMin: number, extra: { tokens?: number; model?: string } = {}) => {
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleMin * 60, context_tokens: extra.tokens ?? 200000, model: extra.model ?? 'claude-opus-5-5' })
}

/** The typed command's answer. */
const keepwarm = async ($: $, args: string) => ((await $.command.run({ command: 'keepwarm', args, ...RUN })) as { text: string }).text
const settle = () => new Promise<void>(r => { (globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown }).setTimeout(r, 20) })
const recOf = (store: Map<string, unknown>, id = 'S1') => store.get(`keep:${id}`) as { on?: boolean; deadline?: number; every?: number; at: number } | undefined
const label = async (b: Awaited<ReturnType<$['ui']['mount']>>) => (await b.find({ key: 'keep-warm' }))?.props.label
const submit = ($: $, text: string, origin: { kind: string } = { kind: 'composer' }) => $.prompt.submit({ text, wait: false, origin } as never)

test('the ping rule: a read with next to no write kept the cache; anything else did not', () => {
  const u = (read: number, write: number) => ({ input_tokens: 2, output_tokens: 1, cache_read_input_tokens: read, cache_creation_input_tokens: write })
  expect(pingKeptCacheWarm(u(200000, 0))).toBe(true)
  expect(pingKeptCacheWarm(u(200000, 150))).toBe(true)
  // Nothing read: the prefix was not in the cache.
  expect(pingKeptCacheWarm(u(0, 0))).toBe(false)
  // A write of a tenth of the read or more: the prefix broke and was written again.
  expect(pingKeptCacheWarm(u(200000, 20000))).toBe(false)
  expect(pingKeptCacheWarm(u(0, 200000))).toBe(false)
  expect(pingKeptCacheWarm(null)).toBe(false)
  expect(pingKeptCacheWarm(undefined)).toBe(false)
})

// ---------- The pinger ----------

test('an open window pings 50 idle minutes after the last request; the ping starts the hour again', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on)
  await seed($, 0)
  await keepwarm($, '6h')
  await clock.advance(49 * MIN)
  expect(forks.length).toBe(0)
  await clock.advance(MIN)
  expect(forks.length).toBe(1)
  await clock.advance(30 * MIN)
  // 80 minutes after the last turn, 30 after the ping: warm, with 30 minutes left; the next ping is 50 after the first.
  expect(forks.length).toBe(1)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.findAll({ type: 'Svg' })).map(s => s.props.alt)).toEqual(['Robo, bobbing', 'WARM'])
  expect(await band.find({ text: ' 30m left' })).toBeDefined()
  await band.unmount()
  await clock.advance(20 * MIN)
  expect(forks.length).toBe(2)
})

test('a ping that kept the cache warm adds its cost to the session record, not to the total', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on)
  await seed($, 0)
  await keepwarm($, '6h')
  await clock.advance(50 * MIN)
  // Opus: 2 in at $4, 1 out at $20, 200k read at $0.20, per million.
  const first = stored(store)
  expect(Math.abs(first.pings! - (8 + 20 + 40000) / 1e6)).toBeLessThan(1e-9)
  expect(first.main + first.subs).toBe(0)
  await clock.advance(50 * MIN)
  expect(Math.abs(stored(store).pings! - 2 * (8 + 20 + 40000) / 1e6)).toBeLessThan(1e-9)
})

test('a ping that found the cache gone stops the window with its reason and costs nothing in the record', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, forks } = engine(on, { forks: [COLD] })
  await seed($, 0)
  await keepwarm($, '6h')
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(1)
  expect(await keepwarm($, 'status')).toMatch(/stopped, the ping read 0 and wrote 200k tokens \(\$1\.60\)/)
  expect(store.has('spend:S1')).toBe(false)
  expect(recOf(store)?.deadline).toBeUndefined()
  await clock.advance(3 * HOUR)
  expect(forks.length).toBe(1)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ text: ' COLD ' })).toBeDefined()
  await band.unmount()
})

test('a ping the engine did not send, or that was interrupted, stops the window', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { forks: [null, { isAnswered: false, reason: 'aborted' }] })
  await seed($, 0)
  await keepwarm($, '6h')
  await clock.advance(50 * MIN)
  expect(await keepwarm($, 'status')).toMatch(/stopped, the engine did not send the ping/)
  await keepwarm($, '6h')
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(2)
  expect(await keepwarm($, 'status')).toMatch(/stopped, the ping was interrupted/)
})

test('a 429 is retried after 1, 2 and 4 minutes, then the window stops', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { forks: [BUSY, BUSY, BUSY, BUSY] })
  await seed($, 0)
  await keepwarm($, '3h')
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(1)
  expect(await keepwarm($, 'status')).toMatch(/API busy, ping retry 1 of 3/)
  await clock.advance(7 * MIN)
  expect(forks.length).toBe(4)
  expect(await keepwarm($, 'status')).toBe('keepwarm stopped, the API call failed (429) after 3 retries')
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(4)
})

test('a 429 that clears is retried and the loop goes on', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { forks: [BUSY, WARM] })
  await seed($, 0)
  await keepwarm($, '3h')
  await clock.advance(51 * MIN)
  expect(forks.length).toBe(2)
  expect(await keepwarm($, 'status')).toMatch(/ping in 50m · last ping read 200k/)
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(3)
})

test('a retry that would land within a minute of the cache going cold is not tried', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { forks: [BUSY] })
  await seed($, 0)
  await keepwarm($, '3h every 58m')
  await clock.advance(58 * MIN)
  expect(forks.length).toBe(1)
  expect(await keepwarm($, 'status')).toBe('keepwarm stopped, the API call failed (429)')
})

test('no ping goes out after the deadline', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks, store } = engine(on)
  await seed($, 0)
  await keepwarm($, '30m')
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(0)
  expect(await keepwarm($, 'status')).toBe('keepwarm is off')
  expect(recOf(store)?.deadline).toBeUndefined()
})

test('no ping goes out on a cold cache; the first one comes 50 minutes after the next turn', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on)
  await seed($, 70)
  expect(await keepwarm($, '6h')).toContain('The cache is cold now')
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(0)
  expect(await keepwarm($, 'status')).toMatch(/cold now, first ping 50m after the next turn/)
  await done($, { usage: null })
  await clock.advance(49 * MIN)
  expect(forks.length).toBe(0)
  await clock.advance(MIN)
  expect(forks.length).toBe(1)
})

test('with nothing to fork the window waits for the next turn instead of stopping', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on, { forks: [{ isAnswered: false, reason: 'nothing-to-fork' }] })
  await seed($, 0)
  await keepwarm($, '6h')
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(1)
  expect(await keepwarm($, 'status')).toMatch(/nothing to fork yet, first ping after the next turn/)
  await clock.advance(5 * MIN)
  expect(forks.length).toBe(1)
  await done($, { usage: null })
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(2)
  expect(await keepwarm($, 'status')).toMatch(/ping in 50m · last ping read 200k/)
})

test('a new turn resets the countdown, and a subagent turn does not', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on)
  await seed($, 0)
  await keepwarm($, '6h')
  await clock.advance(40 * MIN)
  await done($, { usage: null, agentId: 'sub1' })
  await clock.advance(10 * MIN)
  expect(forks.length).toBe(1)
  await done($, { usage: null })
  await clock.advance(40 * MIN)
  expect(forks.length).toBe(1)
  await clock.advance(10 * MIN)
  expect(forks.length).toBe(2)
})

test('a compaction stops the pings until the next turn, whether session.compact arrives or only a shorter transcript', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { forks } = engine(on)
  stopStep(on)
  await seed($, 0)
  await keepwarm($, '6h')
  await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'summary', toolUses: [] }] } as never)
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(0)
  expect(await keepwarm($, 'status')).toMatch(/waiting for the first turn after compaction/)
  await done($, { usage: null })
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(1)
  // The same without session.compact: a request over under half the messages of the one before.
  for await (const c of $.turn.step({ turnId: 'A', index: 0, model: 'claude-opus-5-5', messageCount: 60 })) void c
  for await (const c of $.turn.step({ turnId: 'A', index: 1, model: 'claude-opus-5-5', messageCount: 4 })) void c
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(1)
  await done($, { usage: null })
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(2)
})

// ---------- Races ----------

test('a main request while a ping is out supersedes its cold reply', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const held = hold()
  const { forks } = engine(on, { forks: [COLD, WARM], gate: held.gate })
  stopStep(on)
  await seed($, 0)
  await keepwarm($, '3h')
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(1)
  await clock.advance(MIN)
  for await (const c of $.turn.step({ turnId: 'next', index: 0, model: 'claude-opus-5-5', messageCount: 5 })) void c
  held.release()
  await settle()
  expect(await keepwarm($, 'status')).not.toMatch(/stopped/)
  await done($, { usage: null })
  await clock.advance(50 * MIN)
  expect(forks.length).toBe(2)
})

test('a ping out when the window is extended sends no second ping, and its cold reply still stops the window', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const held = hold()
  const { forks } = engine(on, { forks: [COLD, WARM], gate: held.gate })
  await seed($, 0)
  await keepwarm($, '3h')
  await clock.advance(50 * MIN)
  await keepwarm($, '6h')
  await clock.advance(5000)
  expect(forks.length).toBe(1)
  held.release()
  await settle()
  expect(forks.length).toBe(1)
  expect(await keepwarm($, 'status')).toMatch(/stopped, the ping read 0 and wrote 200k/)
})

test('an off while a window is being opened wins: a turn that finishes after it opens nothing', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, forks } = engine(on, { keep: true })
  stopStep(on)
  await seed($, 0)
  for await (const c of $.turn.step({ turnId: 'T', index: 0, model: 'claude-opus-5-5', messageCount: 4 })) void c
  await keepwarm($, 'off')
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBeUndefined()
  expect(recOf(store)?.on).toBe(false)
  await clock.advance(2 * HOUR)
  expect(forks.length).toBe(0)
})

// ---------- The switch, the button and the command ----------

test('bare /keepwarm switches this conversation on with a window of 6 hours; the default is left alone', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, registered } = engine(on)
  await seed($, 0)
  expect(registered).toContain('keepwarm')
  const text = await keepwarm($, '')
  expect(text).toContain('keepwarm is on for this conversation')
  expect(text).toContain('6h00m')
  expect(recOf(store)).toMatchObject({ on: true, deadline: NOW + 6 * HOUR })
  expect(recOf(store)?.every).toBeUndefined()
  expect(store.has('keep')).toBe(false)
  expect(await keepwarm($, 'status')).toMatch(/^keepwarm 6h00m left · ping in 50m$/)
})

test('a duration opens a one-off window and leaves the switch as it was; every is a testing knob kept in the record', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { prefill: { 'keep:S1': { on: false, at: NOW } } })
  await seed($, 0)
  expect(await keepwarm($, '1h30m')).toContain('window of 1h30m')
  expect(recOf(store)).toMatchObject({ on: false, deadline: NOW + 90 * MIN })
  expect(await keepwarm($, '90m every 2m')).toContain('a ping 2m after each idle stretch')
  expect(recOf(store)).toMatchObject({ on: false, deadline: NOW + 90 * MIN, every: 2 * MIN })
  expect(await keepwarm($, '2h')).toContain('window of 2h00m')
  expect(recOf(store)?.every).toBeUndefined()
  expect(await keepwarm($, '2h every 60m')).toBe('every takes a period from 1m to 59m')
  expect(await keepwarm($, '2h every')).toBe('every takes a period from 1m to 59m')
})

test('always turns the default and this conversation on, off turns both off and closes the window', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on)
  await seed($, 0)
  expect(await keepwarm($, 'always')).toContain('keepwarm is on for this conversation and for new ones')
  expect(store.get('keep')).toBe(true)
  expect(recOf(store)).toMatchObject({ on: true, deadline: NOW + 6 * HOUR })
  expect(await keepwarm($, 'off')).toContain('keepwarm is off')
  expect(store.get('keep')).toBe(false)
  expect(recOf(store)?.on).toBe(false)
  expect(recOf(store)?.deadline).toBeUndefined()
  expect(await keepwarm($, 'status')).toBe('keepwarm is off')
})

test('status says what is left, the next ping and the last one; on without a window and stopped read differently', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on, { prefill: { 'keep:S1': { on: true, at: NOW } } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(await keepwarm($, 'status')).toBe('keepwarm is on, no window open: the next turn opens one')
  await keepwarm($, '3h')
  expect(await keepwarm($, 'status')).toBe('keepwarm 3h00m left · waiting for the first turn')
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: 0, context_tokens: 200000, model: 'claude-opus-5-5' })
  await clock.advance(50 * MIN)
  expect(await keepwarm($, 'status')).toMatch(/^keepwarm 2h10m left · ping in 50m · last ping read 200k \$0\.04$/)
})

test('anything else is answered with the usage line and changes nothing', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on)
  await seed($, 0)
  for (const args of ['soon', '0m', '5', '6h now']) expect(await keepwarm($, args)).toBe('keepwarm takes a window such as 6h or 90m, or always, off, or status')
  expect(store.has('keep:S1')).toBe(false)
})

test('the button follows an open window a typed duration opened, and follows off', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(band)).toBe('🧊 Keep warm')
  await keepwarm($, '90m')
  expect(await label(band)).toBe('🔥 Keep warm')
  await clock.advance(2 * HOUR)
  expect(await label(band)).toBe('🧊 Keep warm')
  await keepwarm($, '3h')
  expect(await label(band)).toBe('🔥 Keep warm')
  await keepwarm($, 'off')
  expect(await label(band)).toBe('🧊 Keep warm')
  await keepwarm($, '')
  expect(await label(band)).toBe('🔥 Keep warm')
  await band.unmount()
})

test('pressing the button while it is on turns the switch off and stops the window; while off it turns on and opens 6 hours', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, forks } = engine(on, { keep: true })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(band)).toBe('🔥 Keep warm')

  await band.press({ key: 'keep-warm' })
  expect(await label(band)).toBe('🧊 Keep warm')
  expect(recOf(store)?.on).toBe(false)
  expect(recOf(store)?.deadline).toBeUndefined()
  // The default for new conversations is not touched by the button.
  expect(store.get('keep')).toBe(true)

  await band.press({ key: 'keep-warm' })
  expect(await label(band)).toBe('🔥 Keep warm')
  expect(recOf(store)).toMatchObject({ on: true, deadline: NOW + 6 * HOUR })
  expect(forks.length).toBe(0)

  // A window opened by a typed duration, switch off: the button is 🔥, and pressing it stops the window.
  await keepwarm($, 'off')
  await keepwarm($, '90m')
  expect(await label(band)).toBe('🔥 Keep warm')
  await band.press({ key: 'keep-warm' })
  expect(await label(band)).toBe('🧊 Keep warm')
  expect(await keepwarm($, 'status')).toBe('keepwarm is off')
  await band.unmount()
})

test('the tooltip no longer names cache-tax', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(JSON.stringify(await band.findAll({ type: 'Text' }))).not.toContain('cache-tax')
  await band.unmount()
})

test('two conversations in one store: a press in A leaves B as it was', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, session } = engine(on, { keep: true })
  await seed($, 18)
  const a = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await a.press({ key: 'keep-warm' })
  expect(await label(a)).toBe('🧊 Keep warm')
  await a.unmount()

  // Conversation B has no choice of its own: it reads the default.
  session.id = 'S2'
  const b = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await label(b)).toBe('🔥 Keep warm')
  expect(store.has('keep:S2')).toBe(false)
  await b.unmount()
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
  expect(await shown()).toBe('🔥 Keep warm')
  session.id = 'S2'
  expect(await shown()).toBe('🧊 Keep warm')
})

test('the switch shows in the terminal too, and before the first reply', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await label(band)).toBe('🧊 Keep warm')
  await band.unmount()
})

test('the first session ever stores nothing; a later session leaves a saved choice alone', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, ran } = engine(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  expect(store.has('keep')).toBe(false)
  expect(store.has('keep:S1')).toBe(false)
  expect(ran).toEqual([])
  store.set('keep', false)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(store.get('keep')).toBe(false)
})

test('with the switch on, a turn that reached the cache renews the window to 6 hours, and never shortens a longer one', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { prefill: { 'keep:S1': { on: true, at: NOW } } })
  await seed($, 18)
  // A turn that reported no usage touched nothing: no window.
  await done($, { usage: null })
  expect(recOf(store)?.deadline).toBeUndefined()
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 6 * HOUR)
  await clock.advance(4 * HOUR)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 10 * HOUR)
  await keepwarm($, '24h')
  await clock.advance(HOUR)
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBe(NOW + 4 * HOUR + 24 * HOUR)
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
  expect(recOf(store)?.deadline).toBe(NOW + 6 * HOUR)
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
  const { forks } = engine(on, { prefill: { 'keep:S1': { deadline: NOW - MIN, at: NOW - HOUR } } })
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
  expect(recOf(store, 'S2')?.deadline).toBe(NOW + 2 * HOUR + 6 * HOUR)
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
  const { store } = engine(on, { idThrows: true })
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
  expect(store.get('keep')).toBe(true)
})

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
  expect(await band.find({ key: 'keep-warm' })).toBeUndefined()
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
  expect(await band.find({ key: 'keep-warm' })).toBeDefined()
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

/** Holds each fork until released. */
function hold() {
  const releases: Array<() => void> = []
  let first = true
  return {
    gate: async () => {
      if (!first) return
      first = false
      await new Promise<void>(r => { releases.push(r) })
    },
    release: () => { for (const r of releases) r() },
  }
}
test('Wrap up runs the debrief; its turn stops the window and renews nothing while the switch stays on', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, ran, forks } = engine(on, { keep: true, commands: ['debrief'], prefill: WRAP })
  stopStep(on)
  await seed($, 18)
  await keepwarm($, '6h')
  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160 } })
  expect((await band.find({ key: 'wrap-up' }))?.props.label).toBe('🎌 Wrap up')

  await band.press({ key: 'wrap-up' })
  expect(ran).toEqual(['debrief'])
  expect((await band.find({ key: 'wrap-up' }))?.props.label).toBe('🎌 Wrapping up…')
  // A second press while it runs asks for nothing more.
  await band.press({ key: 'wrap-up' })
  expect(ran).toEqual(['debrief'])

  // The debrief's own turn starts and ends; only then is the window stopped.
  for await (const c of $.turn.step({ turnId: 'T9', index: 0, model: 'claude-opus-5-5', messageCount: 4 })) void c
  expect(recOf(store)?.deadline).toBe(NOW + 6 * HOUR)
  await done($, { usage: USED })
  expect(ran).toEqual(['debrief'])
  expect(recOf(store)?.deadline).toBeUndefined()
  expect(recOf(store)?.on).toBeUndefined()
  expect(store.get('keep')).toBe(true)
  expect(await keepwarm($, 'status')).toBe('keepwarm stopped, wrapped up')
  await clock.advance(3 * HOUR)
  expect(forks.length).toBe(0)
  expect((await band.find({ key: 'wrap-up' }))?.props.label).toBe('🎌 Wrap up')
  // The switch stays on: the next ordinary turn opens a window again.
  await done($, { usage: USED })
  expect(recOf(store)?.deadline).toBeGreaterThan(NOW)
  await band.unmount()
})

test('a turn already running when Wrap up is pressed does not end the conversation early', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = engine(on, { keep: true, commands: ['debrief'], prefill: WRAP })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'wrap-up' })
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ reason: 'answer', answer: 'ok', usage: null, durationMs: 1000 })
  await clock.advance(5000)
  expect(ran).toEqual(['debrief'])
  await band.unmount()
})

test('with keep-warm off, Wrap up only runs the debrief; without the debrief skill there is no button', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = engine(on, { keep: false, commands: ['debrief'], prefill: WRAP })
  on('turn.step', async function* ($, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'wrap-up' })
  for await (const c of $.turn.step({ turnId: 'T9', index: 0, model: 'claude-opus-5-5', messageCount: 4 })) void c
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ reason: 'answer', answer: 'ok', usage: null, durationMs: 1000 })
  await clock.advance(5000)
  expect(ran).toEqual(['debrief'])
  await band.unmount()
})

test('without the debrief skill there is no Wrap up button', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, prefill: WRAP })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
  await band.unmount()
})

const USED = { model: 'claude-opus-5-5', input_tokens: 1e6, output_tokens: 1e6, cache_read_input_tokens: 2e6, cache_creation_input_tokens: 1e6 }
const done = ($: Parameters<Parameters<typeof test>[1]>[0], extra: object) =>
  ($.turn.complete as (e: unknown) => Promise<unknown>)({ reason: 'answer', answer: 'ok', durationMs: 1000, ...extra })

test('a turn is priced at list prices, with cache writes at the 1-hour rate', () => {
  // Opus 5.5: 4 in + 20 out + 2 x 0.20 read + 8 write, per million.
  expect(usd(turnCost(USED) ?? -1)).toBe(usd(32.4))
  expect(usd(turnCost({ ...USED, model: 'claude-haiku-5-5' }) ?? -1)).toBe(usd(0.5 + 2.5 + 0.1 + 1))
  // The turn's model wins; the fallback prices a turn that names none.
  expect(usd(turnCost({ ...USED, model: null }, 'claude-sonnet-5-5') ?? -1)).toBe(usd(2 + 10 + 0.4 + 4))
  expect(turnCost({ ...USED, model: 'some-other-model' })).toBe(null)
  expect(turnCost(null)).toBe(null)
})

test("the band adds up the conversation's cost, the main session's and its subagents'", async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'spend' })).toBeUndefined()

  await done($, { usage: USED })
  expect(await band.find({ text: '≈$32.40' })).toBeDefined()
  await done($, { usage: { ...USED, model: 'claude-haiku-5-5' }, agentId: 'sub1' })
  expect(await band.find({ text: '≈$36.50' })).toBeDefined()
  // A turn that reports no usage, or a model the table does not price, adds nothing.
  await done($, { usage: null })
  await done($, { usage: { ...USED, model: 'some-other-model' } })
  expect(await band.find({ text: '≈$36.50' })).toBeDefined()
  await band.unmount()
})

test('the cost command answers with the line a debrief can quote, and Wrap up still runs the debrief', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { ran } = engine(on, { keep: true, commands: ['debrief'], prefill: WRAP })
  const cost = async () => ((await $.command.run({ command: 'spendometer', args: 'cost', ...RUN })) as { text: string }).text
  await seed($, 18)
  // Nothing spent yet: the command says so rather than printing zeros.
  expect(await cost()).toBe('no cost recorded for this conversation yet')
  await done($, { usage: USED })
  await done($, { usage: { ...USED, model: 'claude-haiku-5-5' }, agentId: 'sub1' })
  // A command's answer is what the model reads; a log line is not.
  expect(await cost()).toBe(
    'this conversation has cost about $36.50 so far (main session $32.40, subagents $4.10). ' +
      'An estimate from token counts at list prices; not a bill.',
  )
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await band.press({ key: 'wrap-up' })
  // The cost is asked for first, then the debrief.
  expect(ran).toEqual(['spendometer cost', 'debrief'])
  await band.unmount()
})

const DAY = 24 * 60 * MIN
const FRESH = (main: number, subs = 0, last = 0, at = NOW) => ({ main, subs, last, at })
const figures = (store: Map<string, unknown>) => {
  const s = store.get('spend:S1') as { main: number; subs: number; last: number; at: number }
  expect(s.at).toBe(NOW)
  return [usd(s.main), usd(s.subs), usd(s.last)]
}

test('the cost is kept in the store per session and shown straight after a restart', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, prefill: { 'spend:S1': FRESH(12.4, 0, 0.35) } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160 } })
  expect(await band.find({ text: '≈$12.40' })).toBeDefined()
  expect(await band.find({ text: ' · last $0.35' })).toBeDefined()
  await band.unmount()
})

test('the store holds main, subs, last and when; last is the latest main turn plus subagent turns since the one before', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  await seed($, 18)
  const HAIKU = { ...USED, model: 'claude-haiku-5-5' }
  // A subagent finishes before the first main turn: it counts toward that turn's last.
  await done($, { usage: HAIKU, agentId: 'sub1' })
  await done($, { usage: USED })
  expect(figures(store)).toEqual(['$32.40', '$4.10', '$36.50'])
  await done($, { usage: USED })
  expect(figures(store)).toEqual(['$64.80', '$4.10', '$32.40'])

  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160 } })
  expect(await band.find({ text: '≈$68.90' })).toBeDefined()
  expect(await band.find({ text: ' · last $32.40' })).toBeDefined()
  await band.unmount()
})

type Metered = { turns?: number; paidTurns?: number; readTok?: number; inTok?: number; ctxPrev?: number; growth?: number; byType?: Record<string, number> }
const metered = (store: Map<string, unknown>) => store.get('spend:S1') as Metered

test('main turns add up the metric figures: priced turns, their cost, cache reads and all input; the context grows', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, prefill: { 'spend:S1': { ...FRESH(1, 0, 0), ctxPrev: 150000 } } })
  await seed($, 18)
  // 1M fresh + 2M read + 1M written = 4M input, 2M of it read; the engine reports 200k of context (50k up on last turn).
  await done($, { usage: USED })
  let m = metered(store)
  expect(m.turns).toBe(1)
  expect(usd(m.paidTurns ?? -1)).toBe(usd(32.4))
  expect(m.readTok).toBe(2e6)
  expect(m.inTok).toBe(4e6)
  expect(m.ctxPrev).toBe(200000)
  expect(m.growth).toBe(50000)
  // The same context again: no growth to average in, the figure stays.
  await done($, { usage: USED })
  m = metered(store)
  expect(m.turns).toBe(2)
  expect(m.readTok).toBe(4e6)
  expect(m.inTok).toBe(8e6)
  expect(m.growth).toBe(50000)
  // An unpriced model adds no turn, and a turn with no usage none either.
  await done($, { usage: { ...USED, model: 'some-other-model' } })
  await done($, { usage: null })
  expect(metered(store).turns).toBe(2)
})

test('a subagent adds its cost to its type, from the crew, or to agent when the band never saw it start', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.subagentType}` }))
  await seed($, 18)
  const HAIKU = { ...USED, model: 'claude-haiku-5-5' }
  await $.agent.spawn({ tool_use_id: 't-Explore', prompt: 'p', description: 'd', subagentType: 'Explore', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  await done($, { usage: HAIKU, agentId: 'a-Explore' })
  await done($, { usage: HAIKU, agentId: 'a-Explore' })
  await done($, { usage: HAIKU, agentId: 'stranger' })
  const by = metered(store).byType!
  expect(usd(by.Explore)).toBe(usd(8.2))
  expect(usd(by.agent)).toBe(usd(4.1))
  // Subagent turns touch neither the turn count nor the input figures.
  expect(metered(store).turns).toBeUndefined()
  expect(metered(store).inTok).toBeUndefined()
})

type Delegated = Metered & { byModel?: Record<string, number>; totTok?: number; subsAtMain?: number; spans?: [number, number][]; subs: number }
const spawnOf = (type: string) =>
  ({ tool_use_id: `t-${type}`, prompt: 'p', description: 'd', subagentType: type, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false }) as never

test('turns add up per model and all tokens; a subagent turn also adds what it would have cost at the main model', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  on('agent.spawn', ($, e) => ({ model: 'claude-haiku-5-5', agentId: `a-${e.subagentType}` }))
  await seed($, 18)
  const HAIKU = { ...USED, model: 'claude-haiku-5-5' }
  await done($, { usage: USED })
  await $.agent.spawn(spawnOf('Explore'))
  await done($, { usage: HAIKU, agentId: 'a-Explore' })
  const m = store.get('spend:S1') as Delegated
  expect(Object.keys(m.byModel ?? {}).sort()).toEqual(['haiku', 'opus'])
  expect(usd(m.byModel!.opus)).toBe(usd(32.4))
  expect(usd(m.byModel!.haiku)).toBe(usd(4.1))
  // 5M tokens a turn: 1M fresh, 1M out, 2M read, 1M written.
  expect(m.totTok).toBe(10e6)
  // The haiku turn's tokens at opus prices: 32.4 against 4.1 spent, so 28.3 saved.
  expect(usd(m.subsAtMain! - m.subs)).toBe(usd(28.3))
  // An unpriced model adds nothing to any of them.
  await done($, { usage: { ...USED, model: 'some-other-model' } })
  expect((store.get('spend:S1') as Delegated).totTok).toBe(10e6)
})

test('a subagent on the main model saves nothing, and a dearer one never saves below nothing', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  on('agent.spawn', ($, e) => ({ model: 'claude-opus-5-5', agentId: `a-${e.subagentType}` }))
  await seed($, 18)
  await done($, { usage: { ...USED, model: 'claude-sonnet-5-5' } })
  // The main model is sonnet now; an opus subagent costs more than the same tokens on sonnet.
  await $.agent.spawn(spawnOf('Plan'))
  await done($, { usage: USED, agentId: 'a-Plan' })
  let m = store.get('spend:S1') as Delegated
  expect(usd(m.subs)).toBe(usd(32.4))
  expect(usd(m.subsAtMain!)).toBe(usd(32.4))
  // And a sonnet subagent beside a sonnet main model: its cost equals what it would have been.
  await done($, { usage: { ...USED, model: 'claude-sonnet-5-5' }, agentId: 'a-Plan' })
  m = store.get('spend:S1') as Delegated
  expect(usd(m.subsAtMain! - m.subs)).toBe(usd(0))
})

test('run intervals: from the spawn to the last turn of each subagent, overlapping ones counted once in the wall time', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  on('agent.spawn', ($, e) => ({ model: 'claude-haiku-5-5', agentId: `a-${e.subagentType}` }))
  await seed($, 18)
  const HAIKU = { ...USED, model: 'claude-haiku-5-5' }
  await $.agent.spawn(spawnOf('Explore'))
  await clock.advance(1 * MIN)
  await $.agent.spawn(spawnOf('Plan'))
  await clock.advance(1 * MIN)
  await done($, { usage: HAIKU, agentId: 'a-Explore' })
  await clock.advance(2 * MIN)
  // Explore's second turn extends its interval; it does not add one.
  await done($, { usage: HAIKU, agentId: 'a-Explore' })
  await clock.advance(1 * MIN)
  await done($, { usage: HAIKU, agentId: 'a-Plan' })
  const spans = (store.get('spend:S1') as Delegated).spans!
  expect(spans).toEqual([[NOW, NOW + 4 * MIN], [NOW + 1 * MIN, NOW + 5 * MIN]])
  const m = metricsOf(store.get('spend:S1') as Spent, 0)!
  expect(m.deleg!.workMs).toBe(8 * MIN)
  expect(m.deleg!.wallMs).toBe(5 * MIN)
})

test('records from before the by-model figures are read as they are; junk in the new fields is dropped', async ($, on) => {
  mock.clock(on, { now: NOW })
  const old = { main: 3, subs: 1, last: 0.5, at: NOW, byModel: { opus: 1, x: 'y' }, totTok: 'z', subsAtMain: null, spans: [[1, 2], [3], 'x', [4, NaN], [5, 9]] }
  const { store } = engine(on, { keep: true, prefill: { 'spend:S1': old } })
  await seed($, 18)
  await done($, { usage: USED })
  const m = store.get('spend:S1') as Delegated
  expect(usd(m.byModel!.opus)).toBe(usd(33.4))
  expect(Object.keys(m.byModel!)).toEqual(['opus'])
  expect(m.totTok).toBe(5e6)
  expect(m.subsAtMain).toBeUndefined()
  expect(m.spans).toEqual([[1, 2], [5, 9]])
})

test('a record from before the metric figures is read as it is and gains them as turns finish; junk fields are dropped', async ($, on) => {
  mock.clock(on, { now: NOW })
  const old = { main: 3, subs: 1, last: 0.5, at: NOW, turns: 'x', byType: { a: 1, b: 'x' }, growth: null }
  const { store } = engine(on, { keep: true, prefill: { 'spend:S1': old } })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160 } })
  expect(await band.find({ text: '≈$4.00' })).toBeDefined()
  await band.unmount()
  await done($, { usage: USED })
  const m = metered(store)
  // The old spend stays in the total, but the average only counts the turns tracked since.
  expect(m.turns).toBe(1)
  expect(usd(m.paidTurns ?? -1)).toBe(usd(32.4))
  expect(m.byType).toEqual({ a: 1 })
  expect(m.growth).toBeUndefined()
  expect(m.ctxPrev).toBe(200000)
})

test('the wide open card shows the metric row once the record has figures', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, prefill: { 'spend:S1': { ...FRESH(2, 1, 0.5), turns: 4, paidTurns: 2, readTok: 90, inTok: 100, ctxPrev: 100000, growth: 5000, byType: { Explore: 1 } } } })
  await seed($, 18)
  await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160, maxRows: 30 } }).then(async band => {
    await band.press({ key: 'cache-fold' })
    const svgs = JSON.stringify(await band.findAll({ type: 'Svg' }))
    for (const t of ['CACHE HIT', 'PER TURN', 'BY MODEL', 'DELEGATION']) expect(svgs).toContain(t)
    expect(svgs).toContain('90%')
    await band.unmount()
  })
})

test('without a last turn the last part is left out; the compact row never shows it', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, prefill: { 'spend:S1': FRESH(2, 1, 0) } })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160 } })
  expect(await band.find({ text: '≈$3.00' })).toBeDefined()
  expect(await band.find({ key: 'spend-last' })).toBeUndefined()
  await band.unmount()

  await done($, { usage: { ...USED, model: 'claude-haiku-5-5' } })
  const tight = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 60 } })
  expect(await tight.find({ text: '≈$7.10' })).toBeDefined()
  expect(await tight.find({ key: 'spend-last' })).toBeUndefined()
  await tight.unmount()
})

test('two sessions keep separate totals', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { session } = engine(on, { keep: true })
  await seed($, 18)
  await done($, { usage: USED })
  session.id = 'S2'
  await done($, { usage: { ...USED, model: 'claude-haiku-5-5' } })
  const b = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await b.find({ text: '≈$4.10' })).toBeDefined()
  await b.unmount()
  session.id = 'S1'
  const a = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await a.find({ text: '≈$32.40' })).toBeDefined()
  await a.unmount()
})

test('an entry older than 30 days is pruned at session start; a recent one is kept', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, {
    keep: true,
    prefill: { 'spend:old': FRESH(1, 0, 0, NOW - 31 * DAY), 'spend:recent': FRESH(1, 0, 0, NOW - 29 * DAY), other: 'x' },
  })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(store.has('spend:old')).toBe(false)
  expect(store.has('spend:recent')).toBe(true)
  expect(store.get('other')).toBe('x')
})

test('a session id that cannot be read leaves the band without a cost and throws nothing', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, idThrows: true })
  await seed($, 18)
  await done($, { usage: USED })
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'spend' })).toBeUndefined()
  await band.unmount()
})

test('Wrap up is absent by default and appears after /spendometer wrapup on', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, commands: ['debrief'] })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
  const r = await $.command.run({ command: 'spendometer', args: 'wrapup on', ...RUN })
  expect(store.get('wrapUp')).toBe(true)
  expect(JSON.stringify(r)).toContain('wrapup')
  expect(await band.find({ key: 'wrap-up' })).toBeDefined()
  await $.command.run({ command: 'spendometer', args: 'wrapup off', ...RUN })
  expect(store.get('wrapUp')).toBe(false)
  expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
  await band.unmount()
})

test('/spendometer registers itself, reports status, and answers anything else with usage', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, registered } = engine(on, { keep: true })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(registered).toContain('spendometer')
  const text = async (args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
  const status = await text('')
  expect(status).toContain('wrapup: off')
  expect(status).toContain('hold: on')
  expect(await text('status')).toBe(status)
  await text('hold off')
  expect(store.get('hold')).toBe(false)
  expect(await text('status')).toContain('hold: off')
  await text('hold on')
  expect(store.get('hold')).toBe(true)
  const usage = await text('nonsense')
  expect(usage).toContain('Usage')
  expect(usage.includes('\n')).toBe(false)
})

test('a command that fails to register does not stop the rest of session start', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, registerThrows: true })
  const registered: string[] = []
  on('tool.register', ($, e) => { registered.push(e.name); return { value: { tool: `mcp__spendometer__${e.name}` } } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(registered).toEqual(['progress'])
})

const stored = (store: Map<string, unknown>) => store.get('spend:S1') as { main: number; subs: number; pings?: number; saved?: number }
/** The main thread's request number `index`: the engine beneath just stops. */
const step = async ($: Parameters<Parameters<typeof test>[1]>[0], index: number) => {
  for await (const c of $.turn.step({ turnId: 'T' + index, index, model: 'claude-opus-5-5', messageCount: 4 })) void c
}
const stopStep = (on: On) =>
  on('turn.step', async function* ($, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

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

test('/spendometer progress lists the themes, sets one account-wide, and answers a wrong id with the list', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const text = async (args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
  expect(await text('status')).toContain('progress: comet')
  const list = await text('progress')
  expect(list).toContain('- **comet** (in use, default): a comet')
  for (const id of ['calm', 'vitals', 'bridge', 'wake', 'dial']) expect(list).toContain(`\n- ${id}: `)
  expect(store.has('progressTheme')).toBe(false)
  expect(await text('progress dial')).toBe('progress: dial')
  expect(store.get('progressTheme')).toBe('dial')
  expect(await text('status')).toContain('progress: dial')
  expect(await text('progress')).toContain('- **dial** (in use): ')
  const wrong = await text('progress nonsense')
  expect(wrong).toContain('- **dial** (in use): ')
  expect(wrong).toContain('calm')
  expect(store.get('progressTheme')).toBe('dial')
  expect(await text('nonsense')).toContain('progress [id]')
})

test('an unknown saved progress theme is the default', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, prefill: { progressTheme: 'gone' } })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const text = async (args: string) => ((await $.command.run({ command: 'spendometer', args, ...RUN })) as { text: string }).text
  expect(await text('status')).toContain('progress: comet')
  expect(await text('progress')).toContain('- **comet** (in use, default)')
})
