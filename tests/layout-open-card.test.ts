import { expect, test } from 'claude-code/testing'

import { dayKey } from '../hooks/cost/spend/days'
import { CARD_COL_PX, ROW_PX, cardColsOf, fitOpen } from '../hooks/layout'
import { NOW, WINDOWS, lastKv, mountAt } from './layout-kit'
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
  for (const key of ['cache-fold', 'keep']) expect(await band.find({ key })).toBeDefined()
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
  // The size is on the Capacity tab.
  await band.press({ key: 'tab-capacity-button' })
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

test('the open card on one column has the SPEND column and the other Cost zones as status lines', async ($, on) => {
  const band = await mountAt($, on, 45)
  await band.press({ key: 'cache-fold' })
  const c = JSON.stringify(await band.find({ key: 'card' }))
  expect(c).toContain('>SPEND<')
  expect(c).toContain('≈$0.49')
  for (const line of ['delegation', 'cache discount', 'per message', 'by model']) expect(c).toContain(line)
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

test('the open wide card shows the pace from the first reading, with the forecast under each bar, and no keep warm column', async ($, on) => {
  const band = await mountAt($, on, 160, true, 22, 'desktop', 40, NOW, WINDOWS)
  await band.press({ key: 'tab-capacity-button' })
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
  await band.press({ key: 'tab-capacity-button' })
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

test('at 120 columns the open card is the Cost tab with its wide columns, and the pace and size are on Capacity', async ($, on) => {
  const band = await mountAt($, on, 120)
  await band.press({ key: 'cache-fold' })
  const c = JSON.stringify(await band.find({ key: 'card' }))
  for (const z of ['>SPEND<', '>DELEGATION<']) expect(c).toContain(z)
  for (const gone of ['KEEP WARM', 'CACHE HIT', 'TOOL OUTPUT', 'PACE VS RESET']) expect(c).not.toContain(gone)
  await band.press({ key: 'tab-capacity-button' })
  const capacity = JSON.stringify(await band.find({ key: 'card' }))
  for (const z of ['PACE VS RESET', 'CONVERSATION SIZE', 'TOOL OUTPUT']) expect(capacity).toContain(z)
  expect(capacity).not.toContain('>SPEND<')
  await band.unmount()
})

test('at 68 columns the open card is the Cost tab on one column, and Capacity has the pace strip, with no keep warm line', async ($, on) => {
  const band = await mountAt($, on, 68)
  await band.press({ key: 'cache-fold' })
  const c = JSON.stringify(await band.find({ key: 'card' }))
  expect(c).toContain('>SPEND<')
  expect(c).not.toContain('PACE VS RESET')
  expect(c).not.toContain('keep warm $')
  await band.press({ key: 'tab-capacity-button' })
  expect(JSON.stringify(await band.find({ key: 'card' }))).toContain('PACE VS RESET')
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
