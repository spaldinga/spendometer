import { expect, mock, test } from 'claude-code/testing'

import { DANGER } from '../hooks/cache-art'
import { dayKey } from '../hooks/days'
import { BUTTON_GAP, CARD_COL_PX, FOLD_COLS, ROW_PX, buttonCols, cardColsOf, fitOpen, layoutOf, rowsOf, TIP_LIFT } from '../hooks/layout'

import { shown } from './visible'

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
/** 1h 29m left of the 5h window, 18% used: the pace is known (~59% at reset). */
const WINDOWS = [
  { kind: 'five_hour', percentUsed: 18, resetsAt: '2098-12-31T23:29:00Z' },
  { kind: 'seven_day', percentUsed: 1, resetsAt: '2099-01-02T22:00:00Z' },
] as const
/** The default: the 5h reset is further off than the window is long, so no pace shows in the row and the ladder is that of the row without it. */
const QUIET = [{ ...WINDOWS[0], resetsAt: '2099-01-01T03:30:00Z' }, WINDOWS[1]]

/** The store of the last mountAt, for tests that read what the band wrote. */
let lastKv = new Map<string, unknown>()

/** Set for a test that wants the old Wrap up setting in the store and a debrief command, to prove neither draws anything. */
let legacyWrap = false
/** A warm cache, both windows, a saved cost, keep-warm on. */
const mountAt = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], columns: number, keep = true, idleMin = 22, surface: 'desktop' | 'terminal' = 'desktop', maxRows = 40, now = NOW, limits: readonly object[] = QUIET) => {
  mock.clock(on, { now })
  const kv = (lastKv = new Map<string, unknown>([['keepDefault', keep], ...(legacyWrap ? [['wrapUp', true] as [string, unknown]] : []), ['spend:S1', { main: 0.46, subs: 0.03, last: 0.03, at: NOW }]]))
  on('session.id', () => ({ value: 'S1' }))
  on('store.get', ($, e) => ({ value: kv.get(e.key) }))
  on('store.set', ($, e) => { kv.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...kv.keys()] }))
  on('store.delete', ($, e) => { kv.delete(e.key); return { value: undefined } })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 200000 }, rateLimits: limits } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('classic.SessionStart', () => ({}))
  on('command.list', () => ({ value: (legacyWrap ? ['debrief'] : []).map(name => ({ name, description: '', source: 'plugin' as const })) }))
  await $.session.start({ surface, isInteractive: true, cwd: '/work' })
  await $.classic.SessionStart({ source: 'resume', seconds_since_last_response: idleMin * 60, context_tokens: 200000, model: 'claude-opus-5-5' })
  return $.ui.mount({ plugin: 'spendometer', surface, component: 'AbovePrompt', props: { ...PROPS, bodyColumns: columns, maxRows } })
}

test('at 70 columns the compact row holds only the essentials, buttons inline as icons', async ($, on) => {
  const band = await mountAt($, on, 70)
  // The estimate: the compact row is 56 columns here (step 0), the icon button 6 and 2 columns of slack: 64 is the least width for step 0 with the button inline.
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('✓')
  expect(await band.find({ key: 'cache-fold' })).toBeDefined()
  expect(await band.find({ text: '99% left' })).toBeDefined()
  expect(await band.find({ text: '82% left' })).toBeDefined()
  expect(await band.find({ text: '≈$0.49' })).toBeDefined()
  expect(await band.find({ text: '$0.04' })).toBeDefined()
  expect(await band.find({ text: ' next' })).toBeDefined()

  const all = shown(await band.find({ key: 'row' }))
  expect(JSON.stringify(await band.findAll({ type: 'Svg' }))).toContain('WARM')
  for (const gone of ['7D', '5H', 'COST', 'last $', 'resets', '●', 'm left', 'Robo, bobbing']) expect(all).not.toContain(gone)
  await band.unmount()
})

test('where even step 4 does not fit inline (37 columns with buttons), the buttons leave the compact row for a row of their own', async ($, on) => {
  const band = await mountAt($, on, 30)
  const row = await band.find({ key: 'buttons-row' })
  expect(row).toBeDefined()
  const inside = JSON.stringify(row)
  // The keep button sits beside the chip on the cache row, not among the buttons.
  expect(inside).not.toContain('keep-warm')
  expect(await band.find({ key: 'keep-warm' })).toBeDefined()
  expect(inside).toContain('cache-fold')
  expect(await band.find({ text: '99%' })).toBeDefined()
  await band.unmount()
})

test('at 160 columns the same content is one wide row, buttons inline with their words', async ($, on) => {
  const band = await mountAt($, on, 160)
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('✓')
  expect(await band.find({ text: ' 99% left' })).toBeDefined()
  await band.unmount()
})

test('with keep-warm off the label is the bare ✗, at the wide width too', async ($, on) => {
  const band = await mountAt($, on, 160, false)
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('✗')
  await band.unmount()
})

test('FOLD_COLS counts the fold button the way buttonCols counts every other button', () => {
  expect(FOLD_COLS).toBe(buttonCols('−'))
})

/** Every right-hand button wrapper has the same gap before it. */
const gapsAt = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], columns: number) => {
  const band = await mountAt($, on, columns)
  await band.press({ key: 'cache-fold' })
  for (const key of ['tab-overview', 'tab-context', 'tab-cost', 'fold']) {
    const box = await band.find({ key })
    expect(box).toBeDefined()
    expect([key, box?.props.marginLeft]).toEqual([key, BUTTON_GAP])
  }
  await band.unmount()
}

test('wide, card open: tabs and fold each have the same gap before them', async ($, on) => gapsAt($, on, 160))

test('compact, card open: tabs and fold each have the same gap before them', async ($, on) => gapsAt($, on, 70))

test('compact, card open: every hover tip sits wholly above its button, so its frame never crosses the row text', async ($, on) => {
  const band = await mountAt($, on, 70)
  expect(shown(await band.find({ key: 'row' })).split(' next').length - 1).toBe(1)
  await band.press({ key: 'cache-fold' })
  const tips = (await band.findAll({ type: 'Box' })).filter(b => b.props.position === 'absolute')
  expect(tips.length > 0).toBe(true)
  for (const t of tips) expect(t.props.bottom).toBe(TIP_LIFT)
  expect(TIP_LIFT >= rowsOf(26)).toBe(true)
  await band.unmount()
})

/** The keys of a box's children, in order. */
const keysOf = (b: { children?: { props?: { key?: string } }[] } | undefined) => (b?.children ?? []).map(c => c.props?.key)

test('wide: the keep button is the checkbox right after the chip, not among the right-hand buttons', async ($, on) => {
  const wide = await mountAt($, on, 160)
  expect(keysOf(await wide.find({ key: 'inline' }))).toEqual(['chip-group', 'keep'])
  expect((await wide.find({ key: 'keep-warm' }))?.props.label).toBe('✓')
  expect(keysOf(await wide.find({ key: 'row' })).includes('keep')).toBe(false)
  await wide.unmount()
})

test('compact: the keep button sits in the chip block after the next cost', async ($, on) => {
  const compact = await mountAt($, on, 70)
  expect(keysOf(await compact.find({ key: 'block' }))).toEqual(['chip-group', 'keep'])
  await compact.unmount()
})

const tabLabelsOf = async (band: Awaited<ReturnType<typeof mountAt>>) =>
  Promise.all(['overview', 'context', 'cost'].map(async id => (await band.find({ key: `tab-${id}-button` }))?.props.label))

test('tab buttons: none while the card is closed, words on the wide row, the chosen one in brackets, each before the fold button', async ($, on) => {
  const band = await mountAt($, on, 160)
  expect(await band.find({ key: 'tab-overview-button' })).toBeUndefined()
  await band.press({ key: 'cache-fold' })
  expect(await tabLabelsOf(band)).toEqual(['[Overview]', 'Context', 'Cost'])
  const keys = keysOf(await band.find({ key: 'row' }))
  expect(keys.slice(keys.indexOf('tab-overview'), keys.indexOf('fold') + 1)).toEqual(['tab-overview', 'tab-context', 'tab-cost', 'fold'])
  // Each carries hover text.
  for (const text of [/^Overview: /, /^Context: /, /^Cost: /]) expect(await band.find({ type: 'Text', text })).toBeDefined()
  // Pressing one chooses it: the card, the brackets and the store follow.
  await band.press({ key: 'tab-cost-button' })
  expect(await tabLabelsOf(band)).toEqual(['Overview', 'Context', '[Cost]'])
  expect(lastKv.get('cardTab')).toBe('cost')
  expect(JSON.stringify(await band.find({ key: 'card' }))).toContain('CACHE DISCOUNT')
  // Closing the card takes the tabs away.
  await band.press({ key: 'cache-fold' })
  expect(await band.find({ key: 'tab-cost-button' })).toBeUndefined()
  await band.unmount()
})

test('tab buttons: one glyph each on the compact row, the chosen one in brackets', async ($, on) => {
  const band = await mountAt($, on, 70, true, 70)
  expect(await tabLabelsOf(band)).toEqual(['[◷]', '◧', '$'])
  await band.unmount()
})

test('tab buttons: where they do not fit beside the row they join the buttons row, still before the fold button', async ($, on) => {
  const band = await mountAt($, on, 30, true, 70)
  const row = await band.find({ key: 'buttons-row' })
  expect(row).toBeDefined()
  const keys = keysOf(row)
  expect(keys.slice(keys.indexOf('tab-overview'), keys.indexOf('fold') + 1)).toEqual(['tab-overview', 'tab-context', 'tab-cost', 'fold'])
  expect(await tabLabelsOf(band)).toEqual(['[◷]', '◧', '$'])
  await band.unmount()
})

test('a stored tab is the one shown, and an unknown stored value reads as Overview', async ($, on) => {
  const band = await mountAt($, on, 160, true, 70)
  lastKv.set('cardTab', 'context')
  await band.press({ key: 'tab-context-button' })
  expect(await tabLabelsOf(band)).toEqual(['Overview', '[Context]', 'Cost'])
  lastKv.set('cardTab', 'bogus')
  await band.press({ key: 'tab-overview-button' })
  expect(await tabLabelsOf(band)).toEqual(['[Overview]', 'Context', 'Cost'])
  await band.unmount()
})

test('narrow: the keep button is on the cache row after the chip, before the spacer', async ($, on) => {
  const narrow = await mountAt($, on, 20)
  const cache = keysOf(await narrow.find({ key: 'cache' }))
  expect(cache.slice(0, 2)).toEqual(['chip-group', 'keep'])
  expect(cache.indexOf('grow')).toBeGreaterThan(cache.indexOf('keep'))
  await narrow.unmount()
})

test('the keep button is there in the terminal too, right after the chip', async ($, on) => {
  const band = await mountAt($, on, 160, true, 22, 'terminal')
  expect(keysOf(await band.find({ key: 'inline' }))).toEqual(['chip-group', 'keep'])
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('✓')
  await band.unmount()
})

test('at 100 columns, a usual desktop window, everything stays on one wide row', async ($, on) => {
  // Measured 2026-11-12: at about 102 columns the whole row fitted with some 14 columns to spare.
  const band = await mountAt($, on, 100)
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect(await band.find({ key: 'keep-warm' })).toBeDefined()
  await band.unmount()
})

// The estimates at this content (both windows, ≈$0.49, a warm chip, $0.04 next), desktop, without the buttons:
// step 0: 50, 1: 40 warm (50 cold), 2: 32, 3: 27, 4: 20 (a pie, 2 columns, in each window). With the buttons (fold, 6 columns) and 2 columns of slack:
// step 0 from 64 columns, 1 from 54, 2 from 46, 3 from 41, 4 from 34; under 34 the buttons take a row of their own.
const row = async (band: Awaited<ReturnType<typeof mountAt>>) => shown(await band.find({ key: 'row' }))

test('the ladder: warm shows the next cost at step 0 (64 columns)', async ($, on) => {
  const band = await mountAt($, on, 70)
  expect(await row(band)).toContain('next')
  await band.unmount()
})

test('the ladder: at 59 columns the next cost is hidden while warm, the total and the chip stay', async ($, on) => {
  const warm = await mountAt($, on, 59)
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

test('the ladder: at 43 columns Robo stands in for the chip', async ($, on) => {
  const band = await mountAt($, on, 43)
  const svgs = JSON.stringify(await band.findAll({ type: 'Svg' }))
  expect(svgs).toContain('Robo, bobbing')
  expect(svgs).not.toContain('WARM')
  expect(await band.find({ text: '99% left' })).toBeDefined()
  await band.unmount()
})

test('the ladder: at 40 columns the windows read 26% not 26% left, still inline', async ($, on) => {
  const band = await mountAt($, on, 40)
  expect(await band.find({ text: '99%' })).toBeDefined()
  expect(await row(band)).not.toContain('99% left')
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  await band.unmount()
})

test('the terminal keeps a one-letter chip once Robo would stand in', async ($, on) => {
  const band = await mountAt($, on, 34, true, 22, 'terminal')
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
  for (const text of [/^Show the cache card/, /^Keep warm is on/,/^Warm for 38 more minutes · keep warm on/]) {
    expect(await band.find({ type: 'Text', text })).toBeDefined()
  }
  // Hidden until hovered: the box around each text. (The kit does not expose the hover style itself.)
  const hidden = (await band.findAll({ type: 'Box' })).filter(b => b.props.display === 'none')
  expect(hidden.length).toBe(5)
  await band.unmount()
})

test('the terminal has no hover text: it has no pointer to hover with', async ($, on) => {
  const term = await mountAt($, on, 160, true, 22, 'terminal')
  expect(await term.find({ type: 'Text', text: /^Keep warm is on/ })).toBeUndefined()
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
  for (const key of ['cache-fold', 'keep-warm']) expect(await band.find({ key })).toBeDefined()
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

test('hovering a usage window on the wide row shows its name, what is left and when it resets', async ($, on) => {
  const band = await mountAt($, on, 160, true, 22, 'desktop', 40, NOW, WINDOWS)
  expect(await band.find({ type: 'Text', text: /^7-day limit · 1% used, 99% left · resets in 2d 0h$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^5-hour limit · 18% used, 82% left · resets in 1h 29m · pace ~26% at reset. /, })).toBeDefined()
  await band.unmount()
})

test('hovering a usage window on the compact row shows the same', async ($, on) => {
  const band = await mountAt($, on, 68, true, 22, 'desktop', 40, NOW, WINDOWS)
  expect(await band.find({ type: 'Text', text: /^7-day limit · 1% used, 99% left · resets in 2d 0h$/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /^5-hour limit · 18% used, 82% left · resets in 1h 29m · pace ~26% at reset. /, })).toBeDefined()
  await band.unmount()
})

test('the compact row writes what is used, as /usage does: 5h first, each with its short name', async ($, on) => {
  const band = await mountAt($, on, 68)
  const texts = (await band.findAll({ type: 'Text' })).map(t => String(t.props.children ?? t.text ?? ''))
  const at = (s: string) => texts.indexOf(s)
  expect(at('5h ')).toBeGreaterThan(-1)
  expect(at('18%')).toBe(at('5h ') + 1)
  expect(at('week ')).toBeGreaterThan(at('18%'))
  expect(at('1%')).toBe(at('week ') + 1)
  expect(texts).not.toContain('82% left')
  await band.unmount()
})

test('hovering a usage window on a row of three lines shows the same text', async ($, on) => {
  // Narrow enough for the tight layout, whose windows are blocks of three lines.
  const band = await mountAt($, on, 20)
  expect(await band.find({ type: 'Text', text: /^7-day limit · 1% used, 99% left · resets in/ })).toBeDefined()
  await band.unmount()
})

test('hovering the compact chip shows the minutes left while warm', async ($, on) => {
  const band = await mountAt($, on, 68)
  expect(await band.find({ type: 'Text', text: 'Warm for 38 more minutes · keep warm on, $0.05 an hour. Going cold would cost $1.60 to re-cache.' })).toBeDefined()
  await band.unmount()
})

test('hovering the compact chip shows the idle time once cold', async ($, on) => {
  const band = await mountAt($, on, 68, true, 125)
  expect(await band.find({ type: 'Text', text: 'Cold, idle 2h 5m. The next message re-caches for $1.60 on Opus (cheaper: Sonnet $0.80, Haiku $0.20). Keep warm costs $0.05 an hour.' })).toBeDefined()
  await band.unmount()
})

test('the hover boxes are hidden, each inside a visible keyed box', async ($, on) => {
  const band = await mountAt($, on, 160)
  const hidden = (await band.findAll({ type: 'Box' })).filter(b => b.props.display === 'none')
  for (const b of hidden) expect(b.props.key).toBeUndefined()
  expect(await band.find({ key: 'w-0' })).toBeDefined()
  await band.unmount()
})

test('fitOpen keeps the progress row only while it fits with the card', () => {
  const card = 10 * ROW_PX
  const bar = 2 * ROW_PX
  expect(fitOpen(13, 1, bar, card)).toEqual({ progress: true })
  expect(fitOpen(12, 1, bar, card)).toEqual({ progress: false })
  // With no progress row there is nothing to give up.
  expect(fitOpen(11, 1, 0, card)).toEqual({ progress: true })
  // The card stays even when it alone is taller than the band may be: the person opened it.
  expect(fitOpen(3, 1, bar, card)).toEqual({ progress: false })
})

test('the open wide card has no limits strip and no IDLE zone', async ($, on) => {
  const band = await mountAt($, on, 160)
  await band.press({ key: 'cache-fold' })
  const w = JSON.stringify(await band.find({ key: 'card' }))
  expect(w).toContain('SPEND')
  expect(w).not.toContain('800k free')
  for (const gone of ['LIMIT', 'IDLE']) expect(w.slice(w.lastIndexOf('</style>'))).not.toContain(gone)
  // The size is on the Context tab.
  await band.press({ key: 'tab-context-button' })
  expect(JSON.stringify(await band.find({ key: 'card' }))).toContain('800k free')
  await band.unmount()
})

test('the open card at 68 columns shows the conversation cost in the SPEND column, split into main and subagents', async ($, on) => {
  const band = await mountAt($, on, 68)
  await band.press({ key: 'cache-fold' })
  const c = JSON.stringify(await band.find({ key: 'card' }))
  expect(c).toContain('>SPEND<')
  expect(c).toContain('main $0.46 · subagents $0.03')
  await band.unmount()
})

test('the open card on one column shows the conversation cost as a status line', async ($, on) => {
  const band = await mountAt($, on, 45)
  await band.press({ key: 'cache-fold' })
  const c = JSON.stringify(await band.find({ key: 'card' }))
  expect(c).not.toContain('>SPEND<')
  expect(c).toContain('≈$0.49 this thread')
  await band.unmount()
})

test('compact, a low band drops the progress row from the open band instead of scrolling', async ($, on) => {
  on('tool.call', () => ({ result: 'ran' }))
  const band = await mountAt($, on, 68, true, 70, 'desktop', 8)
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: [{ content: 'Write tests', status: 'in_progress' }] } as never)
  expect(await band.find({ key: 'card' })).toBeDefined()
  expect(await band.find({ key: 'progress-row' })).toBeUndefined()
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

test('at 104 columns, with a cold cache idle 18 hours, the wide row and its word buttons no longer fit', async ($, on) => {
  // Measured on 2026-11-18: at 104 columns the wide row cut off the minutes and pushed the buttons out of view.
  const band = await mountAt($, on, 104, true, 18 * 60 + 18)
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('✗') // cold: keep warm is off with the cache
  await band.unmount()
})

test('at 150 columns the same row stays wide, the buttons with their words', async ($, on) => {
  const band = await mountAt($, on, 150, true, 18 * 60 + 18)
  expect((await band.find({ key: 'keep-warm' }))?.props.label).toBe('✗') // cold: keep warm is off with the cache
  await band.unmount()
})

test('a window whose reset time has passed shows 100% left, not the old share and "resetting"', async ($, on) => {
  // Two hours on: the 5-hour window reset at 23:29, the 7-day one has not.
  const band = await mountAt($, on, 160, true, 22, 'desktop', 40, NOW + 2 * 3600_000, WINDOWS)
  const row = shown((await band.find({ key: 'row' }))!)
  expect(row).toContain('0% used')
  expect(row).not.toContain('resetting')
  await band.unmount()
})

test('a render keeps no pace samples in the store: the pace comes from the window itself', async ($, on) => {
  const band = await mountAt($, on, 160)
  await band.press({ key: 'cache-fold' })
  expect([...lastKv.keys()].filter(k => k.startsWith('pace:'))).toEqual([])
  await band.unmount()
})

test('the open wide card shows the pace from the first reading, with the forecast under each bar, and no keep warm column', async ($, on) => {
  const band = await mountAt($, on, 160, true, 22, 'desktop', 40, NOW, WINDOWS)
  await band.press({ key: 'cache-fold' })
  const w = JSON.stringify(await band.find({ key: 'card' }))
  for (const z of ['PACE VS RESET', ' · resets 1h 29m']) expect(w).toContain(z)
  expect(w).not.toContain('KEEP WARM')
  expect(w).not.toContain('pace unknown')
  await band.unmount()
})

test('the open wide card draws the last seven days of spend from the store, today in the hue', async ($, on) => {
  const band = await mountAt($, on, 160)
  lastKv.set(dayKey(NOW), 3)
  lastKv.set(dayKey(NOW - 24 * 3600_000), 1.5)
  await band.press({ key: 'cache-fold' })
  const w = JSON.stringify(await band.find({ key: 'card' }))
  expect(w).toContain('today $3.00 · week $4.50')
  await band.unmount()
})

test('the open card at 68 columns has no keep warm status line and has the pace strip', async ($, on) => {
  const band = await mountAt($, on, 68, true, 22, 'desktop', 40, NOW, WINDOWS)
  await band.press({ key: 'cache-fold' })
  const c = JSON.stringify(await band.find({ key: 'card' }))
  expect(c).not.toContain('keep warm $')
  expect(c).toContain('PACE VS RESET')
  expect(c).toContain('resets 1h 29m')
  await band.unmount()
})

test('cardColsOf: as many columns as fit at CARD_COL_PX each plus the 26 px gap, from one to four', () => {
  expect(CARD_COL_PX).toBe(315)
  // (W - 26 + 26) / (315 + 26): two columns from 682, three from 1023, four from 1364.
  expect([0, 300, 681].map(cardColsOf)).toEqual([1, 1, 1])
  expect([682, 800, 1022].map(cardColsOf)).toEqual([2, 2, 2])
  expect([1023, 1100, 1363].map(cardColsOf)).toEqual([3, 3, 3])
  expect([1364, 1400, 1800, 5000].map(cardColsOf)).toEqual([4, 4, 4, 4])
})

test('at 120 columns the open card is the Overview with its two wide columns, and the metric cells are on the other tabs', async ($, on) => {
  const band = await mountAt($, on, 120)
  await band.press({ key: 'cache-fold' })
  const c = JSON.stringify(await band.find({ key: 'card' }))
  for (const z of ['PACE VS RESET', '>DELEGATION<', '>SPEND<']) expect(c).toContain(z)
  for (const gone of ['KEEP WARM', 'CACHE HIT', 'TOOL OUTPUT']) expect(c).not.toContain(gone)
  await band.press({ key: 'tab-context-button' })
  const ctx = JSON.stringify(await band.find({ key: 'card' }))
  for (const z of ['CONVERSATION SIZE', 'TOOL OUTPUT']) expect(ctx).toContain(z)
  expect(ctx).not.toContain('PACE VS RESET')
  await band.unmount()
})

test('at 68 columns the open card has the pace strip and two columns, and no keep warm line', async ($, on) => {
  const band = await mountAt($, on, 68)
  await band.press({ key: 'cache-fold' })
  const c = JSON.stringify(await band.find({ key: 'card' }))
  expect(c).toContain('PACE VS RESET')
  expect(c).toContain('>SPEND<')
  expect(c).not.toContain('keep warm $')
  await band.unmount()
})

test('/spendometer fold opens and closes the card like the fold button', async ($, on) => {
  const band = await mountAt($, on, 160)
  const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
  const fold = async () => ((await $.command.run({ command: 'spendometer', args: 'fold', ...RUN })) as { text: string }).text
  // Warm: the card starts closed.
  expect(await band.find({ key: 'card' })).toBeUndefined()
  expect(await fold()).toBe('cache card: open')
  expect(await band.find({ key: 'card' })).toBeDefined()
  expect(await fold()).toBe('cache card: closed')
  expect(await band.find({ key: 'card' })).toBeUndefined()
  // The button and the command share one state.
  await band.press({ key: 'cache-fold' })
  expect(await fold()).toBe('cache card: closed')
  await band.unmount()
})

// ---------- The 5h pace in the top row (backlog 70) ----------
/** 18% used, 1h 29m left: on pace, about 26% at the reset. */
const ON_PACE = WINDOWS
/** 60% used, 3h left (2h gone of 5): over pace, it runs out in 1h 20m. */
const OVER_PACE = [{ kind: 'five_hour', percentUsed: 60, resetsAt: '2099-01-01T01:00:00Z' }, WINDOWS[1]]
type Ctx = Parameters<Parameters<typeof test>[1]>
const paced = ($: Ctx[0], on: Ctx[1], cols: number, limits: readonly object[], surface: 'desktop' | 'terminal' = 'desktop') => mountAt($, on, cols, true, 22, surface, 40, NOW, limits)
const rowOf = async (band: Awaited<ReturnType<typeof mountAt>>) => shown((await band.find({ key: 'row' }))!)
const tracks = async (band: Awaited<ReturnType<typeof mountAt>>) => (await band.findAll({ type: 'Svg' })).filter(s => String(s.props.alt).includes(' pace: '))

test('wide row, on pace: a 64 px track after the percent, then "~26% at reset ✓"; the reset time moves to the tip', async ($, on) => {
  const band = await paced($, on, 160, ON_PACE)
  const row = await rowOf(band)
  expect(row).toContain('5H  18% used ~26% at reset ✓')
  expect(row).not.toContain('· 1h 29m')
  const t = await tracks(band)
  expect(t.length).toBe(1)
  expect(t[0].props.width).toBe(64)
  expect(t[0].props.height).toBe(16)
  expect(await band.find({ type: 'Text', text: /^5-hour limit · 18% used, 82% left · resets in 1h 29m · pace ~26% at reset\. The white line/ })).toBeDefined()
  await band.unmount()
})

test('wide row, over pace: "out in ~1h 20m" in red, the track fill red', async ($, on) => {
  const band = await paced($, on, 160, OVER_PACE)
  const row = await rowOf(band)
  expect(row).toContain('5H  60% used out in ~1h 20m')
  expect(await band.find({ type: 'Text', text: ' ✓' })).toBeUndefined()
  expect((await tracks(band))[0].props.source).toContain(`width="38" height="6" rx="3" fill="${DANGER}"`)
  expect(await band.find({ type: 'Text', text: ' out in ~1h 20m', props: { color: DANGER } })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /pace runs out in ~1h 20m\./ })).toBeDefined()
  await band.unmount()
})

test('compact row: a 44 px track and the check on pace, "out 1h" in red over pace; 7D has none', async ($, on) => {
  const on1 = await paced($, on, 70, ON_PACE)
  expect(await rowOf(on1)).toContain('5h 18% ✓')
  const t = await tracks(on1)
  expect(t.length).toBe(1)
  expect(t[0].props.width).toBe(44)
  await on1.unmount()
})

test('compact row, over pace', async ($, on) => {
  const band = await paced($, on, 75, OVER_PACE)
  expect(await rowOf(band)).toContain('5h 60% out 1h')
  expect(await band.find({ type: 'Text', text: ' out 1h', props: { color: DANGER } })).toBeDefined()
  await band.unmount()
})

test('tight row, on pace: a 30 px track and the check', async ($, on) => {
  const band = await paced($, on, 20, ON_PACE)
  expect((await tracks(band))[0].props.width).toBe(30)
  expect(await band.find({ type: 'Text', text: ' ✓' })).toBeDefined()
  await band.unmount()
})

test('tight row, over pace: "1h", no "out"', async ($, on) => {
  const band = await paced($, on, 20, OVER_PACE)
  const row = await rowOf(band)
  expect(row).toContain('1h')
  expect(row).not.toContain('out')
  await band.unmount()
})

for (const cols of [160, 70, 20]) {
  test(`with the pace unknown the row (${cols} columns) is what it was: no track, no words`, async ($, on) => {
    const band = await mountAt($, on, cols)
    expect(await tracks(band)).toEqual([])
    const row = await rowOf(band)
    for (const w of ['at reset', 'out']) expect(row).not.toContain(w)
    expect(await band.find({ type: 'Text', text: ' ✓' })).toBeUndefined()
    await band.unmount()
  })
}

test('the terminal writes the words with no drawing, and keeps the reset time on the wide row', async ($, on) => {
  const band = await paced($, on, 200, ON_PACE, 'terminal')
  expect(await tracks(band)).toEqual([])
  expect(await rowOf(band)).toContain('82% left · 1h 29m ~26% at reset ✓')
  await band.unmount()
})

test('the terminal, over pace on the compact row: "out 1h"', async ($, on) => {
  const band = await paced($, on, 70, OVER_PACE, 'terminal')
  expect(await rowOf(band)).toContain('out 1h')
  await band.unmount()
})

test('the track and words are counted: at 120 columns the row without pace is wide, with pace it gives way to the compact row', async ($, on) => {
  const band = await paced($, on, 120, ON_PACE)
  expect(await rowOf(band)).not.toContain('USAGE')
  await band.unmount()
})

test('without pace the same 120 columns are one wide row', async ($, on) => {
  const band = await mountAt($, on, 120)
  expect(await rowOf(band)).toContain('USAGE')
  await band.unmount()
})

test('compact row, over pace, squeezed: the ladder drops "out" and keeps the time', async ($, on) => {
  const band = await paced($, on, 64, OVER_PACE)
  expect(await rowOf(band)).toContain('5h 60% 1h')
  await band.unmount()
})

// One test a width: the mock's hooks can be registered once per test.
for (const columns of [160, 100, 70, 30]) {
  test(`no Wrap up button at ${columns} columns, even with the old setting in the store and a debrief command`, async ($, on) => {
    legacyWrap = true
    try {
      const band = await mountAt($, on, columns)
      expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
      expect(await band.find({ key: 'wrap' })).toBeUndefined()
      await band.unmount()
    } finally {
      legacyWrap = false
    }
  })
}
