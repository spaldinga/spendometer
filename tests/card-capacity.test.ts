import { expect, test } from 'claude-code/testing'

import { DANGER, EMPTY, FABLE, OK } from '../hooks/band/look'
import { MODELS } from '../hooks/cost/prices'
import { cardSvg } from '../hooks/band/card'
import { cheaperModels, fmtBreakEven, keepWarmCost } from '../hooks/cost/cache/chip'
import type { PaceRow } from '../hooks/capacity/usage/art'
import type { Metrics } from '../hooks/band/card-metrics'
import { WARM, COLD, SPEND, WIDTHS, METRICS, YC, ROW, colXOf, body, plainText, PACE_OK, PACE_LOW, PACE_NONE, titleX, hasTitle, TAB_IDS, cap } from './card-kit'
/** The Capacity tab drawn with these pace rows. */
const pace = (w: number, rows: PaceRow[], m: Metrics | null = METRICS, v = WARM) => cardSvg(v, w, SPEND, rows, m, 'capacity')
// ---------- the pace strip ----------
test('the pace strip is first at every width, and its words sit on the same baseline as their track', () => {
  for (const w of WIDTHS) {
    const s = body(pace(w, [PACE_OK, PACE_LOW], METRICS).source)
    expect(s).toContain('>PACE VS RESET<')
    // The title is the first zone title: above the columns' row.
    expect(s.indexOf('>PACE VS RESET<')).toBeLessThan(s.indexOf('>CONVERSATION SIZE<'))
    expect(s).toContain('<text x="13" y="24" font-size="14" font-weight="700" fill="#8d8775" letter-spacing="1.4" text-anchor="start">PACE VS RESET<')
    const labels = [...s.matchAll(/<text x="13" y="(\d+)" font-size="16"[^>]*>(7D|5H)</g)].map(m => [Number(m[1]), m[2]])
    expect(labels).toEqual([[49, '7D'], [77, '5H']])
    // Each row's words are one text of 18 px, to the right of the track, on the label's baseline.
    const words = [...s.matchAll(/<text x="(\d+)" y="(49|77)" font-size="18" font-weight="500" fill="#8d8775"><tspan/g)].map(m => [Number(m[1]), Number(m[2])])
    expect(words.length).toBe(2)
    expect(words.map(x => x[1])).toEqual([49, 77])
    const tw = Math.round((w - 26 - 34) * 0.55)
    expect(words[0][0]).toBe(47 + tw + 14)
    // The track is 55% of the strip after the label.
    expect(s).toContain(`<rect x="47" y="40" width="${tw}" height="6" rx="3" fill="${EMPTY}"/>`)
    // Both rows above the rule under the strip.
    expect(s).toContain(`<rect x="13" y="${YC}" width="${w - 26}" height="1"`)
  }
})

test('the pace words take the longest variant that fits to the right of the track', () => {
  const at = (w: number, rows: PaceRow[]) => plainText(body(pace(w, rows).source))
  // 300: only the shortest variants fit.
  expect(at(300, [PACE_OK])).toContain('~78%✓')
  expect(at(300, [PACE_OK])).not.toContain('lasts')
  expect(at(300, [PACE_OK])).not.toContain('at reset')
  expect(at(300, [PACE_LOW])).toContain('~2h 40m')
  expect(at(300, [PACE_LOW])).not.toContain('runs out')
  expect(at(300, [PACE_NONE])).toContain('unknown')
  expect(at(300, [PACE_NONE])).not.toContain('pace unknown')
  // 800: the middle ones, the not-ok line without "runs".
  expect(at(800, [PACE_OK])).toContain('~78% at reset · resets 3h 0m✓')
  expect(at(800, [PACE_LOW])).toContain('out in ~2h 40m · resets 3h 20m')
  expect(at(800, [PACE_LOW])).not.toContain('runs out')
  // 1400: everything.
  expect(at(1400, [PACE_OK, PACE_LOW])).toContain('~78% at reset · resets 3h 0m✓')
  expect(at(1400, [PACE_OK, PACE_LOW])).toContain('runs out in ~2h 40m · resets 3h 20m')
})

test('the pace bar fills to the share used, in the window colour, red when the forecast runs out before the reset', () => {
  const s = body(pace(1400, [PACE_OK, PACE_LOW]).source)
  const tw = Math.round((1400 - 26 - 34) * 0.55)
  // 7D: 31% used, within the pace: its own colour. 5H: 70% used, runs out: red.
  expect(s).toContain(`<rect x="47" y="40" width="${Math.round(0.31 * tw)}" height="6" rx="3" fill="#ff6b1a"/>`)
  expect(s).toContain(`<rect x="47" y="68" width="${Math.round(0.7 * tw)}" height="6" rx="3" fill="${DANGER}"/>`)
  expect(s).toContain(`<tspan fill="${DANGER}">runs out in ~2h 40m</tspan> · resets 3h 20m`)
  expect(s).toContain(`>~78% at reset</tspan> · resets 3h 0m<tspan fill="${OK}"`)
  expect(s).not.toContain('bar: time left')
})

test('the pace tick is the share of the window already gone, none while the reset is unknown', () => {
  const tw = Math.round((1400 - 26 - 34) * 0.55)
  const tick = (rows: PaceRow[]) => [...body(pace(1400, rows).source).matchAll(/<rect x="(\d+)" y="(36|64)" width="2" height="14" fill="#e8e2d2"\/>/g)].map(m => Number(m[1]))
  // 3 h left of a 5 h window: 40% of the time gone.
  expect(tick([PACE_OK])).toEqual([47 + Math.round(0.4 * tw) - 1])
  expect(tick([PACE_OK, PACE_LOW])).toEqual([47 + Math.round(0.4 * tw) - 1, 47 + Math.round(0.4 * tw) - 1])
  // 1 h left: 80% gone.
  expect(tick([{ ...PACE_OK, untilResetMs: 3600_000 }])).toEqual([47 + Math.round(0.8 * tw) - 1])
  expect(tick([{ ...PACE_OK, untilResetMs: null }])).toEqual([])
  expect(tick([{ ...PACE_OK, windowMs: null }])).toEqual([])
  // The pace can be unknown while the bar and the tick are not.
  expect(tick([{ ...PACE_OK, pace: null }])).toEqual([47 + Math.round(0.4 * tw) - 1])
})

test('the pace bar is empty at 0% used, full at 100%, and a sliver never thinner than 3 px', () => {
  const fills = (used: number) => [...body(pace(1400, [{ ...PACE_OK, used }]).source).matchAll(/<rect x="47" y="40" width="(\d+)" height="6" rx="3" fill="#ff6b1a"\/>/g)].map(m => Number(m[1]))
  const tw = Math.round((1400 - 26 - 34) * 0.55)
  expect(fills(0)).toEqual([])
  expect(fills(0.1)).toEqual([3])
  expect(fills(100)).toEqual([tw])
})

test('the pace strip says so when the pace is unknown for a window, and when there are no windows', () => {
  const s = body(pace(1400, [PACE_NONE]).source)
  expect(s).toContain('>pace unknown<')
  expect(s).not.toContain(DANGER)
  const none = body(pace(1400, []).source)
  expect(none).toContain('>PACE VS RESET<')
  expect(none).toContain('>no usage windows reported<')
  expect(body(pace(1400, [PACE_OK, PACE_LOW, PACE_NONE]).source)).not.toContain('pace unknown')
})

test('pace is never a status line', () => {
  for (const w of WIDTHS) expect(body(pace(w, [PACE_OK, PACE_LOW]).source)).not.toContain('lasts until reset')
})

test('the pace strip explains the white line in its hover text and the alt, and the ok words are the forecast at the reset', () => {
  const c = pace(1400, [PACE_OK, PACE_LOW])
  expect(c.source).toContain('<title>The white line is how much of the window')
  expect(c.source).toContain('under pace')
  expect(c.source).toContain('over pace')
  expect(c.alt).toContain('A bar to the left of it is under pace')
  expect(plainText(body(c.source))).not.toContain('lasts')
  // Without windows, or off the Capacity tab, there is nothing to explain.
  expect(pace(1400, []).source).not.toContain('<title>')
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], null, 'cost').alt).not.toContain('under pace')
})
