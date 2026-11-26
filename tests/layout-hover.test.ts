import { expect, test } from 'claude-code/testing'

import { shown } from './visible'
import { NOW, WINDOWS, lastKv, mountAt } from './layout-kit'
test('each button carries hover text on the desktop, and none in the terminal', async ($, on) => {
  const band = await mountAt($, on, 160)
  for (const text of [/^Show the cache card/, /^Keep warm is on/,/^Warm for 38 more minutes · keep warm on/]) {
    expect(await band.find({ type: 'Text', text })).toBeDefined()
  }
  // Hidden until hovered: the box around each text. (The kit does not expose the hover style itself.)
  const hidden = (await band.findAll({ type: 'Box' })).filter(b => b.props.display === 'none')
  expect(hidden.length).toBe(7)
  await band.unmount()
})

test('the terminal has no hover text: it has no pointer to hover with', async ($, on) => {
  const term = await mountAt($, on, 160, true, 22, 'terminal')
  expect(await term.find({ type: 'Text', text: /^Keep warm is on/ })).toBeUndefined()
  await term.unmount()
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

test('hovering a window on the last compact steps shows the same text as on the wide row', async ($, on) => {
  // 36 columns: the narrowest step with both windows (the minimal row has the 5h window alone).
  const band = await mountAt($, on, 36)
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

for (const columns of [44, 36]) {
  test(`at ${columns} columns a button's hover text is no wider than the room left of the buttons, so it is not cut off`, async ($, on) => {
    // Seen 2026-11-26: the tab tips, 44 columns wide and anchored at the button's right, ran past the band's left edge.
    const band = await mountAt($, on, columns)
    const right = (await band.findAll({ type: 'Box' })).filter(b => b.props.position === 'absolute' && b.props.right === 0)
    expect(right.length).toBeGreaterThan(0)
    for (const b of right) expect(Number(b.props.width) <= columns - 16).toBe(true)
    await band.unmount()
  })
}

test('the hover boxes are hidden, each inside a visible keyed box', async ($, on) => {
  const band = await mountAt($, on, 160)
  const hidden = (await band.findAll({ type: 'Box' })).filter(b => b.props.display === 'none')
  for (const b of hidden) expect(b.props.key).toBeUndefined()
  expect(await band.find({ key: 'w-0' })).toBeDefined()
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
