import { expect, test } from 'claude-code/testing'

import { FOLD_COLS, buttonCols, layoutOf } from '../hooks/layout'
import { shown } from './visible'
import { lastKv, mountAt, row, ON_PACE, paced, tracks } from './layout-kit'
// The compact row's five variants (each narrower), the fold button and the icon buttons (6 columns each), and the wide row's word buttons.
const NEED = { wide: 118, compact: [60, 52, 46, 40, 34], tight: 15, buttons: 18, buttonsWide: 4 + 14 + 12, fold: 0 }
const SLACK = 2

test('a width that fits the wide row and the word buttons keeps the buttons inline', () => {
  expect(layoutOf(160, NEED)).toEqual({ kind: 'wide', buttonsRow: false, compactStep: 0, fold: true })
  expect(layoutOf(NEED.wide + NEED.buttonsWide, NEED)).toEqual({ kind: 'wide', buttonsRow: false, compactStep: 0, fold: true })
})

test('where the wide row does not fit, the compact row with everything and the buttons inline is chosen', () => {
  expect(layoutOf(NEED.wide + NEED.buttonsWide - 1, NEED).kind).toBe('stacked')
  expect(layoutOf(NEED.compact[0] + NEED.buttons + SLACK, NEED)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 0, fold: true })
})

test('each step is chosen when the one before does not fit, with 2 columns of slack', () => {
  for (let s = 1; s < 5; s++) {
    const room = NEED.compact[s] + NEED.buttons + SLACK
    expect(layoutOf(room, NEED)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: s, fold: true })
    // One column less and this step has no slack left: the next one (or the buttons row) takes over.
    expect(layoutOf(room - 1, NEED).compactStep).toBe(Math.min(s + 1, 4))
  }
  // Fits step 0 exactly with the buttons but not with the slack: step 1.
  expect(layoutOf(NEED.compact[0] + NEED.buttons, NEED).compactStep).toBe(1)
})

test('the buttons leave for a row of their own only after the last step fails inline', () => {
  const inline4 = NEED.compact[4] + NEED.buttons + SLACK
  expect(layoutOf(inline4, NEED)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4, fold: true })
  expect(layoutOf(inline4 - 1, NEED)).toEqual({ kind: 'stacked', buttonsRow: true, compactStep: 4, fold: true })
  expect(layoutOf(NEED.compact[4], NEED)).toEqual({ kind: 'stacked', buttonsRow: true, compactStep: 4, fold: true })
})

test('very narrow is tight, with the buttons on the cache row when they fit and on their own row when not', () => {
  expect(layoutOf(NEED.compact[4] - 1, { ...NEED, tight: 15 })).toEqual({ kind: 'tight', buttonsRow: false, compactStep: 0, fold: true })
  const t = { ...NEED, compact: [200, 200, 200, 200, 200] }
  expect(layoutOf(t.tight + t.buttons, t)).toEqual({ kind: 'tight', buttonsRow: false, compactStep: 0, fold: true })
  expect(layoutOf(t.tight + t.buttons - 1, t)).toEqual({ kind: 'tight', buttonsRow: true, compactStep: 0, fold: true })
  expect(layoutOf(20, t)).toEqual({ kind: 'tight', buttonsRow: true, compactStep: 0, fold: true })
})

test('with no buttons there is never a buttons row', () => {
  const n = { ...NEED, buttons: 0, buttonsWide: 0 }
  expect(layoutOf(NEED.compact[4], n)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4, fold: true })
  expect(layoutOf(10, n)).toEqual({ kind: 'tight', buttonsRow: false, compactStep: 0, fold: true })
})

// The fold button goes when the tabs are there: they open and close the card, so + is only for the room it leaves.
const DROPS = { ...NEED, fold: 6 }
test('the fold button is dropped before the buttons leave the row: step 4 inline without it, then off the row without it', () => {
  const full = DROPS.compact[4] + DROPS.buttons + SLACK
  expect(layoutOf(full, DROPS)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4, fold: true })
  const bare = DROPS.compact[4] + (DROPS.buttons - DROPS.fold) + SLACK
  expect(layoutOf(full - 1, DROPS)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4, fold: false })
  expect(layoutOf(bare, DROPS)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4, fold: false })
  expect(layoutOf(bare - 1, DROPS)).toEqual({ kind: 'stacked', buttonsRow: true, compactStep: 4, fold: false })
  expect(layoutOf(DROPS.compact[4], DROPS)).toEqual({ kind: 'stacked', buttonsRow: true, compactStep: 4, fold: false })
})

test('tight without the fold button: the buttons stay on the cache row when they fit, else off it', () => {
  const t = { ...DROPS, compact: [200, 200, 200, 200, 200] }
  expect(layoutOf(t.tight + t.buttons - t.fold, t)).toEqual({ kind: 'tight', buttonsRow: false, compactStep: 0, fold: false })
  expect(layoutOf(t.tight + t.buttons - t.fold - 1, t)).toEqual({ kind: 'tight', buttonsRow: true, compactStep: 0, fold: false })
})

test('wide and the earlier compact steps keep the fold button even when it could be dropped', () => {
  expect(layoutOf(160, DROPS)).toEqual({ kind: 'wide', buttonsRow: false, compactStep: 0, fold: true })
  expect(layoutOf(DROPS.compact[2] + DROPS.buttons + SLACK, DROPS)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 2, fold: true })
})

// The desktop's slim steps and the minimal row: widths without buttons, each narrower than the step before.
const SLIM = { ...DROPS, slim: [30, 24, 16], minimal: 18 }
const BARE = SLIM.buttons - SLIM.fold
test('desktop: after step 4 without +, the row slims one step at a time (no track, no keep, 5h only), tabs inline', () => {
  expect(layoutOf(SLIM.compact[4] + BARE + SLACK, SLIM)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4, fold: false })
  for (let i = 0; i < 3; i++) {
    const room = SLIM.slim[i] + BARE + SLACK
    expect(layoutOf(room, SLIM)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 4, fold: false, slim: i + 1 })
    // One column less and the next step (or the minimal row) takes over.
    expect(layoutOf(room - 1, SLIM).slim).toBe(i === 2 ? 3 : i + 2)
  }
})

test('desktop: below the last slim step the minimal row, with + and no tabs, whatever the width (even 0)', () => {
  const room = SLIM.slim[2] + BARE + SLACK - 1
  expect(layoutOf(room, SLIM)).toEqual({ kind: 'minimal', buttonsRow: false, compactStep: 4, fold: true, slim: 3 })
  expect(layoutOf(0, SLIM).kind).toBe('minimal')
  expect(layoutOf(0, SLIM).buttonsRow).toBe(false)
})

test('desktop: wide and the earlier compact steps are unchanged by the slim steps', () => {
  expect(layoutOf(160, SLIM).kind).toBe('wide')
  expect(layoutOf(SLIM.compact[1] + SLIM.buttons + SLACK, SLIM)).toEqual({ kind: 'stacked', buttonsRow: false, compactStep: 1, fold: true })
})

test('FOLD_COLS counts the fold button the way buttonCols counts every other button', () => {
  expect(FOLD_COLS).toBe(buttonCols('−'))
})

// The estimates at this content (both windows, ≈$0.49, a warm chip, $0.04 next), desktop, without the buttons:
// step 0: 53, 1: 43 warm, 2: 35, 3: 30, 4: 23 (a pie, 2 columns, in each window; the keep box 3 columns, measured 2026-11-26). The buttons
// are the fold and three tabs, 4 columns each (16), and the fold is 4 of those. With 2 columns of slack:
// step 0 from 72 columns, 1 from 62, 2 from 54, 3 from 49, 4 from 42 (with +); from 38 step 4 still inline but without +;
// then slimmer variants of step 4: no pace track (23, same here as no pace shows), no keep box 20 (from 35), the 5h window
// alone 14 (from 29); at 28 columns and under the minimal row (18: 5h pie and percent, Robo, +). Never a buttons row (desktop).

test('the ladder: warm shows the next cost at step 0 (from 73 columns)', async ($, on) => {
  const band = await mountAt($, on, 75)
  expect(await row(band)).toContain('next')
  await band.unmount()
})

test('the ladder: at 64 columns the next cost is hidden while warm, the total and the chip stay', async ($, on) => {
  const warm = await mountAt($, on, 64)
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

test('the ladder: at 56 columns the cost total is gone', async ($, on) => {
  const band = await mountAt($, on, 56)
  expect(await band.find({ key: 'spend-total' })).toBeUndefined()
  expect(JSON.stringify(await band.findAll({ type: 'Svg' }))).toContain('WARM')
  expect(await band.find({ text: '99% left' })).toBeDefined()
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  await band.unmount()
})

test('the ladder: at 50 columns Robo stands in for the chip', async ($, on) => {
  const band = await mountAt($, on, 50)
  const svgs = JSON.stringify(await band.findAll({ type: 'Svg' }))
  expect(svgs).toContain('Robo, bobbing')
  expect(svgs).not.toContain('WARM')
  expect(await band.find({ text: '99% left' })).toBeDefined()
  await band.unmount()
})

test('the ladder: at 44 columns the windows read 26% not 26% left, still inline', async ($, on) => {
  const band = await mountAt($, on, 44)
  expect(await band.find({ text: '99%' })).toBeDefined()
  expect(await row(band)).not.toContain('99% left')
  expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
  await band.unmount()
})

const PLAN = [
  { content: 'Read the code', status: 'completed' },
  { content: 'Write tests', status: 'in_progress' },
  { content: 'Run tests', status: 'pending' },
]
const planOn = ($: Parameters<Parameters<typeof test>[1]>[0]) => {
  return $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: PLAN } as never)
}
const TABS_ON = ['tab-overview-button', 'tab-context-button', 'tab-cost-button']

// The desktop band is one row at every width. Probed 2026-11-26 from the band's debug line, at the plain content
// (no pace shown): step 4 inline with + from 42 columns, without + from 38, no keep box from 35, the 5h window alone
// from 29, the minimal row below that. With the 5h pace shown (ON_PACE) step 4 is 7 columns wider (30 against 23):
// with + from 49, without + from 45, no pace track and words from 38.
test('narrow ladder: at 44 columns the buttons are inline with the + button', async ($, on) => {
  const band = await mountAt($, on, 44)
  expect(await band.find({ key: 'cache-fold' })).toBeDefined()
  for (const key of TABS_ON) expect(await band.find({ key })).toBeDefined()
  await band.unmount()
})

test('narrow ladder: at 38 columns the tabs are inline without the + button, the tabs open and close the card', async ($, on) => {
  const band = await mountAt($, on, 38)
  expect(await band.find({ key: 'cache-fold' })).toBeUndefined()
  for (const key of TABS_ON) expect(await band.find({ key })).toBeDefined()
  expect(await band.find({ key: 'keep' })).toBeDefined()
  expect(await band.find({ text: '99%' })).toBeDefined()
  await band.unmount()
})

test('narrow ladder: with the 5h pace shown, 46 columns keep the track', async ($, on) => {
  const keeps = await paced($, on, 46, ON_PACE)
  expect((await tracks(keeps)).length).toBe(1)
  await keeps.unmount()
})

test('narrow ladder: with the 5h pace shown, 40 columns drop the track and its words, keeping the tabs and the keep box', async ($, on) => {
  const band = await paced($, on, 40, ON_PACE)
  expect(await tracks(band)).toEqual([])
  expect(await band.find({ key: 'keep' })).toBeDefined()
  for (const key of TABS_ON) expect(await band.find({ key })).toBeDefined()
  expect(await band.find({ key: 'cache-fold' })).toBeUndefined()
  await band.unmount()
})

test('narrow ladder: at 36 columns the keep box goes, the tabs and both windows stay', async ($, on) => {
  const band = await mountAt($, on, 36)
  expect(await band.find({ key: 'keep' })).toBeUndefined()
  for (const key of TABS_ON) expect(await band.find({ key })).toBeDefined()
  expect(await band.find({ text: '99%' })).toBeDefined()
  expect(await band.find({ text: '82%' })).toBeDefined()
  await band.unmount()
})

test('narrow ladder: at 30 columns only the 5h window is left, with the tabs', async ($, on) => {
  const band = await mountAt($, on, 30)
  expect(await band.find({ text: '82%' })).toBeDefined()
  expect(await band.find({ text: '99%' })).toBeUndefined()
  expect(await band.find({ key: 'keep' })).toBeUndefined()
  for (const key of TABS_ON) expect(await band.find({ key })).toBeDefined()
  await band.unmount()
})

test('minimal (28 columns and under): the 5h pie and percent, Robo and +, nothing else; + opens the card on the stored tab', async ($, on) => {
  const band = await mountAt($, on, 20)
  for (const key of TABS_ON) expect(await band.find({ key })).toBeUndefined()
  expect(await band.find({ key: 'keep' })).toBeUndefined()
  expect(await band.find({ key: 'spend-total' })).toBeUndefined()
  expect(await band.find({ text: '82%' })).toBeDefined()
  expect(await band.find({ text: '99%' })).toBeUndefined()
  const alts = (await band.findAll({ type: 'Svg' })).map(s => String(s.props.alt))
  expect(alts.filter(a => a.startsWith('5H'))).toEqual(['5H 18% used'])
  expect(alts.some(a => a.startsWith('Robo'))).toBe(true)
  expect(alts.some(a => a.startsWith('7D'))).toBe(false)
  lastKv.set('cardTab', 'cost')
  expect(await band.find({ key: 'card' })).toBeUndefined()
  await band.press({ key: 'cache-fold' })
  expect(JSON.stringify(await band.find({ key: 'card' }))).toContain('CACHE DISCOUNT')
  await band.press({ key: 'cache-fold' })
  expect(await band.find({ key: 'card' })).toBeUndefined()
  await band.unmount()
})

test('minimal is the last resort: even at 10 columns it is the row, with Robo and +', async ($, on) => {
  const band = await mountAt($, on, 10)
  expect(await band.find({ key: 'cache-fold' })).toBeDefined()
  expect(await band.find({ text: '82%' })).toBeDefined()
  await band.unmount()
})

// No separate buttons row on the desktop, at any width, with or without a working plan, card closed or open.
for (const columns of [160, 100, 70, 50, 44, 40, 36, 30, 26, 20, 10]) {
  for (const plan of [false, true]) {
    test(`the desktop never has a buttons row or buttons on the progress row (${columns} columns${plan ? ', a plan running' : ''})`, async ($, on) => {
      on('tool.call', () => ({ result: 'ran' }))
      const band = await mountAt($, on, columns)
      if (plan) await planOn($)
      for (const open of [false, true]) {
        if (open) await band.press({ key: (await band.find({ key: 'cache-fold' })) ? 'cache-fold' : 'tab-overview-button' })
        expect(await band.find({ key: 'buttons-row' })).toBeUndefined()
        expect(await band.find({ key: 'progress-buttons' })).toBeUndefined()
      }
      expect(await band.find({ key: 'card' })).toBeDefined()
      expect(!!(await band.find({ key: 'progress-row' }))).toBe(plan)
      await band.unmount()
    })
  }
}

test('the terminal keeps a one-letter chip once Robo would stand in', async ($, on) => {
  const band = await mountAt($, on, 30, true, 22, 'terminal')
  expect(await band.find({ text: ' W ' })).toBeDefined()
  expect(await band.findAll({ type: 'Svg' })).toEqual([])
  await band.unmount()
})

test('at 104 columns, with a cold cache idle 18 hours, the wide row and its word buttons no longer fit', async ($, on) => {
  // Measured on 2026-11-18: at 104 columns the wide row cut off the minutes and pushed the buttons out of view.
  const band = await mountAt($, on, 104, true, 18 * 60 + 18)
  expect(await band.find({ key: 'keep' })).toBeUndefined() // cold: keep warm is off with the cache
  await band.unmount()
})

test('at 150 columns the same row stays wide, the buttons with their words', async ($, on) => {
  const band = await mountAt($, on, 150, true, 18 * 60 + 18)
  expect(await band.find({ key: 'keep' })).toBeUndefined() // cold: keep warm is off with the cache
  await band.unmount()
})
