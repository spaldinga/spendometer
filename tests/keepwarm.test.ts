import { expect, mock, test } from 'claude-code/testing'
import type { On, Plugin } from 'claude-code'

import { turnCost, usd } from '../hooks/cache-art'
import { dayKey } from '../hooks/days'
import { metricsOf } from '../hooks/metrics'
import type { Spent } from '../types'
import { pingKeptCacheWarm } from '../hooks/register'

/** The brown the band used to paint behind itself. */
const BG = '#24221c'
const NOW = Date.parse('2098-12-31T22:00:00Z')
const MIN = 60_000
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const
const BAND = { plugin: 'wavebar', component: 'AbovePrompt', props: PROPS } as const
const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const

/** Stands in for cache-tax: another mod whose /ping forks the main thread, as a keep-warm ping does. */
const pinger: Plugin = {
  name: 'pinger',
  register(on) {
    on('command.run', { command: 'ping' }, async $ => {
      await $.model.fork({ prompt: 'Reply with the single word: warm' })
      return { text: '' }
    })
  },
}

type Fork ={ read: number; write: number } | null

/** The engine beneath the band: a store to inspect, cache-tax's commands, and what a fork answers. */
const engine = (on: On, opts: { keep?: boolean; commands?: string[]; fork?: Fork; prefill?: Record<string, unknown>; idThrows?: boolean; registerThrows?: boolean } = {}) => {
  const store = new Map<string, unknown>(Object.entries(opts.prefill ?? {}))
  if (opts.keep !== undefined) store.set('keep', opts.keep)
  const ran: string[] = []
  const session = { id: 'S1' }
  const registered: string[] = []
  on('session.id', () => { if (opts.idThrows) throw new Error('no id'); return { value: session.id } })
  on('command.register', ($, e) => { if (opts.registerThrows) throw new Error('nope'); registered.push(e.name); return { value: undefined } })
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('store.delete', ($, e) => { store.delete(e.key); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('classic.SessionStart', () => ({}))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.list', () => ({
    value: (opts.commands ?? ['keepwarm', 'cache-tax']).map(name => ({ name, description: '', source: 'plugin' as const })),
  }))
  on('command.run', ($, e) => { ran.push(`${e.command} ${e.args}`.trim()); return { text: '' } })
  on('model.fork', () => {
    const f = opts.fork
    if (!f) return { value: { isAnswered: false as const, reason: 'api-error' as const, status: 500, error: 'down' } }
    return {
      value: {
        isAnswered: true as const,
        text: 'warm',
        usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: f.read, cache_creation_input_tokens: f.write },
      },
    }
  })
  return { store, ran, session, registered }
}

const WRAP = { wrapUp: true }

/** A session whose last main-thread request was `idleMin` minutes before the clock's now. */
const seed = async ($: Parameters<Parameters<typeof test>[1]>[0], idleMin: number) => {
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleMin * 60, context_tokens: 200000, model: 'claude-opus-5-5' })
}

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

test('a keep-warm ping that read the cache starts the hour again', { plugins: [pinger] }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on, { keep: true, fork: { read: 200000, write: 0 } })
  await seed($, 0)
  await clock.advance(50 * MIN)
  await $.command.run({ command: 'ping', args: '', ...RUN })
  await clock.advance(30 * MIN)

  // 80 minutes after the last turn, 30 after the ping: warm, with 30 minutes left.
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.findAll({ type: 'Svg' })).map(s => s.props.alt)).toEqual(['Robo, bobbing', 'WARM'])
  expect(await band.find({ text: ' 30m left' })).toBeDefined()
  await band.unmount()
})

test('a ping that found the cache gone leaves the band cold', { plugins: [pinger] }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on, { keep: true, fork: { read: 0, write: 200000 } })
  await seed($, 0)
  await clock.advance(50 * MIN)
  await $.command.run({ command: 'ping', args: '', ...RUN })
  await clock.advance(30 * MIN)

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ text: ' COLD ' })).toBeDefined()
  await band.unmount()
})

test('a ping the API refused leaves the clock alone', { plugins: [pinger] }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on, { keep: true, fork: null })
  await seed($, 0)
  await clock.advance(50 * MIN)
  await $.command.run({ command: 'ping', args: '', ...RUN })
  await clock.advance(30 * MIN)

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ text: ' COLD ' })).toBeDefined()
  await band.unmount()
})

test('the switch turns keep-warm off and on again through cache-tax, and remembers it', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, ran } = engine(on, { keep: true })
  await seed($, 18)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('🔥 Keep warm')

  await band.press({ key: 'keep-warm' })
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('🧊 Keep warm')
  expect(store.get('keep')).toBe(false)
  expect(ran).toEqual(['keepwarm off'])

  await band.press({ key: 'keep-warm' })
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('🔥 Keep warm')
  expect(store.get('keep')).toBe(true)
  expect(ran).toEqual(['keepwarm off', 'keepwarm always'])
  await band.unmount()
})

test('the switch shows in the terminal too, and before the first reply', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: false })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('🧊 Keep warm')
  await band.unmount()
})

test('the first session ever stores nothing and runs nothing; the switch reads off', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, ran } = engine(on)
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  expect(store.has('keep')).toBe(false)
  expect(ran).toEqual([])
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('🧊 Keep warm')
  await band.unmount()
})

test('a later session leaves a saved choice alone', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, ran } = engine(on, { keep: false })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await clock.advance(5000)
  expect(store.get('keep')).toBe(false)
  expect(ran).toEqual([])
})

test('a typed /keepwarm off or always moves the switch', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  await seed($, 18)
  await $.command.run({ command: 'keepwarm', args: 'off', ...RUN })
  expect(store.get('keep')).toBe(false)
  await $.command.run({ command: 'keepwarm', args: 'always', ...RUN })
  expect(store.get('keep')).toBe(true)
  // A timed window is neither: the switch stays where it was.
  await $.command.run({ command: 'keepwarm', args: '3h', ...RUN })
  expect(store.get('keep')).toBe(true)
})

test('without cache-tax there is no switch', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { ran } = engine(on, { commands: [] })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'keep-warm' })).toBeUndefined()
  expect(ran).toEqual([])
  await band.unmount()
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

test('Wrap up runs the debrief, then lets this conversation go cold while the switch stays on', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store, ran } = engine(on, { keep: true, commands: ['keepwarm', 'cache-tax', 'debrief'], prefill: WRAP })
  on('turn.step', async function* ($, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160 } })
  expect((await band.find({ key: 'wrap-up' }))?.props.label).toBe('🎌 Wrap up')

  await band.press({ key: 'wrap-up' })
  expect(ran).toEqual(['debrief'])
  expect((await band.find({ key: 'wrap-up' }))?.props.label).toBe('🎌 Wrapping up…')
  // A second press while it runs asks for nothing more.
  await band.press({ key: 'wrap-up' })
  expect(ran).toEqual(['debrief'])

  // The debrief's own turn starts and ends; only then is the cache let go.
  for await (const c of $.turn.step({ turnId: 'T9', index: 0, model: 'claude-opus-5-5', messageCount: 4 })) void c
  await clock.advance(5000)
  expect(ran).toEqual(['debrief'])
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ reason: 'answer', answer: 'ok', usage: null, durationMs: 1000 })
  await clock.advance(5000)
  expect(ran).toEqual(['debrief', 'keepwarm 1m'])
  expect(store.get('keep')).toBe(true)
  expect((await band.find({ key: 'wrap-up' }))?.props.label).toBe('🎌 Wrap up')
  await band.unmount()
})

test('a turn already running when Wrap up is pressed does not end the conversation early', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { ran } = engine(on, { keep: true, commands: ['keepwarm', 'debrief'], prefill: WRAP })
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
  const { ran } = engine(on, { keep: false, commands: ['keepwarm', 'debrief'], prefill: WRAP })
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
  const { ran } = engine(on, { keep: true, commands: ['keepwarm', 'debrief'], prefill: WRAP })
  const cost = async () => ((await $.command.run({ command: 'wavebar', args: 'cost', ...RUN })) as { text: string }).text
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
  expect(ran).toEqual(['wavebar cost', 'debrief'])
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

test('Wrap up is absent by default and appears after /wavebar wrapup on', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, commands: ['keepwarm', 'debrief'] })
  await seed($, 18)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
  const r = await $.command.run({ command: 'wavebar', args: 'wrapup on', ...RUN })
  expect(store.get('wrapUp')).toBe(true)
  expect(JSON.stringify(r)).toContain('wrapup')
  expect(await band.find({ key: 'wrap-up' })).toBeDefined()
  await $.command.run({ command: 'wavebar', args: 'wrapup off', ...RUN })
  expect(store.get('wrapUp')).toBe(false)
  expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
  await band.unmount()
})

test('/wavebar registers itself, reports status, and answers anything else with usage', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store, registered } = engine(on, { keep: true })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  expect(registered).toContain('wavebar')
  const text = async (args: string) => ((await $.command.run({ command: 'wavebar', args, ...RUN })) as { text: string }).text
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
  on('tool.register', ($, e) => { registered.push(e.name); return { value: { tool: `mcp__wavebar__${e.name}` } } })
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

test('a ping that kept the cache warm adds its cost to the session record, not to the total', { plugins: [pinger] }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, fork: { read: 200000, write: 0 } })
  await seed($, 0)
  await clock.advance(50 * MIN)
  await $.command.run({ command: 'ping', args: '', ...RUN })
  // Opus: 2 in at $4, 1 out at $20, 200k read at $0.20, per million.
  const first = stored(store)
  expect(Math.abs(first.pings! - (8 + 20 + 40000) / 1e6)).toBeLessThan(1e-9)
  expect(first.main + first.subs).toBe(0)
  await $.command.run({ command: 'ping', args: '', ...RUN })
  expect(Math.abs(stored(store).pings! - 2 * (8 + 20 + 40000) / 1e6)).toBeLessThan(1e-9)
})

test('a ping that found the cache gone costs nothing in the record', { plugins: [pinger] }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, fork: { read: 0, write: 200000 } })
  await seed($, 0)
  await clock.advance(50 * MIN)
  await $.command.run({ command: 'ping', args: '', ...RUN })
  expect(store.has('spend:S1')).toBe(false)
})

test('a turn that begins after the hour on a cache the pings kept warm records what it saved', { plugins: [pinger] }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, fork: { read: 200000, write: 0 } })
  stopStep(on)
  await seed($, 0)
  await step($, 0)
  await clock.advance(50 * MIN)
  await $.command.run({ command: 'ping', args: '', ...RUN })
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

test('no savings without pings, or when the gap since the last real request is under the hour', { plugins: [pinger] }, async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, fork: { read: 200000, write: 0 } })
  stopStep(on)
  await seed($, 0)
  await step($, 0)
  // Cold: no ping kept it.
  await clock.advance(80 * MIN)
  await step($, 0)
  expect(store.get('spend:S1')).toBeUndefined()
  // A ping and a request inside the hour: the cache would have been warm anyway.
  await clock.advance(30 * MIN)
  await $.command.run({ command: 'ping', args: '', ...RUN })
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

test('/wavebar progress lists the themes, sets one account-wide, and answers a wrong id with the list', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true })
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const text = async (args: string) => ((await $.command.run({ command: 'wavebar', args, ...RUN })) as { text: string }).text
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
  const text = async (args: string) => ((await $.command.run({ command: 'wavebar', args, ...RUN })) as { text: string }).text
  expect(await text('status')).toContain('progress: comet')
  expect(await text('progress')).toContain('- **comet** (in use, default)')
})
