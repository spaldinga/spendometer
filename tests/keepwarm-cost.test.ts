import { expect, mock, test } from 'claude-code/testing'

import { turnCost, usd } from '../hooks/cost/prices'
import { metricsOf } from '../hooks/band/card-metrics'
import type { Spent } from '../types'
import { NOW, MIN, PROPS, BAND, RUN, engine, seed, USED, done, DAY, FRESH, figures } from './keepwarm-kit'
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

test('the cost command answers with a line the model can quote', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true })
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
})

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

test('the open wide card shows the Cost tab figures once the record has them, and Capacity the pace and size', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on, { keep: true, prefill: { 'spend:S1': { ...FRESH(2, 1, 0.5), turns: 4, paidTurns: 2, readTok: 90, inTok: 100, ctxPrev: 100000, growth: 5000, byType: { Explore: 1 } } } })
  await seed($, 18)
  await $.ui.mount({ ...BAND, surface: 'desktop', props: { ...PROPS, bodyColumns: 160, maxRows: 30 } }).then(async band => {
    // The card opens on Cost, the first tab: four columns at this width, BY MODEL as the one status line.
    await band.press({ key: 'cache-fold' })
    const svgs = JSON.stringify(await band.findAll({ type: 'Svg' }))
    for (const t of ['>SPEND<', 'DELEGATION', 'CACHE DISCOUNT', 'PER MESSAGE', 'by model']) expect(svgs).toContain(t)
    expect(svgs).toContain('90%')
    expect(svgs).not.toContain('PACE VS RESET')
    await band.press({ key: 'tab-capacity-button' })
    const capacity = JSON.stringify(await band.findAll({ type: 'Svg' }))
    expect(capacity).toContain('PACE VS RESET')
    expect(capacity).not.toContain('CACHE DISCOUNT')
    expect(capacity).not.toContain('DELEGATION')
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

test('ctxFirst is the context after the first priced main turn and stays when later turns grow it', async ($, on) => {
  mock.clock(on, { now: NOW })
  // No record yet: the first turn creates it, and the context of that turn is the setup estimate.
  const { store } = engine(on, { keep: true })
  await seed($, 18)
  await done($, { usage: USED })
  expect((store.get('spend:S1') as Spent).ctxFirst).toBe(200000)
  // A record that has one keeps it while ctxPrev moves on.
  store.set('spend:S1', { ...(store.get('spend:S1') as Spent), ctxFirst: 50000, ctxPrev: 150000 })
  await done($, { usage: USED })
  const m = store.get('spend:S1') as Spent
  expect([m.ctxFirst, m.ctxPrev]).toEqual([50000, 200000])
})

test('ctxFirst and rereadFiles survive a read-modify-write in order; non-number values are dropped', async ($, on) => {
  mock.clock(on, { now: NOW })
  const files = { 'old.ts': 3, 'bad.ts': 'x', 'new.ts': 1 }
  const { store } = engine(on, { keep: true, prefill: { 'spend:S1': { ...FRESH(2, 1, 0.5), ctxFirst: 18000, rereadFiles: files } } })
  await seed($, 18)
  await done($, { usage: USED })
  const m = store.get('spend:S1') as Spent
  expect(m.ctxFirst).toBe(18000)
  expect(Object.entries(m.rereadFiles ?? {})).toEqual([['old.ts', 3], ['new.ts', 1]])
  // A junk ctxFirst is dropped, and the first turn then sets it.
  store.set('spend:S1', { ...FRESH(2, 1, 0.5), ctxFirst: 'x', rereadFiles: 7 })
  await done($, { usage: USED })
  const j = store.get('spend:S1') as Spent
  expect(j.ctxFirst).toBe(200000)
  expect(j.rereadFiles).toBeUndefined()
})
