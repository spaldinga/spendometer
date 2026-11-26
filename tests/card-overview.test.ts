import { expect, test } from 'claude-code/testing'

import { DANGER, EMPTY, FABLE, OK } from '../hooks/band/look'
import { MODELS } from '../hooks/cost/prices'
import { cardSvg } from '../hooks/band/card'
import { cheaperModels, fmtBreakEven, keepWarmCost } from '../hooks/cost/cache/chip'
import type { PaceRow } from '../hooks/capacity/usage/art'
import type { Metrics } from '../hooks/band/card-metrics'
import { WARM, COLD, SPEND, WIDTHS, METRICS, YC, ROW, colXOf, body, plainText, PACE_OK, PACE_LOW, PACE_NONE, titleX, hasTitle, TAB_IDS, ctx } from './card-kit'
test('the warm Overview has the conversation\'s cost and Context the size at every width, and nothing the row already shows', () => {
  for (const w of WIDTHS) {
    expect(plainText(body(cardSvg(WARM, w, SPEND).source))).toContain('≈$7.77')
    expect(plainText(body(ctx(w).source))).toContain('760k free')
    for (const tab of TAB_IDS) {
      const s = body(cardSvg(WARM, w, SPEND, [], null, tab).source)
      for (const gone of ['IDLE', 'LIMIT', '>WARM<', 'NEXT MESSAGE', 'HAIKU', 'OPUS', 'last reply']) expect(s).not.toContain(gone)
    }
  }
  const s = body(cardSvg(WARM, 1400, SPEND).source)
  expect(s).toContain('>SPEND<')
  expect(s).toContain('main $7.40 · subagents $0.37')
  expect(body(ctx(1400).source)).toContain('24% of the 1M context · 760k free')
})

test('the card has no block of model costs, warm or cold, at any width', () => {
  for (const w of WIDTHS)
    for (const v of [WARM, COLD]) {
      const c = cardSvg(v, w, SPEND, [PACE_OK], METRICS)
      expect(c.source).not.toContain('NEXT MESSAGE')
      expect(c.alt).not.toContain('NEXT MESSAGE')
      for (const name of ['FABLE', 'OPUS', 'SONNET', 'HAIKU', 'YOU']) expect(body(c.source)).not.toContain(`>${name}<`)
    }
})

test('the card is as tall cold as warm, with or without pace figures, at every width', () => {
  for (const w of WIDTHS) {
    expect(cardSvg(COLD, w, SPEND).h).toBe(cardSvg(WARM, w, SPEND).h)
    expect(cardSvg(COLD, w, SPEND, [], METRICS).h).toBe(cardSvg(WARM, w, SPEND, [], METRICS).h)
    expect(cardSvg(WARM, w, SPEND, [PACE_OK, PACE_LOW], METRICS).h).toBe(cardSvg(WARM, w, SPEND, [], METRICS).h)
    expect(cardSvg(WARM, w, SPEND, [PACE_NONE], METRICS).h).toBe(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS).h)
  }
})

test('the Overview heights: the pace strip, the 124 px row and the status line, with or without figures', () => {
  // 6 px gap + 88 strip + 124 row, then 27 + 4 for the one status line on one column.
  const at = (w: number, v = WARM, m: Metrics | null = null) => cardSvg(v, w, SPEND, [PACE_OK, PACE_LOW], m).h
  expect(WIDTHS.map(w => at(w))).toEqual([249, 218, 218, 218])
  expect(WIDTHS.map(w => at(w, COLD))).toEqual([249, 218, 218, 218])
  expect(WIDTHS.map(w => at(w, WARM, METRICS))).toEqual([249, 218, 218, 218])
  expect(6 + YC + ROW + 27 + 4).toBe(249)
  expect(6 + YC + ROW).toBe(218)
})

test('the free context is spelled out in the caption and in the alt text', () => {
  expect(body(ctx(1400).source)).toContain('760k free')
  const c = cardSvg(WARM, 1400, SPEND)
  expect(c.alt.startsWith('Tab: Overview. Cache warm')).toBe(true)
  expect(c.alt).toContain('760k of the context free')
  expect(c.alt).toContain('main $7.40, subagents $0.37')
})

test('with no cost yet the figure is ≈$0.00 and there is no caption', () => {
  for (const w of WIDTHS) {
    const s = body(cardSvg(WARM, w, null).source)
    expect(s).toContain('≈$0.00')
    expect(s).not.toContain('subagents')
  }
})

test('the cost dots split between the main session and the subagents', () => {
  const s = body(cardSvg(WARM, 1400, SPEND).source)
  // Main in the mode hue, subagents muted: both colours are on the cost dots.
  const dots = s.slice(s.indexOf('>SPEND<'))
  expect(dots).toContain('fill="#cc6363"')
  expect(dots).toContain('fill="#8d8775"')
})

test('the card keeps the limits out of its alt text', () => {
  for (const w of WIDTHS) expect(cardSvg(WARM, w, SPEND).alt).not.toContain('limit')
})

test('keepWarmCost: an hour of cache reads of the context at 1.2 pings, against the cold re-cache', () => {
  const k = keepWarmCost(WARM)!
  // Opus: $0.20 a million read, 240k tokens, 1.2 pings an hour; cold is $4 x 2 a million.
  expect(Math.abs(k.perHour - 0.2 * 0.24 * 1.2)).toBeLessThan(1e-9)
  expect(Math.abs(k.cold - 1.92)).toBeLessThan(1e-9)
  expect(Math.abs(k.breakEvenH - 1.92 / k.perHour)).toBeLessThan(1e-9)
  expect(keepWarmCost({ ...WARM, mine: null })).toBeNull()
  expect(keepWarmCost({ ...WARM, tokens: 0 })!.breakEvenH).toBe(Infinity)
})

test('the break-even reads ~Nh and is capped at >24h', () => {
  expect(fmtBreakEven(3.4)).toBe('~3h')
  expect(fmtBreakEven(0.2)).toBe('~1h')
  expect(fmtBreakEven(24)).toBe('~24h')
  expect(fmtBreakEven(33)).toBe('>24h')
  expect(fmtBreakEven(Infinity)).toBe('>24h')
})

// ---------- the pace strip ----------
test('the pace strip is first at every width, and its words sit on the same baseline as their track', () => {
  for (const w of WIDTHS) {
    const s = body(cardSvg(WARM, w, SPEND, [PACE_OK, PACE_LOW], METRICS).source)
    expect(s).toContain('>PACE VS RESET<')
    // The title is the first zone title: above the columns' row.
    expect(s.indexOf('>PACE VS RESET<')).toBeLessThan(s.indexOf('>DELEGATION<'))
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
  const at = (w: number, rows: PaceRow[]) => plainText(body(cardSvg(WARM, w, SPEND, rows).source))
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
  const s = body(cardSvg(WARM, 1400, SPEND, [PACE_OK, PACE_LOW]).source)
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
  const tick = (rows: PaceRow[]) => [...body(cardSvg(WARM, 1400, SPEND, rows).source).matchAll(/<rect x="(\d+)" y="(36|64)" width="2" height="14" fill="#e8e2d2"\/>/g)].map(m => Number(m[1]))
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
  const fills = (used: number) => [...body(cardSvg(WARM, 1400, SPEND, [{ ...PACE_OK, used }]).source).matchAll(/<rect x="47" y="40" width="(\d+)" height="6" rx="3" fill="#ff6b1a"\/>/g)].map(m => Number(m[1]))
  const tw = Math.round((1400 - 26 - 34) * 0.55)
  expect(fills(0)).toEqual([])
  expect(fills(0.1)).toEqual([3])
  expect(fills(100)).toEqual([tw])
})

test('the pace strip says so when the pace is unknown for a window, and when there are no windows', () => {
  const s = body(cardSvg(WARM, 1400, SPEND, [PACE_NONE]).source)
  expect(s).toContain('>pace unknown<')
  expect(s).not.toContain(DANGER)
  const none = body(cardSvg(WARM, 1400, SPEND, []).source)
  expect(none).toContain('>PACE VS RESET<')
  expect(none).toContain('>no usage windows reported<')
  expect(body(cardSvg(WARM, 1400, SPEND, [PACE_OK, PACE_LOW, PACE_NONE]).source)).not.toContain('pace unknown')
})

test('pace is never a status line', () => {
  for (const w of WIDTHS) expect(body(cardSvg(WARM, w, SPEND, [PACE_OK, PACE_LOW]).source)).not.toContain('lasts until reset')
})

// ---------- the columns ----------
test('Overview: DELEGATION and SPEND, as many columns as fit, two at most, evenly spaced', () => {
  const titles = ['DELEGATION', 'SPEND']
  for (const [k, w] of WIDTHS.entries()) {
    const n = Math.min(2, k + 1)
    const c = cardSvg(WARM, w, SPEND, [PACE_OK], METRICS)
    const s = body(c.source)
    titles.forEach((title, i) => {
      if (i < n) expect(titleX(s, title)).toBe(colXOf(w, n, i))
      else expect(hasTitle(s, title)).toBe(false)
    })
    expect(c.cols).toBe(n)
    // The vlines between the columns, one fewer than the columns.
    expect(s.split(`y="${YC + 18}" width="1" height="88"`).length - 1).toBe(n - 1)
  }
  // At three and four columns of room the two are wider.
  for (const w of [1100, 1400, 1500, 1981]) {
    const s = body(cardSvg(WARM, w, SPEND, [PACE_OK]).source)
    expect(titles.map(z => titleX(s, z))).toEqual([0, 1].map(i => colXOf(w, 2, i)))
  }
})

test('keep warm is not a zone: no KEEP WARM or RE-CACHE NOW title, warm or cold, on any tab at any width', () => {
  for (const tab of TAB_IDS)
    for (const w of WIDTHS)
      for (const v of [WARM, COLD]) {
        const s = body(cardSvg(v, w, SPEND, [PACE_OK, PACE_LOW], METRICS, tab).source)
        for (const gone of ['KEEP WARM', 'RE-CACHE NOW', 'going cold', 'warm costs', 'model not priced']) expect(s).not.toContain(gone)
      }
  expect(body(cardSvg({ ...WARM, mine: null }, 1400, SPEND).source)).not.toContain('not priced')
})

test('the cold Context tab turns CONVERSATION SIZE into RE-CACHE and keeps its dot grid', () => {
  const warm = body(ctx(1400).source)
  // 25 dots a row, two rows.
  const size = warm.slice(warm.indexOf('>CONVERSATION SIZE<'), warm.indexOf('>TOOL OUTPUT<'))
  expect(size.split('<circle').length - 1).toBe(50)
  const cold = body(ctx(1400, METRICS, COLD).source)
  expect(cold).toContain('>RE-CACHE<')
  expect(cold).not.toContain('>CONVERSATION SIZE<')
  expect(cold).not.toContain('NEXT MESSAGE')
})

test('the cheaper models are the priced ones below this session, in MODELS order; none for the cheapest', () => {
  expect(MODELS.map(m => m.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
  expect(cheaperModels({ ...COLD, mine: 'fable' })).toEqual(['Opus $1.92', 'Sonnet $0.96', 'Haiku $0.24'])
  expect(cheaperModels(COLD)).toEqual(['Sonnet $0.96', 'Haiku $0.24'])
  expect(cheaperModels({ ...COLD, mine: 'haiku' })).toEqual([])
  expect(cheaperModels({ ...COLD, mine: null })).toEqual([])
})

test('the cold alt text gives the re-cache cost and the cheaper models, the warm one what going cold costs', () => {
  expect(cardSvg(COLD, 1400, SPEND).alt).toContain('re-caching now costs $1.92 on Opus (cheaper: Sonnet $0.96, Haiku $0.24)')
  expect(cardSvg({ ...COLD, mine: 'haiku' }, 1400, SPEND).alt).toContain('re-caching now costs $0.24 on Haiku.')
  expect(cardSvg(WARM, 1400, SPEND).alt).toContain('Keeping the cache warm costs about $0.06 an hour; going cold costs $1.92.')
  expect(cardSvg({ ...WARM, mine: null }, 1400, SPEND).alt).not.toContain('Keeping the cache warm')
})

test('while cold, nothing on the card says going cold', () => {
  for (const tab of TAB_IDS) for (const w of WIDTHS) expect(body(cardSvg(COLD, w, SPEND, [PACE_OK], METRICS, tab).source)).not.toContain('going cold')
})

test('the pace strip explains the white line in its hover text and the alt, and the ok words are the forecast at the reset', () => {
  const c = cardSvg(WARM, 1400, SPEND, [PACE_OK, PACE_LOW])
  expect(c.source).toContain('<title>The white line is how much of the window')
  expect(c.source).toContain('under pace')
  expect(c.source).toContain('over pace')
  expect(c.alt).toContain('A bar to the left of it is under pace')
  expect(plainText(body(c.source))).not.toContain('lasts')
  // Without windows, or off the Overview tab, there is nothing to explain.
  expect(cardSvg(WARM, 1400, SPEND, []).source).not.toContain('<title>')
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], null, 'cost').alt).not.toContain('under pace')
})
