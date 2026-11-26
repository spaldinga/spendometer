import { expect, test } from 'claude-code/testing'

import { BUTTON_GAP, rowsOf, TIP_LIFT } from '../hooks/layout'
import { shown } from './visible'
import { lastKv, mountAt, setLegacyWrap } from './layout-kit'
test('at 90 columns the compact row holds only the essentials, buttons inline as icons', async ($, on) => {
  const band = await mountAt($, on, 90)
  // The estimate: the compact row is 56 columns here (step 0), the icon button 6 and 2 columns of slack: with the tabs (2 more icon buttons) 85 is the least width for step 0 with the buttons inline.
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect(await band.find({ key: 'keep' })).toBeDefined()
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

test('the compact buttons: fold and two tabs are 3 × 4 columns = 12 (the emoji width is not yet measured in the app)', async ($, on) => {
  // At 6 columns a button the band sent them to a row of their own at 58 columns with half the row empty.
  const band = await mountAt($, on, 64)
  const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
  const text = ((await $.command.run({ command: 'spendometer', args: '', ...RUN })) as { text: string }).text
  expect(text).toMatch(/compact [\d/]+\+12\b/)
  await band.unmount()
})

test('at 160 columns the same content is one wide row, buttons inline with their words', async ($, on) => {
  const band = await mountAt($, on, 160)
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect(await band.find({ key: 'keep' })).toBeDefined()
  expect(await band.find({ text: ' 99% left' })).toBeDefined()
  await band.unmount()
})

test('with keep-warm off the label is the bare ✗, at the wide width too', async ($, on) => {
  const band = await mountAt($, on, 160, false)
  expect(await band.find({ key: 'keep' })).toBeUndefined()
  await band.unmount()
})

/** Every right-hand button wrapper has the same gap before it. */
const gapsAt = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1], columns: number) => {
  const band = await mountAt($, on, columns)
  await band.press({ key: 'cache-fold' })
  for (const key of ['tab-cost', 'tab-capacity', 'fold']) {
    const box = await band.find({ key })
    expect(box).toBeDefined()
    expect([key, box?.props.marginLeft]).toEqual([key, BUTTON_GAP])
  }
  await band.unmount()
}

test('wide, card open: tabs and fold each have the same gap before them', async ($, on) => gapsAt($, on, 160))

test('compact, card open: tabs and fold each have the same gap before them', async ($, on) => gapsAt($, on, 70))

test('compact, card open: every hover tip sits wholly above its button, so its frame never crosses the row text', async ($, on) => {
  const band = await mountAt($, on, 90)
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
  expect(await wide.find({ key: 'keep' })).toBeDefined()
  expect(keysOf(await wide.find({ key: 'row' })).includes('keep')).toBe(false)
  await wide.unmount()
})

test('compact: the keep button sits in the chip block after the next cost', async ($, on) => {
  const compact = await mountAt($, on, 70)
  expect(keysOf(await compact.find({ key: 'block' }))).toEqual(['chip-group', 'keep'])
  await compact.unmount()
})

const tabLabelsOf = async (band: Awaited<ReturnType<typeof mountAt>>) =>
  Promise.all(['cost', 'capacity'].map(async id => (await band.find({ key: `tab-${id}-button` }))?.props.label))

test('tab buttons: there with the card closed, words on the wide row, one press opens the card on that tab, the others dimmed, each before the fold button', async ($, on) => {
  const band = await mountAt($, on, 160)
  expect(await band.find({ key: 'card' })).toBeUndefined()
  expect(await tabLabelsOf(band)).toEqual(['💰 Cost', '🔋 Capacity'])
  const keys = keysOf(await band.find({ key: 'row' }))
  expect(keys.slice(keys.indexOf('tab-cost'), keys.indexOf('fold') + 1)).toEqual(['tab-cost', 'tab-capacity', 'fold'])
  // Each carries hover text.
  for (const text of [/^Cost: /, /^Capacity: /]) expect(await band.find({ type: 'Text', text })).toBeDefined()
  // Closed: a tab opens the card and is stored, in one press.
  await band.press({ key: 'tab-cost-button' })
  expect(await tabLabelsOf(band)).toEqual(['💰 Cost', '🔋 Capacity'])
  expect(lastKv.get('cardTab')).toBe('cost')
  expect(JSON.stringify(await band.find({ key: 'card' }))).toContain('CACHE DISCOUNT')
  // Open: another tab switches, the card stays.
  await band.press({ key: 'tab-capacity-button' })
  expect(await band.find({ key: 'card' })).toBeDefined()
  expect(lastKv.get('cardTab')).toBe('capacity')
  expect(await tabLabelsOf(band)).toEqual(['💰 Cost', '🔋 Capacity'])
  // Open: the tab in use closes the card; the tabs stay, the tab stays chosen.
  await band.press({ key: 'tab-capacity-button' })
  expect(await band.find({ key: 'card' })).toBeUndefined()
  expect(await tabLabelsOf(band)).toEqual(['💰 Cost', '🔋 Capacity'])
  expect(lastKv.get('cardTab')).toBe('capacity')
  // The fold button opens it again on that tab.
  await band.press({ key: 'cache-fold' })
  expect(await band.find({ key: 'card' })).toBeDefined()
  expect(await tabLabelsOf(band)).toEqual(['💰 Cost', '🔋 Capacity'])
  await band.unmount()
})

test('a tab press and the fold button share one state: open via a tab, then /spendometer fold closes it', async ($, on) => {
  const band = await mountAt($, on, 160)
  const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
  const fold = async () => ((await $.command.run({ command: 'spendometer', args: 'fold', ...RUN })) as { text: string }).text
  await band.press({ key: 'tab-cost-button' })
  expect(await band.find({ key: 'card' })).toBeDefined()
  expect(await fold()).toBe('cache card: closed')
  expect(await band.find({ key: 'card' })).toBeUndefined()
  // And the other way: opened by the command, the tab in use closes it.
  expect(await fold()).toBe('cache card: open')
  await band.press({ key: 'tab-cost-button' })
  expect(await band.find({ key: 'card' })).toBeUndefined()
  expect(await fold()).toBe('cache card: open')
  await band.unmount()
})

/** How the band lays out its row: wide or stacked, whether the buttons have a row, and the row's children. */
const layoutSignature = async (band: Awaited<ReturnType<typeof mountAt>>) =>
  JSON.stringify([!!(await band.find({ key: 'inline' })), !!(await band.find({ key: 'block' })), !!(await band.find({ key: 'buttons-row' })), keysOf(await band.find({ key: 'row' }))])

for (const columns of [160, 90, 70, 58, 40, 36, 30, 20]) {
  test(`the layout is the same with the card open and closed (${columns} columns)`, async ($, on) => {
    const band = await mountAt($, on, columns)
    const closed = await layoutSignature(band)
    await band.press({ key: (await band.find({ key: 'tab-cost-button' })) ? 'tab-cost-button' : 'cache-fold' })
    expect(await band.find({ key: 'card' })).toBeDefined()
    expect(await layoutSignature(band)).toBe(closed)
    await band.unmount()
  })
}

test('the terminal has no tab buttons, open or closed, and no card to open', async ($, on) => {
  const band = await mountAt($, on, 160, true, 22, 'terminal')
  expect(await tabLabelsOf(band)).toEqual([undefined, undefined])
  expect(await band.find({ key: 'cache-fold' })).toBeUndefined()
  await band.unmount()
})

test('tab buttons: one glyph each on the compact row, the others dimmed', async ($, on) => {
  const band = await mountAt($, on, 70, true, 70)
  expect(await tabLabelsOf(band)).toEqual(['💰', '🔋'])
  await band.unmount()
})

test('a stored tab is the one shown: the old names read as their domains, and an unknown stored value as Cost', async ($, on) => {
  const band = await mountAt($, on, 160, true, 70)
  // Close the card, store a value, open it again: it is drawn on the tab the value reads as.
  const opened = async (stored: string) => {
    if (await band.find({ key: 'card' })) await band.press({ key: 'cache-fold' })
    lastKv.set('cardTab', stored)
    await band.press({ key: 'cache-fold' })
    return JSON.stringify(await band.find({ key: 'card' }))
  }
  for (const stored of ['context', 'capacity']) expect(await opened(stored)).toContain('PACE VS RESET')
  for (const stored of ['overview', 'cost', 'bogus']) {
    const card = await opened(stored)
    expect(card).toContain('SPEND')
    expect(card).not.toContain('PACE VS RESET')
  }
  await band.unmount()
})

test('the terminal, narrow: the keep button is on the cache row after the chip, before the spacer', async ($, on) => {
  const narrow = await mountAt($, on, 12, true, 22, 'terminal')
  const cache = keysOf(await narrow.find({ key: 'cache' }))
  expect(cache.slice(0, 2)).toEqual(['chip-group', 'keep'])
  expect(cache.indexOf('grow')).toBeGreaterThan(cache.indexOf('keep'))
  await narrow.unmount()
})

test('the keep button is there in the terminal too, right after the chip', async ($, on) => {
  const band = await mountAt($, on, 160, true, 22, 'terminal')
  expect(keysOf(await band.find({ key: 'inline' }))).toEqual(['chip-group', 'keep'])
  expect(await band.find({ key: 'keep' })).toBeDefined()
  await band.unmount()
})

test('at 100 columns, a usual desktop window, every button stays on the first row', async ($, on) => {
  // Since the tabs always show (2026-11-26) the wide row needs about 140 columns; 100 is compact step 0.
  const band = await mountAt($, on, 100)
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  expect(await band.find({ key: 'keep' })).toBeDefined()
  await band.unmount()
})

// One test a width: the mock's hooks can be registered once per test.
for (const columns of [160, 100, 70, 30]) {
  test(`no Wrap up button at ${columns} columns, even with the old setting in the store and a debrief command`, async ($, on) => {
    setLegacyWrap(true)
    try {
      const band = await mountAt($, on, columns)
      expect(await band.find({ key: 'wrap-up' })).toBeUndefined()
      expect(await band.find({ key: 'wrap' })).toBeUndefined()
      await band.unmount()
    } finally {
      setLegacyWrap(false)
    }
  })
}
