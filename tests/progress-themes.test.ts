import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BAR_CY, BAR_H, BAR_TOP, crewSvg, paceSvg, walkSvg } from '../hooks/activity/progress/art'
import { fitOpen, rowsOf } from '../hooks/layout'
import { NOW, PLAN, props, ITEMS, engine, step, start } from './progress-kit'
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
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true, 60) })
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
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true, 16) })
  expect(await band.find({ key: 'note' })).toBeUndefined()
  expect(await band.find({ text: ' 1/3' })).toBeDefined()
  await band.unmount()
})

test('at 160 columns the step name shows in full, up to the note limit', async ($, on) => {
  mock.clock(on, { now: NOW })
  engine(on)
  await start($)
  await $.tool.call({ tool: PLAN, items: LONG_ITEMS } as never)
  const band = await $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(true, 160) })
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
  return $.ui.mount({ plugin: 'spendometer', surface: 'desktop', component: 'AbovePrompt', props: props(isWorking) })
}
/** The progress tests' engine, without its own store (the test sets one). */
const engine2 = (on: On) => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.list', () => ({ value: [] }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__spendometer__${e.name}` } }))
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
