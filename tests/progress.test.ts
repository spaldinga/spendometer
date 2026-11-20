import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { afterListCall, afterReport, fromSteps, pulseText, ratioOf } from '../hooks/progress'
import { BAR_CY, BAR_H, BAR_TOP, crewSvg, paceSvg, walkSvg } from '../hooks/progress-art'
import { fitOpen, rowsOf } from '../hooks/layout'

const NOW = Date.parse('2098-12-31T22:00:00Z')
const PLAN = 'mcp__ccd_turn__update_plan'
const REPORT = 'mcp__wavebar__progress'
const props = (isWorking: boolean, bodyColumns = 160) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 12,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
})
const ITEMS = [
  { content: 'Read the code', status: 'completed' },
  { content: 'Write tests', status: 'in_progress' },
  { content: 'Write the fix', status: 'pending' },
  { content: 'Run tests', status: 'pending' },
]

type T$ = Parameters<Parameters<typeof test>[1]>[0]

const engine = (on: On) => {
  // These tests are about the segmented bar (calm); the default theme has its own test below.
  mock.store(on, { keep: true, progressTheme: 'calm' })
  const registered: string[] = []
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.list', () => ({ value: [] }))
  on('tool.register', ($, e) => { registered.push(e.name); return { value: { tool: `mcp__wavebar__${e.name}` } } })
  on('tool.call', () => ({ result: 'beneath' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
  return { registered }
}

const step = async ($: T$, index: number) => {
  for await (const c of $.turn.step({ turnId: 'T1', index, model: 'claude-opus-5-5', messageCount: 2 + index })) void c
}

const start = ($: T$) => $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

test('a whole list counts what is done and names the step in progress', () => {
  const p = afterListCall(null, PLAN, { items: ITEMS })
  expect(p).toMatchObject({ done: 1, total: 4, note: 'Write tests', hasCurrent: true, isFinished: false })
  // One done and one under way of four: the first step is done and the second is under way.
  expect(ratioOf(p!)).toBe(0.375)
})

test('advance, done and start move the list the way the plan tool does', () => {
  let p = afterListCall(null, PLAN, { items: ITEMS })
  p = afterListCall(p, PLAN, { advance: true })
  expect(p).toMatchObject({ done: 2, note: 'Write the fix' })
  p = afterListCall(p, PLAN, { done: [3], start: 4 })
  expect(p).toMatchObject({ done: 3, note: 'Run tests', isFinished: false })
  p = afterListCall(p, PLAN, { advance: true })
  expect(p).toMatchObject({ done: 4, total: 4, hasCurrent: false, isFinished: true })
  expect(ratioOf(p!)).toBe(1)
})

test("the app's wrap-up checks off what is left of the list, and makes none of its own", () => {
  const p = afterListCall(afterListCall(null, PLAN, { items: ITEMS }), 'mcp__ccd_turn__wrap_up', { recap: 'Done.' })
  expect(p).toMatchObject({ done: 4, total: 4, isFinished: true })
  expect(afterListCall(null, 'mcp__ccd_turn__wrap_up', { recap: 'Done.' })).toBe(null)
})

test('the terminal task tools build the same list', () => {
  const todo = afterListCall(null, 'TodoWrite', { todos: [{ content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }] })
  expect(todo).toMatchObject({ done: 1, total: 2, note: 'B' })

  let p = afterListCall(null, 'TaskCreate', { subject: 'First' })
  p = afterListCall(p, 'TaskCreate', { subject: 'Second' })
  p = afterListCall(p, 'TaskUpdate', { taskId: '1', status: 'completed' })
  p = afterListCall(p, 'TaskUpdate', { taskId: '2', status: 'in_progress' })
  expect(p).toMatchObject({ done: 1, total: 2, note: 'Second' })
  // A task the list never saw changes nothing.
  expect(afterListCall(p, 'TaskUpdate', { taskId: '9', status: 'completed' })).toEqual(p)
})

test('input outside the schema cannot break the list', () => {
  const p = afterListCall(null, PLAN, { items: [null, 7, { content: 42, status: 'weird' }, { content: 'x'.repeat(500) }] })
  expect(p).toMatchObject({ done: 0, total: 2 })
  expect(p!.steps[1].title.length).toBe(80)
  expect(afterListCall(fromSteps([]), PLAN, { done: ['a', -3, 99], start: 'no' })).toMatchObject({ total: 0 })
})

test('a report keeps what it leaves out and never passes its total', () => {
  let p = afterReport(null, { total: 5, done: 2, note: 'Parsing' })
  expect(p).toMatchObject({ done: 2, total: 5, note: 'Parsing', hasCurrent: true })
  p = afterReport(p, { done: 9 })
  expect(p).toMatchObject({ done: 5, total: 5, note: 'Parsing', isFinished: true })
  expect(afterReport(afterReport(null, { total: 3, done: 1 }), { finished: true })).toMatchObject({ done: 3, isFinished: true, note: '' })
})

test('the pulse line says how many requests and how long', () => {
  expect(pulseText({ startedAt: NOW, steps: 1 }, NOW + 4000)).toBe('working · 1 step · 4s')
  expect(pulseText({ startedAt: NOW, steps: 4 }, NOW + 72000)).toBe('working · 4 steps · 1m 12s')
})

test('the desktop band draws the segmented bar from the task list, and lets the call through', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await step($, 0)
  expect(await $.tool.call({ tool: PLAN, items: ITEMS } as never)).toMatchObject({ result: 'beneath' })

  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  const bar = (await band.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Progress'))
  expect(bar?.props.alt).toBe('Progress: 1 of 4 done. Now: Write tests')
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  expect(await band.find({ text: ' · Write tests' })).toBeDefined()

  await $.tool.call({ tool: PLAN, advance: true } as never)
  expect(await band.find({ text: ' 2/4' })).toBeDefined()
  expect(await band.find({ text: ' · Write the fix' })).toBeDefined()
  await band.unmount()
})

test('the terminal draws the bar as text', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: ITEMS } as never)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'terminal', component: 'AbovePrompt', props: props(true, 100) })
  expect(await band.find({ text: /^[▰▱]+$/ })).toBeDefined()
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  await band.unmount()
})

test("the mod's own tool reports progress, for the main session only", async ($, on) => {
  mock.clock(on, { now: NOW })
  const { registered } = engine(on)
  await start($)
  expect(registered).toEqual(['progress'])
  expect(await $.tool.call({ tool: REPORT, total: 5, done: 2, note: 'Parsing' } as never)).toMatchObject({ result: 'ok: 2/5' })
  const sub = { tool: REPORT, total: 9, done: 9, agentId: 'sub1' }
  expect(await $.tool.call(sub as never)).toMatchObject({ result: 'ignored: only the main session reports progress' })

  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  expect(await band.find({ text: ' 2/5' })).toBeDefined()
  await band.unmount()
})

test('a subagent keeping its own list does not move the bar', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: ITEMS } as never)
  const sub = { tool: 'TodoWrite', todos: [{ content: 'Sub', status: 'completed' }], agentId: 'sub1' }
  await $.tool.call(sub as never)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  await band.unmount()
})

test('with no list, a working turn shows the sweeping segment with steps and time; an idle one shows nothing', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await step($, 0)
  await clock.advance(72000)
  await step($, 1)

  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  const alts = (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts).toContain('Working')
  expect(await band.find({ text: ' working · 2 steps · 1m 12s' })).toBeDefined()
  await band.unmount()

  const idle = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  expect((await idle.findAll({ type: 'Svg' })).map(s => String(s.props.alt))).not.toContain('Working')
  expect(await idle.find({ text: / working · / })).toBeUndefined()
  await idle.unmount()
})

test('a finished list stays until the next request starts, then clears', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await step($, 0)
  await $.tool.call({ tool: PLAN, items: ITEMS.map(i => ({ ...i, status: 'completed' })) } as never)

  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  expect(await band.find({ text: ' 4/4' })).toBeDefined()
  expect(await band.find({ text: ' · done' })).toBeDefined()

  await step($, 0)
  expect(await band.find({ text: ' 4/4' })).toBeUndefined()
  await band.unmount()
})

test('a narrow band gives the bar a row of its own', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: ITEMS } as never)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true, 60) })
  expect(await band.find({ key: 'progress-row' })).toBeDefined()
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  await band.unmount()
})

const spawn = (type: string) =>
  ({ tool_use_id: `t-${type}`, prompt: 'p', description: `${type} work`, subagentType: type, provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false })

const subStep = async ($: T$, agentId: string, index: number) => {
  const stream = ($.turn.step as (e: unknown) => AsyncIterable<unknown>)({ turnId: `sub-${agentId}`, index, model: 'claude-sonnet-5-5', messageCount: 1, agentId })
  for await (const c of stream) void c
}

test('running subagents stand beside the bar with their kind and requests, and leave when done', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.subagentType}` }))
  await start($)
  await step($, 0)
  await $.agent.spawn(spawn('Explore') as never)
  await $.agent.spawn(spawn('sonnet-coder') as never)
  await subStep($, 'a-Explore', 0)
  await subStep($, 'a-Explore', 1)
  await subStep($, 'a-sonnet-coder', 0)

  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true) })
  const alts = async () => (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(await alts()).toContain('2 subagents working')
  expect(await band.find({ text: ' ×2' })).toBeDefined()
  expect(await band.find({ text: ' Explore 2, sonnet-coder 1' })).toBeDefined()

  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a-Explore', reason: 'answer', answer: 'ok', usage: null, durationMs: 10 })
  expect(await alts()).toContain('1 subagent working')
  expect(await band.find({ text: ' sonnet-coder 1' })).toBeDefined()
  await band.unmount()
})

test('a background subagent still shows after the main turn has stopped working', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.subagentType}` }))
  await start($)
  await $.agent.spawn(spawn('Explore') as never)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'terminal', component: 'AbovePrompt', props: props(false, 100) })
  expect(await band.find({ text: ' ×1' })).toBeDefined()
  expect(await band.find({ text: ' Explore 0' })).toBeDefined()
  await band.unmount()
})

test('on the desktop, a background subagent after the main turn has ended keeps the working bar beside it, with no turn time', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `a-${e.subagentType}` }))
  await start($)
  await $.agent.spawn(spawn('sonnet-coder') as never)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  const alts = (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts).toContain('Working')
  expect(alts).toContain('1 subagent working')
  expect(await band.find({ text: ' ×1' })).toBeDefined()
  expect(await band.find({ text: /working ·/ })).toBeUndefined()
  await band.unmount()
})

test('with nothing working and no subagents, there is no bar', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(false) })
  expect(await band.find({ key: 'bar' })).toBeUndefined()
  await band.unmount()
})

const OR = '#ff6b1a'
const EM = '#4a463b'
const PULSE_RE = /<animate attributeName="opacity" values="1;\.3;1" dur="1\.4s" repeatCount="indefinite"\/>/
const rects = (s: string) => s.match(/<rect [^>]*?(?:\/>|>.*?<\/rect>)/g) ?? []
const fillOf = (r: string) => /fill="([^"]+)"/.exec(r)?.[1]
const light = '@media (prefers-color-scheme: light)'

test('walkSvg draws a segment per step: done and current orange, the rest empty, the pulse on the current one only', () => {
  const rs = rects(walkSvg(1, 4, 200, true, false))
  expect(rs.length).toBe(4)
  expect(rs.map(fillOf)).toEqual([OR, OR, EM, EM])
  expect(rs.map(r => PULSE_RE.test(r))).toEqual([false, true, false, false])
  expect(rs[0]).toContain('x="0"')
  expect(rs[0]).toContain('height="6"')
  expect(rs[0]).toContain('rx="2"')
})

test('a step list with nothing under way pulses nothing; a finished one is all orange and still', () => {
  const idle = walkSvg(2, 4, 200, false, false)
  expect(rects(idle).map(fillOf)).toEqual([OR, OR, EM, EM])
  expect(idle).not.toContain('<animate')
  const fin = walkSvg(4, 4, 200, false, true)
  expect(rects(fin).map(fillOf)).toEqual([OR, OR, OR, OR])
  expect(fin).not.toContain('<animate')
})

test('above 24 steps one continuous track fills to the share done, with the pulse on its head', () => {
  const s = walkSvg(10, 30, 300, true, false)
  const rs = rects(s)
  expect(rs.length).toBe(3)
  expect(fillOf(rs[0])).toBe(EM)
  expect(rs[0]).toContain('width="300"')
  expect(fillOf(rs[1])).toBe(OR)
  expect(rs[1]).toContain('width="100"')
  expect(PULSE_RE.test(rs[2])).toBe(true)
  expect(s.match(/<animate/g)?.length).toBe(1)
  const fin = walkSvg(30, 30, 300, false, true)
  expect(fin).not.toContain('<animate')
  expect(rects(fin).map(fillOf)).toEqual([EM, OR])
})

test('paceSvg is a row of empty segments with one orange segment sweeping end to end and back', () => {
  const s = paceSvg(300)
  const rs = rects(s)
  expect(rs.filter(r => fillOf(r) === EM).length).toBe(7)
  const lit = rs.filter(r => fillOf(r) === OR)
  expect(lit.length).toBe(1)
  expect(lit[0]).toContain('attributeName="x"')
  expect(lit[0]).toContain('dur="2.4s"')
  expect(lit[0]).toContain('repeatCount="indefinite"')
  // A narrow row has fewer, but never thinner than 24 px.
  expect(rects(paceSvg(60)).filter(r => fillOf(r) === EM).length).toBe(2)
})

test('crewSvg draws a dot a head and widens with them', () => {
  const one = crewSvg(1)
  const three = crewSvg(3)
  expect(one.source.match(/<circle/g)?.length).toBe(1)
  expect(three.source.match(/<circle/g)?.length).toBe(3)
  expect(three.source).toContain('r="3.5"')
  expect(three.w).toBeGreaterThan(one.w)
  expect(three.w - one.w).toBe(20)
})

test('every progress drawing carries the light-mode style', () => {
  for (const s of [walkSvg(1, 4, 200, true, false), walkSvg(10, 30, 300, true, false), paceSvg(200), crewSvg(2).source]) {
    expect(s).toContain(light)
  }
})

const LONG = 'Fetch my assigned work items and read every one of their linked pull requests'
const LONG_ITEMS = [
  { content: 'Read the code', status: 'completed' },
  { content: LONG, status: 'in_progress' },
  { content: 'Run tests', status: 'pending' },
]

/** The progress row's estimated width in columns: the bar's px over 12 plus the words at 0.85 columns a character. */
const rowCols = async (band: Awaited<ReturnType<T$['ui']['mount']>>) => {
  const bar = (await band.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('Progress'))
  const row = String((await band.find({ key: 'progress-row' }))?.text)
  return { cols: Number(bar?.props.width) / 12 + (row.length) * 0.85 + 2, row }
}

test('at a compact width a long step name is cut with an ellipsis and the row fits the band', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: LONG_ITEMS } as never)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true, 60) })
  const { cols, row } = await rowCols(band)
  expect(row).toContain('…')
  expect(row).not.toContain(LONG)
  expect(cols).toBeLessThanOrEqual(60)
  await band.unmount()
})

test('where not even the count and the smallest bar leave room, the step name is dropped', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: LONG_ITEMS } as never)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true, 16) })
  expect(await band.find({ key: 'note' })).toBeUndefined()
  expect(await band.find({ text: ' 1/3' })).toBeDefined()
  await band.unmount()
})

test('at 160 columns the step name shows in full, up to the note limit', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: LONG_ITEMS } as never)
  const band = await $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(true, 160) })
  // NOTE_MAX is 32: the name is cut there, not by the room.
  expect(await band.find({ text: ` · ${LONG.slice(0, 31)}…` })).toBeDefined()
  await band.unmount()
})

/** The progress row's drawing, with `theme` saved in the store. */
const themed = async ($: T$, on: On, theme: string | undefined, isWorking: boolean, items?: unknown[]) => {
  mock.clock(on, { now: NOW })
  mock.store(on, theme ? { keep: true, progressTheme: theme } : { keep: true })
  engine2(on)
  await start($)
  if (items) await $.tool.call({ tool: PLAN, items } as never)
  else await step($, 0)
  return $.ui.mount({ plugin: 'wavebar', surface: 'desktop', component: 'AbovePrompt', props: props(isWorking) })
}
/** The progress tests' engine, without its own store (the test sets one). */
const engine2 = (on: On) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.list', () => ({ value: [] }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__wavebar__${e.name}` } }))
  on('tool.call', () => ({ result: 'beneath' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('turn.step', async function* ($, e) {
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage: null }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })
}
const barSource = async (band: Awaited<ReturnType<typeof themed>>) =>
  String((await band.findAll({ type: 'Svg' })).find(s => ['Progress', 'Working'].some(a => String(s.props.alt).startsWith(a)))?.props.source)

test('a themed band draws the theme, names the step in the drawing and leaves the note out of the words', async ($, on) => {
  const band = await themed($, on, 'dial', true, ITEMS)
  const src = await barSource(band)
  expect(src).toContain('Write tests')
  expect(src).toContain('values="0 17.3;17.3 0"')
  expect(await band.find({ text: ' 1/4' })).toBeDefined()
  expect(await band.find({ text: / · Write tests/ })).toBeUndefined()
  await band.unmount()
})

test('with no saved theme the band draws the comet, with the step named in the drawing and not in the words', async ($, on) => {
  const band = await themed($, on, undefined, true, ITEMS)
  expect(await barSource(band)).toContain('Write tests')
  expect(await band.find({ text: ' · Write tests' })).toBeUndefined()
  await band.unmount()
})

test('the console theme draws the idle line itself, so the words beside it leave it out', async ($, on) => {
  const band = await themed($, on, 'bridge', true)
  const src = await barSource(band)
  expect(src).toContain('WORKING')
  expect(src).toContain('1 STEP')
  expect(await band.find({ text: / working · / })).toBeUndefined()
  await band.unmount()
})

test('the wave theme keeps the words with the idle line', async ($, on) => {
  const wave = await themed($, on, 'wake', true)
  expect(await barSource(wave)).toContain('stroke="#4a463b"')
  expect(await wave.find({ text: / working · 1 step/ })).toBeDefined()
  await wave.unmount()
})

test('the calm bar and the crew dots sit 8 px below the top, and the taller drawing is still two rows', () => {
  const top = (s: string) => Math.min(...[...s.matchAll(/<rect [^>]*?y="([\d.]+)"/g)].map(m => Number(m[1])), ...[...s.matchAll(/<circle [^>]*?cy="([\d.]+)" r="([\d.]+)"/g)].map(m => Number(m[1]) - Number(m[2])))
  for (const s of [walkSvg(1, 4, 200, true, false), walkSvg(10, 30, 300, true, false), walkSvg(4, 4, 200, false, true), paceSvg(200), crewSvg(1).source, crewSvg(3).source]) {
    expect(top(s.slice(s.indexOf('</style>')))).toBeGreaterThanOrEqual(BAR_TOP)
    expect(s).toContain(`height="${BAR_H}"`)
  }
  expect(BAR_TOP).toBe(8)
  // The content is centred in what is left under the gap.
  expect(BAR_CY).toBe(BAR_TOP + (BAR_H - BAR_TOP) / 2)
  // fitOpen counts the bar as before: two rows at 18 px a row.
  expect(rowsOf(BAR_H)).toBe(2)
  expect(fitOpen(5, 1, BAR_H, 36)).toEqual({ progress: true })
  expect(fitOpen(4, 1, BAR_H, 36)).toEqual({ progress: false })
})
