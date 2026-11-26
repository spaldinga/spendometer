import { expect, test } from 'claude-code/testing'

import { DANGER } from '../hooks/band/look'
import { mountAt, ON_PACE, OVER_PACE, paced, rowOf, tracks } from './layout-kit'
// ---------- The 5h pace in the top row (backlog 70) ----------

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
  const on1 = await paced($, on, 72, ON_PACE)
  expect(await rowOf(on1)).toContain('5h 18% ✓')
  const t = await tracks(on1)
  expect(t.length).toBe(1)
  expect(t[0].props.width).toBe(44)
  await on1.unmount()
})

test('compact row, over pace', async ($, on) => {
  const band = await paced($, on, 95, OVER_PACE)
  expect(await rowOf(band)).toContain('5h 60% out 1h')
  expect(await band.find({ type: 'Text', text: ' out 1h', props: { color: DANGER } })).toBeDefined()
  await band.unmount()
})

test('the terminal, tight row, over pace: "1h", no "out"', async ($, on) => {
  const band = await paced($, on, 20, OVER_PACE, 'terminal')
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

test('without pace the same 145 columns are one wide row', async ($, on) => {
  const band = await mountAt($, on, 145)
  expect(await rowOf(band)).toContain('USAGE')
  await band.unmount()
})

test('compact row, over pace, squeezed: the ladder drops "out" and keeps the time', async ($, on) => {
  const band = await paced($, on, 65, OVER_PACE)
  expect(await rowOf(band)).toContain('5h 60% 1h')
  await band.unmount()
})
