import { expect, test } from 'claude-code/testing'

import { DANGER, EMPTY, FABLE, HUE, ICE, INK, LC_BL, LC_INK, LC_LA, LC_OR, LC_PE, LC_TA, LIGHT, LINE, MUTED, OK, ORANGE, TEXT, YELLOW, svgDoc } from '../hooks/band/look'
import { cardSvg } from '../hooks/band/card'
import { paceTrackSvg, paceWords, pieSvg, wedgePath } from '../hooks/capacity/usage/art'
import { chipSvg, roboSvg } from '../hooks/cost/cache/chip'
import { WARM, COLD, SPEND, WIDTHS, METRICS, body, PACE_OK, PACE_LOW, PACE_NONE, WITH_DAYS } from './card-kit'
// ---------- light mode ----------
test('every drawing carries the light-scheme style, with the font or without', () => {
  const docs = [
    roboSvg('warm'),
    roboSvg('cold'),
    chipSvg('warm').source,
    chipSvg('cold').source,
    svgDoc(10, 10, '', false),
    svgDoc(10, 10, '', true),
    ...WIDTHS.flatMap(w => [cardSvg(WARM, w, SPEND).source, cardSvg(COLD, w, SPEND).source]),
  ]
  for (const d of docs) {
    expect(d).toContain('<style>')
    expect(d).toContain('@media (prefers-color-scheme: light){')
    // The style comes before the drawing.
    expect(d.indexOf('</style>')).toBeLessThan(d.indexOf('</svg>') - 1)
  }
})

test('the light map covers every colour the drawings use, for fill and for stroke', () => {
  const doc = svgDoc(10, 10, '', false)
  const css = doc.slice(doc.indexOf('@media'), doc.indexOf('</style>'))
  for (const dark of [TEXT, MUTED, EMPTY, LINE, ORANGE, YELLOW, HUE.warm, HUE.cold, FABLE, OK, DANGER, INK, ICE, '#fff', LC_OR, LC_PE, LC_TA, LC_LA, LC_BL, LC_INK]) {
    expect(Object.keys(LIGHT)).toContain(dark)
  }
  for (const [dark, light] of Object.entries(LIGHT)) {
    expect(css).toContain(`[fill="${dark}"]{fill:${light}}`)
    expect(css).toContain(`[stroke="${dark}"]{stroke:${light}}`)
    expect(light).not.toBe(dark)
  }
  expect(LIGHT[TEXT]).toBe('#2b2a26')
  expect(LIGHT[INK]).toBe('#ffffff')
  expect([LC_OR, LC_PE, LC_TA, LC_LA, LC_BL, LC_INK]).toEqual(['#ff9900', '#ffcc99', '#cc9966', '#cc99cc', '#9999ff', '#000000'])
  expect([LC_OR, LC_PE, LC_TA, LC_LA, LC_BL, LC_INK].map(c => LIGHT[c])).toEqual(['#c06f00', '#b8743a', '#8a5a2b', '#8e5a8e', '#5555bb', '#ffffff'])
})

test('every colour a drawing paints is in the map, or is the translucent black left on purpose', () => {
  const painted = new Set<string>()
  const sources = [
    roboSvg('warm'),
    roboSvg('cold'),
    chipSvg('warm').source,
    chipSvg('cold').source,
    ...WIDTHS.flatMap(w => [cardSvg(WARM, w, SPEND, [PACE_OK, PACE_LOW, PACE_NONE], METRICS).source, cardSvg(COLD, w, { ...WITH_DAYS, saved: 1 }, [PACE_OK]).source]),
  ]
  for (const d of sources) {
    const drawing = d.slice(d.indexOf('</style>'))
    for (const m of drawing.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)) painted.add(m[1])
  }
  for (const c of painted) if (c !== '#000') expect(Object.keys(LIGHT)).toContain(c)
  expect(painted.size).toBeGreaterThan(8)
})

// ---------- the usage pie ----------
test('the pie wedge: nothing at 0, a quarter-turn at 25, a long arc past half, a full circle at 100', () => {
  expect(wedgePath(8, 8, 7, 0)).toBe('')
  expect(wedgePath(8, 8, 7, 100)).toBeNull()
  expect(wedgePath(8, 8, 7, 25)).toBe('M8 8L8 1A7 7 0 0 1 15 8Z')
  expect(wedgePath(8, 8, 7, 50)).toBe('M8 8L8 1A7 7 0 0 1 8 15Z')
  expect(wedgePath(8, 8, 7, 21)).toContain('A7 7 0 0 1')
  expect(wedgePath(8, 8, 7, 99.9)).toContain('A7 7 0 1 1')
  // 99.9% ends just short of 12 o'clock, on the left of the top.
  const end = /A7 7 0 1 1 ([\d.]+) ([\d.]+)Z/.exec(wedgePath(8, 8, 7, 99.9)!)!
  expect(Number(end[1])).toBeLessThan(8)
  expect(Number(end[1])).toBeGreaterThan(7.9)
  expect(Number(end[2])).toBeLessThan(1.1)
})

test('the pie is an EMPTY circle with a wedge in the window colour; full when 100%, bare when 0, light style included', () => {
  const at = (p: number) => body(pieSvg(p, ORANGE))
  expect(at(21)).toContain(`<circle cx="8" cy="8" r="7" fill="${EMPTY}"/><path d="M8 8L8 1A7`)
  expect(at(21)).toContain(`fill="${ORANGE}"/>`)
  expect(at(0)).toBe(`</style><circle cx="8" cy="8" r="7" fill="${EMPTY}"/></svg>`)
  expect(at(100)).toBe(`</style><circle cx="8" cy="8" r="7" fill="${ORANGE}"/></svg>`)
  expect(pieSvg(50, YELLOW)).toContain('prefers-color-scheme: light')
  expect(pieSvg(50, YELLOW)).toContain('width="16" height="16"')
})

test('the pace track: fill is the used share in the window colour, the tick (2 px, TEXT) the time gone, light style included', () => {
  const s = paceTrackSvg(39, 0.81, YELLOW, true, 64)
  expect([s.w, s.h]).toEqual([64, 16])
  expect(s.source).toContain('width="64" height="16"')
  expect(s.source).toContain(`<rect x="0" y="5" width="64" height="6" rx="3" fill="${EMPTY}"/>`)
  expect(s.source).toContain(`<rect x="0" y="5" width="25" height="6" rx="3" fill="${YELLOW}"/>`)
  expect(s.source).toContain(`<rect x="51" y="1" width="2" height="14" fill="${TEXT}"/>`)
  expect(s.source).toContain('prefers-color-scheme: light')
})

test('the pace track: red fill when the pace is over, no fill at 0, the tick stays inside the track', () => {
  expect(paceTrackSvg(70, 0.4, YELLOW, false, 44).source).toContain(`width="31" height="6" rx="3" fill="${DANGER}"`)
  expect(paceTrackSvg(70, 0.4, YELLOW, false, 44).source).not.toContain(`fill="${YELLOW}"/>`)
  expect(paceTrackSvg(0, 0, YELLOW, true, 30).source).not.toContain('<rect x="0" y="5" width="3"')
  expect(paceTrackSvg(0, 0, YELLOW, true, 30).source).toContain('<rect x="0" y="1" width="2"')
  expect(paceTrackSvg(100, 1, YELLOW, true, 30).source).toContain('<rect x="28" y="1" width="2"')
})

test('the pace words: wide forecast or run-out, compact check or short time', () => {
  const on = { lastsMs: 6 * 3600_000, untilResetMs: 57 * 60_000, ok: true, atReset: 48 }
  const over = { lastsMs: 80 * 60_000, untilResetMs: 3 * 3600_000, ok: false, atReset: 150 }
  expect(paceWords(on, 'wide').line).toBe(' ~48% at reset ✓')
  expect(paceWords(on, 'compact').line).toBe(' ✓')
  expect(paceWords(on, 'tight').line).toBe(' ✓')
  expect(paceWords(over, 'wide').line).toBe(' out in ~1h 20m')
  expect(paceWords(over, 'compact').line).toBe(' out 1h')
  expect(paceWords(over, 'compact', false).line).toBe(' 1h')
  expect(paceWords(over, 'tight').line).toBe(' 1h')
  expect(paceWords(over, 'wide').ok).toBe(false)
})
