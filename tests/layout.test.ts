import { expect, mock, test } from 'claude-code/testing'

import { ROW_PX, fitOpen, layoutOf } from '../hooks/layout'

// The compact row's five variants (each narrower), the fold button and the icon buttons (6 columns each), and the wide row's word buttons.
const NEED = { wide: 118, compact: [60, 52, 46, 40, 34], tight: 15, buttons: 18, buttonsWide: 4 + 14 + 12 }
const SLACK = 2

test('a width that fits the wide row and the word buttons keeps the buttons inline', () => {
  expect(layoutOf(160, NEED)).toEqual({ kind: 'wide', buttonsRow: false, compactStep: 0 })
  expect(layoutOf(NEED.wide + NEED.buttonsWide, NEED)).toEqual({ kind: 'wide', buttonsRow: false, compactStep: 0 })
})

test('where the wide row does not fit, the compact row with everything and the buttons inline is chosen', () => {
  expect(layoutOf(NEED.wide + NEED.buttonsWide - 1, NEED).kind).toBe('stacked')
  expect(layoutOf(NEED.compact[0] + NEED.buttons + SLACK, NEED)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 0 })
})

test('each step is chosen when the one before does not fit, with 2 columns of slack', () => {
  for (let s = 1; s < 5; s++) {
    const room = NEED.compact[s] + NEED.buttons + SLACK
    expect(layoutOf(room, NEED)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: s })
    // One column less and this step has no slack left: the next one (or the buttons row) takes over.
    expect(layoutOf(room - 1, NEED).compactStep).toBe(Math.min(s + 1, 4))
  }
  // Fits step 0 exactly with the buttons but not with the slack: step 1.
  expect(layoutOf(NEED.compact[0] + NEED.buttons, NEED).compactStep).toBe(1)
})

test('the buttons leave for a row of their own only after the last step fails inline', () => {
  const inline4 = NEED.compact[4] + NEED.buttons + SLACK
  expect(layoutOf(inline4, NEED)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4 })
  expect(layoutOf(inline4 - 1, NEED)).toEqual({ kind: 'stacked', buttonsRow: true, compactStep: 4 })
  expect(layoutOf(NEED.compact[4], NEED)).toEqual({ kind: 'stacked', buttonsRow: true, compactStep: 4 })
})

test('very narrow is tight, with the buttons on the cache row when they fit and on their own row when not', () => {
  expect(layoutOf(NEED.compact[4] - 1, { ...NEED, tight: 15 })).toEqual({ kind: 'tight', buttonsRow: false, compactStep: 0 })
  const t = { ...NEED, compact: [200, 200, 200, 200, 200] }
  expect(layoutOf(t.tight + t.buttons, t)).toEqual({ kind: 'tight', buttonsRow: false, compactStep: 0 })
  expect(layoutOf(t.tight + t.buttons - 1, t)).toEqual({ kind: 'tight', buttonsRow: true, compactStep: 0 })
  expect(layoutOf(20, t)).toEqual({ kind: 'tight', buttonsRow: true, compactStep: 0 })
})

test('with no buttons there is never a buttons row', () => {
  const n = { ...NEED, buttons: 0, buttonsWide: 0 }
  expect(layoutOf(NEED.compact[4], n)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4 })
  expect(layoutOf(10, n)).toEqual({ kind: 'tight', buttonsRow: false, compactStep: 0 })
})

const NOW = Date.parse('2098-12-31T22:00:00Z')
const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 74,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
} as const
const WINDOWS = [
  { kind: 'five_hour', percentUsed: 18, resetsAt: '2098-12-31T23:29:00Z' },
  { kind: 'seven_day', percentUsed: 1, resetsAt: '2099-01-02T22:00:00Z' },
]

/** A warm cache, both windows, a saved cost, keep-warm on, Wrap up switched on with a debrief command. */
const mountAt = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], columns: number, keep = true, idleMin = 22, surface: 'desktop' | 'terminal' = 'desktop', maxRows = 40) => {
  mock.clock(on, { now: NOW })
  const kv = new Map<string, unknown>([['keep', keep], ['wrapUp', true], ['spend:S1', { main: 0.46, subs: 0.03, last: 0.03, at: NOW }]])
  on('session.id', () => ({ value: 'S1' }))
  on('store.get', ($, e) => ({ value: kv.get(e.key) }))
  on('store.set', ($, e) => { kv.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...kv.keys()] }))
  on('store.delete', ($, e) => { kv.delete(e.key); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: WINDOWS } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('classic.SessionStart', () => ({}))
  on('command.list', () => ({ value: ['keepwarm', 'cache-tax', 'debrief'].map(name => ({ name, description: '', source: 'plugin' as const })) }))
  await $.session.start({ surface, isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleMin * 60, context_tokens: 200000, model: 'claude-opus-5-5' })
  return $.ui.mount({ plugin: 'wavebar', surface, component: 'AbovePrompt', props: { ...PROPS, bodyColumns: columns, maxRows } })
}

test('at 68 columns the compact row holds only the essentials, buttons inline as icons', async ($, on) => {
  const band = await mountAt($, on, 68)
  // The estimate: the compact row is 48 columns here (step 0), the icon buttons 18 and 2 columns of slack: 68 is the least width for step 0 with the buttons inline.
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('🔥')
  expect((await band.find({ key: 'wrap-up' }))?.props.label).toBe('🎌')
  expect(await band.find({ key: 'cache-fold' })).toBeDefined()
  expect(await band.find({ text: '99% left' })).toBeDefined()
  expect(await band.find({ text: '82% left' })).toBeDefined()
  expect(await band.find({ text: '≈$0.49' })).toBeDefined()
  expect(await band.find({ text: '$0.04' })).toBeDefined()
  expect(await band.find({ text: ' next' })).toBeDefined()

  const all = String((await band.find({ key: 'row' }))?.text)
  expect(JSON.stringify(await band.findAll({ type: 'Svg' }))).toContain('WARM')
  for (const gone of ['7D', '5H', 'COST', 'last $', 'resets', '●', 'm left', 'Robo, bobbing']) expect(all).not.toContain(gone)
  await band.unmount()
})

test('where even step 4 does not fit inline (37 columns with buttons), the buttons leave the compact row for a row of their own', async ($, on) => {
  const band = await mountAt($, on, 30)
  const row = await band.find({ key: 'buttons-row' })
  expect(row).toBeDefined()
  const inside = JSON.stringify(row)
  expect(inside).toContain('keep-warm')
  expect(inside).toContain('wrap-up')
  expect(inside).toContain('cache-fold')
  expect(await band.find({ text: '99%' })).toBeDefined()
  await band.unmount()
})

test('at 160 columns the same content is one wide row, buttons inline with their words', async ($, on) => {
  const band = await mountAt($, on, 160)
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('🔥 Keep warm')
  expect((await band.find({ key: 'wrap-up' }))?.props.label).toBe('🎌 Wrap up')
  expect(await band.find({ text: ' 99% left' })).toBeDefined()
  await band.unmount()
})

test('with keep-warm off the wide label reads 🧊 Keep warm', async ($, on) => {
  const band = await mountAt($, on, 160, false)
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('🧊 Keep warm')
  await band.unmount()
})

test('at 100 columns, a usual desktop window, everything stays on one wide row', async ($, on) => {
  // Measured 2026-11-12: at about 102 columns the whole row fitted with some 14 columns to spare.
  const band = await mountAt($, on, 100)
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect(await band.find({ key: 'keep-warm' })).toBeDefined()
  expect(await band.find({ key: 'wrap-up' })).toBeDefined()
  await band.unmount()
})

// The estimates at this content (both windows, ≈$0.49, a warm chip, $0.04 next), desktop, without the buttons:
// step 0: 48, 1: 38 warm (48 cold), 2: 30, 3: 25, 4: 17. With the buttons (18) and 2 columns of slack:
// step 0 from 68 columns, 1 from 58, 2 from 50, 3 from 45, 4 from 37; under 37 the buttons take a row of their own.
const row = async (band: Awaited<ReturnType<typeof mountAt>>) => String((await band.find({ key: 'row' }))?.text)

test('the ladder: warm shows the next cost at step 0 (68 columns)', async ($, on) => {
  const band = await mountAt($, on, 68)
  expect(await row(band)).toContain('next')
  await band.unmount()
})

test('the ladder: at 65 columns the next cost is hidden while warm, the total and the chip stay', async ($, on) => {
  const warm = await mountAt($, on, 65)
  expect(await row(warm)).not.toContain('next')
  expect(await warm.find({ text: '≈$0.49' })).toBeDefined()
  expect(JSON.stringify(await warm.findAll({ type: 'Svg' }))).toContain('WARM')
  await warm.unmount()
})

test('cold keeps the next cost on the ladder as long as the chip or Robo fits (55 columns: Robo and the next cost)', async ($, on) => {
  const band = await mountAt($, on, 55, true, 70)
  await band.press({ key: 'cache-fold' })
  expect(await row(band)).toContain('next')
  expect(await band.find({ key: 'spend-total' })).toBeUndefined()
  expect(JSON.stringify(await band.findAll({ type: 'Svg' }))).toContain('Robo, frozen')
  await band.unmount()
})

test('the ladder: at 55 columns the cost total is gone', async ($, on) => {
  const band = await mountAt($, on, 55)
  expect(await band.find({ key: 'spend-total' })).toBeUndefined()
  expect(JSON.stringify(await band.findAll({ type: 'Svg' }))).toContain('WARM')
  expect(await band.find({ text: '99% left' })).toBeDefined()
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  await band.unmount()
})

test('the ladder: at 47 columns Robo stands in for the chip', async ($, on) => {
  const band = await mountAt($, on, 47)
  const svgs = JSON.stringify(await band.findAll({ type: 'Svg' }))
  expect(svgs).toContain('Robo, bobbing')
  expect(svgs).not.toContain('WARM')
  expect(await band.find({ text: '99% left' })).toBeDefined()
  await band.unmount()
})

test('the ladder: at 40 columns the windows read 26% not 26% left, still inline', async ($, on) => {
  const band = await mountAt($, on, 40)
  expect(await band.find({ text: '99%' })).toBeDefined()
  expect(await band.find({ text: '99% left' })).toBeUndefined()
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  await band.unmount()
})

test('the terminal keeps a one-letter chip once Robo would stand in', async ($, on) => {
  const band = await mountAt($, on, 40, true, 22, 'terminal')
  expect(await band.find({ text: ' W ' })).toBeDefined()
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  await band.unmount()
})

test('with the card open, nothing sits between the compact row and the card, and the card starts 6 px from its top line', async ($, on) => {
  const compact = await mountAt($, on, 68)
  await compact.press({ key: 'cache-fold' })
  const root = (await compact.find({ type: 'Box' }))!
  const kids = (root.children ?? []).map((c: { props?: { key?: string } }) => c.props?.key)
  expect(kids).toEqual(['row', 'card'])
  const src = JSON.stringify(await compact.find({ key: 'card' }))
  expect(src).toContain('translate(0 6)')
  await compact.unmount()
})

test('each button carries hover text on the desktop, and none in the terminal', async ($, on) => {
  const band = await mountAt($, on, 160)
  for (const text of [/^Show the cache card/, /^Keep warm is on/, /^Wrap up: runs \/debrief/]) {
    expect(await band.find({ type: 'Text', text })).toBeDefined()
  }
  // Hidden until hovered: the box around each text. (The kit does not expose the hover style itself.)
  const hidden = (await band.findAll({ type: 'Box' })).filter(b => b.props.display === 'none')
  expect(hidden.length).toBe(3)
  await band.unmount()
})

test('the terminal has no hover text: it has no pointer to hover with', async ($, on) => {
  const term = await mountAt($, on, 160, true, 22, 'terminal')
  expect(await term.find({ type: 'Text', text: /^Wrap up: runs \/debrief/ })).toBeUndefined()
  await term.unmount()
})

test('the progress takes its own row at the bottom, even on a wide band, and the buttons keep their place', async ($, on) => {
  on('tool.call', () => ({ result: 'ran' }))
  const band = await mountAt($, on, 160)
  const items = [
    { content: 'Read the code', status: 'completed' },
    { content: 'Write tests', status: 'in_progress' },
    { content: 'Run tests', status: 'pending' },
  ]
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items } as never)
  expect(await band.find({ key: 'progress' })).toBeUndefined()
  expect(await band.find({ key: 'progress-row' })).toBeDefined()
  expect(await band.find({ text: ' 1/3' })).toBeDefined()
  for (const key of ['cache-fold', 'keep-warm', 'wrap-up']) expect(await band.find({ key })).toBeDefined()
  await band.unmount()
})

test('WARM or COLD stays in the row with the card open, on the wide and the compact layout', async ($, on) => {
  // Idle 70 minutes: cold, and a cold cache opens the card by default.
  const band = await mountAt($, on, 160, true, 70)
  expect(await band.find({ key: 'card' })).toBeDefined()
  const alts = (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts).toContain('COLD')
  await band.unmount()
})

test('compact, with the card open, the chip still shows', async ($, on) => {
  const band = await mountAt($, on, 68, true, 70)
  expect(await band.find({ key: 'card' })).toBeDefined()
  expect(await band.find({ key: 'block' })).toBeDefined()
  await band.unmount()
})

test('the open card names the limits and when they reset on the wide layout too', async ($, on) => {
  // Idle 70 minutes: cold, so the card is open.
  const wide = await mountAt($, on, 160, true, 70)
  const card = await wide.find({ key: 'card' })
  expect(card).toBeDefined()
  const svg = JSON.stringify(card)
  const body = svg.slice(svg.lastIndexOf('</style>') + 1)
  expect(body).toContain('7-DAY LIMIT')
  expect(body).toContain('resets in')
  await wide.unmount()
})

test('compact, the open card still names the limits', async ($, on) => {
  const compact = await mountAt($, on, 68, true, 70)
  const svg = JSON.stringify(await compact.find({ key: 'card' }))
  expect(svg.slice(svg.lastIndexOf('</style>') + 1)).toContain('7-DAY LIMIT')
  await compact.unmount()
})

test('fitOpen keeps everything that fits, then gives up the limits zone, then the progress row', () => {
  const card = 10 * ROW_PX
  const bare = 6 * ROW_PX
  const bar = 2 * ROW_PX
  expect(fitOpen(13, 1, bar, card, bare)).toEqual({ limits: true, progress: true })
  expect(fitOpen(12, 1, bar, card, bare)).toEqual({ limits: false, progress: true })
  expect(fitOpen(9, 1, bar, card, bare)).toEqual({ limits: false, progress: true })
  expect(fitOpen(8, 1, bar, card, bare)).toEqual({ limits: false, progress: false })
  // With no progress row there is nothing to give up but the limits zone.
  expect(fitOpen(11, 1, 0, card, bare)).toEqual({ limits: true, progress: true })
  // The card stays even when it alone is taller than the band may be: the person opened it.
  expect(fitOpen(3, 1, bar, card, bare)).toEqual({ limits: false, progress: false })
})

test('compact, a low band drops the limits zone from the open card instead of scrolling', async ($, on) => {
  const band = await mountAt($, on, 68, true, 70, 'desktop', 8)
  const svg = JSON.stringify(await band.find({ key: 'card' }))
  expect(svg).toBeDefined()
  expect(svg.slice(svg.lastIndexOf('</style>') + 1)).not.toContain('7-DAY LIMIT')
  await band.unmount()
})

test('the card element is sized to the band on screen, so the shrunk drawing leaves no empty space around it', async ($, on) => {
  const band = await mountAt($, on, 69, true, 70)
  const svg = (await band.findAll({ type: 'Svg' })).find(s => String(s.props.alt).includes('Cache cold'))
  expect(svg).toBeDefined()
  // 69 columns at 8.6 px is 593 px on screen; the height follows the drawing's proportions.
  expect(svg!.props.width).toBeLessThanOrEqual(594)
  const src = String(svg!.props.source)
  const [, dw, dh] = src.match(/viewBox="0 0 (\d+) (\d+)"/)!.map(Number)
  expect(Math.abs(Number(svg!.props.height) / Number(svg!.props.width) - dh / dw)).toBeLessThan(0.01)
  await band.unmount()
})
