import { expect, test } from 'claude-code/testing'

import { DANGER, EMPTY, FABLE, HUE, ICE, INK, LC_BL, LC_INK, LC_LA, LC_OR, LC_PE, LC_TA, LIGHT, LINE, MODELS, MUTED, OK, ORANGE, TEXT, YELLOW, cardSvg, chipSvg, cheaperModels, chipTip, fmtBreakEven, keepWarmCost, pieSvg, roboSvg, svgDoc, wedgePath } from '../hooks/cache-art'
import type { CacheView, PaceRow } from '../hooks/cache-art'
import type { Metrics } from '../hooks/metrics'

const WARM: CacheView = { mode: 'warm', idle: '18m', idleMin: 18, tokens: 240000, window: 1000000, mine: 'opus' }
const COLD: CacheView = { mode: 'cold', idle: '2h 5m', idleMin: 125, tokens: 240000, window: 1000000, mine: 'opus' }
const SPEND = { main: 7.4, subs: 0.37 }
// One card, from one column to four: the widths are 300 (n = 1), 800 (2), 1100 (3) and 1400 (4).
const WIDTHS = [300, 800, 1100, 1400]
const DELEG = { saved: 3.1, costRatio: 0.4, workMs: 12 * 60000, wallMs: 5 * 60000 }
const METRICS: Metrics = {
  hit: 0.963, perM: 0.62, avg: 0.38, last: 2.11, multiple: 6, runway: 40.4, growth: 6200,
  models: [['opus', 14.2], ['sonnet', 5.1], ['haiku', 1.09]], deleg: DELEG, subs: 5.14, top: [['Explore', 3.9], ['coder', 1.24]],
  tools: [['Bash', 18000], ['Read', 12000], ['Grep', 6000]], toolTok: 41000, rereads: 4, rereadTok: 9000,
}
/** The pace strip's height, where the columns start; a zone's title is 24 px below. */
const YC = 88
/** The columns' rows are 124 px; a block of k status lines is 27 k + 4. */
const ROW = 124
/** A column's width at a card width, and the x of column i. */
const colWOf = (w: number, n: number) => Math.floor((w - 26 - (n - 1) * 26) / n)
const colXOf = (w: number, n: number, i: number) => 13 + i * (colWOf(w, n) + 26)

// Drawings put their words between tags; look after the font data in the style block.
const body = (s: string) => s.slice(s.indexOf('</style>'))
const plainText = (s: string) => s.replace(/<[^>]*>/g, '')

const H5 = 5 * 3600_000
const PACE_OK: PaceRow = { label: '7D', color: '#ff6b1a', untilResetMs: 3 * 3600_000, windowMs: H5, used: 31, pace: { lastsMs: 5 * 3600_000, untilResetMs: 3 * 3600_000, ok: true } }
const PACE_LOW: PaceRow = { label: '5H', color: '#f5a623', untilResetMs: 3 * 3600_000, windowMs: H5, used: 70, pace: { lastsMs: 160 * 60_000, untilResetMs: 200 * 60_000, ok: false } }
const PACE_NONE: PaceRow = { label: '5H', color: '#f5a623', untilResetMs: null, windowMs: H5, used: 0, pace: null }

// The x of a title in the columns' row.
const titleX = (s: string, title: string) => Number(new RegExp(`<text x="([0-9.]+)" y="${YC + 24}"[^>]*>${title}<`).exec(s)![1])
const hasTitle = (s: string, title: string) => new RegExp(`<text x="[0-9.]+" y="${YC + 24}"[^>]*>${title}<`).test(s)
/** The colours of the status dots, top to bottom (the dot grids are r=3). */
const dotsOf = (s: string) => (s.match(/<circle [^>]*r="4" fill="[^"]+"/g) ?? []).map(d => /fill="([^"]+)"/.exec(d)![1])

test('the warm card has IN CACHE and the conversation\'s cost at every width, and nothing the row already shows', () => {
  for (const w of WIDTHS) {
    const s = body(cardSvg(WARM, w, SPEND).source)
    expect(plainText(s)).toContain('≈$7.77')
    expect(plainText(s)).toContain('760k free')
    for (const gone of ['IDLE', 'LIMIT', '>WARM<', 'NEXT MESSAGE', 'HAIKU', 'OPUS', 'last reply']) expect(s).not.toContain(gone)
  }
  const s = body(cardSvg(WARM, 1400, SPEND).source)
  for (const z of ['>IN CACHE<', '>SPEND<']) expect(s).toContain(z)
  expect(s).toContain('main $7.40 · subagents $0.37')
  expect(s).toContain('24% of the 1M context · 760k free')
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

test('the card heights: the pace strip, the 124 px row, the status lines and the metric row', () => {
  // 6 px gap + 88 strip + 124 row, then 27 k + 4 for k status lines (2, 1, 0, 0), then 92 for the metric row from three columns.
  const at = (w: number, v = WARM, m: Metrics | null = null) => cardSvg(v, w, SPEND, [PACE_OK, PACE_LOW], m).h
  expect(WIDTHS.map(w => at(w))).toEqual([276, 249, 218, 218])
  expect(WIDTHS.map(w => at(w, COLD))).toEqual([276, 249, 218, 218])
  expect(WIDTHS.map(w => at(w, WARM, METRICS))).toEqual([276, 249, 310, 310])
  expect(6 + YC + ROW + 2 * 27 + 4).toBe(276)
  expect(6 + YC + ROW + 27 + 4).toBe(249)
  expect(6 + YC + ROW).toBe(218)
  expect(6 + YC + ROW + 92).toBe(310)
})

test('the free context is spelled out in the caption and in the alt text', () => {
  const c = cardSvg(WARM, 1400, SPEND)
  expect(body(c.source)).toContain('760k free')
  expect(c.alt.startsWith('Cache warm')).toBe(true)
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
  expect(at(300, [PACE_OK])).toContain('✓ 3h 0m')
  expect(at(300, [PACE_OK])).not.toContain('lasts')
  expect(at(300, [PACE_LOW])).toContain('~2h 40m')
  expect(at(300, [PACE_LOW])).not.toContain('runs out')
  expect(at(300, [PACE_NONE])).toContain('unknown')
  expect(at(300, [PACE_NONE])).not.toContain('pace unknown')
  // 800: the middle ones, the not-ok line without "runs".
  expect(at(800, [PACE_OK])).toContain('lasts ~5h 0m · resets 3h 0m✓')
  expect(at(800, [PACE_LOW])).toContain('out in ~2h 40m · resets 3h 20m')
  expect(at(800, [PACE_LOW])).not.toContain('runs out')
  // 1400: everything.
  expect(at(1400, [PACE_OK, PACE_LOW])).toContain('lasts ~5h 0m · resets 3h 0m✓')
  expect(at(1400, [PACE_OK, PACE_LOW])).toContain('runs out in ~2h 40m · resets 3h 20m')
})

test('the pace bar fills to the share used, in the window colour, red when the forecast runs out before the reset', () => {
  const s = body(cardSvg(WARM, 1400, SPEND, [PACE_OK, PACE_LOW]).source)
  const tw = Math.round((1400 - 26 - 34) * 0.55)
  // 7D: 31% used, within the pace: its own colour. 5H: 70% used, runs out: red.
  expect(s).toContain(`<rect x="47" y="40" width="${Math.round(0.31 * tw)}" height="6" rx="3" fill="#ff6b1a"/>`)
  expect(s).toContain(`<rect x="47" y="68" width="${Math.round(0.7 * tw)}" height="6" rx="3" fill="${DANGER}"/>`)
  expect(s).toContain(`<tspan fill="${DANGER}">runs out in ~2h 40m</tspan> · resets 3h 20m`)
  expect(s).toContain(`>lasts ~5h 0m</tspan> · resets 3h 0m<tspan fill="${OK}"`)
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
test('the columns come in the order DELEGATION, IN CACHE, SPEND: as many as fit, three at most, evenly spaced', () => {
  const titles = ['DELEGATION', 'IN CACHE', 'SPEND']
  for (const [k, w] of WIDTHS.entries()) {
    const n = Math.min(3, k + 1)
    const s = body(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS).source)
    titles.forEach((title, i) => {
      if (i < n) expect(titleX(s, title)).toBe(colXOf(w, n, i))
      else expect(hasTitle(s, title)).toBe(false)
    })
    expect(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS).cols).toBe(n)
    // The vlines between the columns, one fewer than the columns.
    expect(s.split(`y="${YC + 18}" width="1" height="88"`).length - 1).toBe(n - 1)
  }
  // At four columns of room the three are wider, not four.
  for (const w of [1400, 1500, 1981]) {
    const s = body(cardSvg(WARM, w, SPEND, [PACE_OK]).source)
    expect(titles.map(z => titleX(s, z))).toEqual([0, 1, 2].map(i => colXOf(w, 3, i)))
  }
})

test('keep warm is not a zone: no KEEP WARM or RE-CACHE NOW title, warm or cold, at any width', () => {
  for (const w of WIDTHS)
    for (const v of [WARM, COLD]) {
      const s = body(cardSvg(v, w, SPEND, [PACE_OK, PACE_LOW], METRICS).source)
      for (const gone of ['KEEP WARM', 'RE-CACHE NOW', 'going cold', 'warm costs', 'model not priced']) expect(s).not.toContain(gone)
    }
  expect(body(cardSvg({ ...WARM, mine: null }, 1400, SPEND).source)).not.toContain('not priced')
})

test('the cold card turns IN CACHE into RE-CACHE and keeps the zones DELEGATION and SPEND', () => {
  const warm = body(cardSvg(WARM, 1400, SPEND, [PACE_OK, PACE_LOW]).source)
  for (const z of ['>IN CACHE<', '>SPEND<', '>PACE VS RESET<', '>DELEGATION<']) expect(warm).toContain(z)
  expect(warm).not.toContain('NEXT MESSAGE')
  // IN CACHE keeps its dot grid: 25 dots a row, two rows.
  const inCache = warm.slice(warm.indexOf('>IN CACHE<'), warm.indexOf('>SPEND<'))
  expect(inCache.split('<circle').length - 1).toBe(50)
  const cold = body(cardSvg(COLD, 1400, SPEND, [PACE_OK]).source)
  for (const name of ['>RE-CACHE<', 'PACE VS RESET']) expect(cold).toContain(name)
  expect(cold).not.toContain('>IN CACHE<')
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
  for (const w of WIDTHS) expect(body(cardSvg(COLD, w, SPEND, [PACE_OK]).source)).not.toContain('going cold')
})

// ---------- the chip's hover ----------
test('chipTip warm: the minutes left, the switch, the hourly cost and what going cold costs', () => {
  expect(chipTip(WARM, 0, true)).toBe('Warm for 42 more minutes · keep warm on, $0.06 an hour. Going cold would cost $1.92 to re-cache.')
  expect(chipTip(WARM, 0, false)).toBe('Warm for 42 more minutes · keep warm off, $0.06 an hour. Going cold would cost $1.92 to re-cache.')
  expect(chipTip({ ...WARM, idleMin: 59 }, 0, true)).toContain('Warm for 1 more minute ·')
})

test('chipTip warm: what pings saved only when above zero; no switch (cache-tax) leaves the switch out', () => {
  expect(chipTip(WARM, 1.5, true)).toBe('Warm for 42 more minutes · keep warm on, $0.06 an hour. Going cold would cost $1.92 to re-cache · saved $1.50 so far.')
  expect(chipTip(WARM, 0, true)).not.toContain('saved')
  expect(chipTip(WARM, 0, null)).toBe('Warm for 42 more minutes. Going cold would cost $1.92 to re-cache.')
})

test('chipTip cold: the re-cache cost on this model, the cheaper ones, and what keeping warm costs', () => {
  expect(chipTip(COLD, 0, true)).toBe('Cold, idle 2h 5m. The next message re-caches for $1.92 on Opus (cheaper: Sonnet $0.96, Haiku $0.24). Keep warm costs $0.06 an hour.')
  expect(chipTip({ ...COLD, mine: 'fable' }, 0, false)).toContain('re-caches for $4.80 on Fable (cheaper: Opus $1.92, Sonnet $0.96, Haiku $0.24).')
  // The cheapest model has none cheaper: no parenthesis.
  expect(chipTip({ ...COLD, mine: 'haiku' }, 0, true)).toBe('Cold, idle 2h 5m. The next message re-caches for $0.24 on Haiku. Keep warm costs $0.01 an hour.')
})

test('chipTip on a model with no price falls back to the short text', () => {
  expect(chipTip({ ...WARM, mine: null }, 1, true)).toBe('Warm, cold in 42m')
  expect(chipTip({ ...COLD, mine: null }, 1, true)).toBe('Cold, idle 2h 5m')
})

// ---------- the status lines ----------
test('a status line for each of IN CACHE and SPEND that has no column: 300 both, 800 spend, 1100 and 1400 none', () => {
  const lines = (w: number) => plainText(body(cardSvg(WARM, w, SPEND, [PACE_OK]).source))
  // 300: the shortest variants fit the 260 px line.
  expect(dotsOf(cardSvg(WARM, 300, SPEND, [PACE_OK]).source)).toEqual([HUE.warm, MUTED])
  expect(lines(300)).toContain('240k in cache · 760k free')
  expect(lines(300)).toContain('≈$7.77 this thread')
  // 800: no cache line (IN CACHE has its column), the spend line in full.
  expect(dotsOf(cardSvg(WARM, 800, SPEND, [PACE_OK]).source)).toEqual([MUTED])
  expect(lines(800)).toContain('≈$7.77 this thread · main $7.40 · subagents $0.37')
  expect(lines(800)).not.toContain('in cache')
  // 1100 and 1400: three columns, nothing below.
  for (const w of [1100, 1400]) {
    expect(dotsOf(cardSvg(WARM, w, SPEND, [PACE_OK]).source)).toEqual([])
    expect(lines(w)).not.toContain('this thread · ')
  }
  // No status line says anything of keep warm.
  for (const w of WIDTHS) expect(lines(w)).not.toContain('keep warm')
  // Wide enough for the whole cache sentence, in the order the lines are drawn.
  const narrow = body(cardSvg(WARM, 600, SPEND).source)
  expect(plainText(narrow)).toContain('240k in cache · 24% of the 1M context · 760k free')
})

test('the status lines are one rule below the columns, a dot and the text, 27 px apart', () => {
  const s = body(cardSvg(WARM, 300, SPEND).source)
  expect(s).toContain(`<rect x="13" y="${YC + ROW}" width="274" height="1"`)
  const ys = [...s.matchAll(/<circle cx="17" cy="(\d+)" r="4"/g)].map(m => Number(m[1]))
  expect(ys.length).toBe(2)
  expect(ys[1] - ys[0]).toBe(27)
  // Each text is at x 27, the dot a little above its baseline.
  const texts = [...s.matchAll(/<text x="27" y="(\d+)" font-size="16"/g)].map(m => Number(m[1]))
  expect(texts).toEqual([YC + ROW + 24, YC + ROW + 24 + 27])
})

test('the cold status lines have no keep warm or re-cache line, only the cache and the spend', () => {
  const s = body(cardSvg(COLD, 800, SPEND, [PACE_OK]).source)
  expect(plainText(s)).not.toContain('re-cache $')
  expect(s).not.toContain('keep warm')
  expect(dotsOf(s)).toEqual([MUTED])
  expect(dotsOf(cardSvg(COLD, 1100, SPEND).source)).toEqual([])
  expect(dotsOf(cardSvg(COLD, 300, SPEND).source)).toEqual([HUE.cold, MUTED])
})

test('the alt text keeps what the pings saved, and the card has no saved or pings line', () => {
  for (const w of WIDTHS) {
    expect(body(cardSvg(WARM, w, { ...SPEND, saved: 1.5, pings: 0.1 }).source)).not.toContain('saved $')
    expect(body(cardSvg(WARM, w, { ...SPEND, saved: 1.5, pings: 0.1 }).source)).not.toContain('pings $')
  }
  expect(cardSvg(WARM, 1400, { ...SPEND, saved: 1.5 }).alt).toContain('Keep-warm pings have saved about $1.50.')
})

const WITH_DAYS = { ...SPEND, days: [0, 1, 2, 0, 4, 1, 3] }

test('the spend zone draws seven day bars, today in orange and a day with no spend as a 2 px stub', () => {
  for (const v of [WARM, COLD]) {
    const s = body(cardSvg(v, 1400, WITH_DAYS).source)
    const zone = s.slice(s.indexOf('>SPEND<'), s.length)
    const bars = zone.match(/<rect [^>]*rx="1"[^>]*\/>/g)!
    expect(bars.length).toBe(7)
    expect(bars[6]).toContain('fill="#ff6b1a"')
    expect(bars[6]).toContain('height="15"')
    expect(bars[0]).toContain('height="2"')
    expect(bars[0]).toContain('fill="#4a463b"')
    expect(bars[4]).toContain('height="20"')
    expect(bars[4]).toContain('fill="#8d8775"')
    expect(zone).toContain('today $3.00 · week $11.00')
    expect(zone).toContain('this thread')
    expect(zone).not.toContain('main $7.40')
  }
})

test('a day with no spend today leaves today as a stub, not a bar in the hue', () => {
  const s = body(cardSvg(WARM, 1400, { ...SPEND, days: [1, 0, 0, 0, 0, 0, 0] }).source)
  const bars = s.slice(s.indexOf('>SPEND<')).match(/<rect [^>]*rx="1"[^>]*\/>/g)!
  expect(bars[6]).toContain('fill="#4a463b"')
  expect(bars[6]).toContain('height="2"')
})

test('without daily figures the spend zone falls back to the dot split and main and subagents', () => {
  for (const days of [undefined, [0, 0, 0, 0, 0, 0, 0]]) {
    const s = body(cardSvg(WARM, 1400, { ...SPEND, days }).source)
    const zone = s.slice(s.indexOf('>SPEND<'))
    expect(zone).toContain('main $7.40 · subagents $0.37')
    expect(zone).not.toContain('today $')
    expect(zone).not.toContain('rx="1"')
    expect(zone).toContain('<circle')
  }
})

test('the spend status line uses the today and week caption when days are known', () => {
  for (const w of [800, 300]) {
    const s = plainText(body(cardSvg(WARM, w, WITH_DAYS).source))
    expect(s).toContain(w === 800 ? '≈$7.77 this thread · today $3.00 · week $11.00' : '≈$7.77 this thread')
    expect(s).not.toContain('subagents $0.37')
  }
})

test('the heights do not change with daily figures or savings', () => {
  const more = { ...WITH_DAYS, saved: 1.5, pings: 0.12 }
  expect(WIDTHS.map(w => cardSvg(WARM, w, more, [PACE_OK, PACE_LOW]).h)).toEqual([276, 249, 218, 218])
  expect(WIDTHS.map(w => cardSvg(COLD, w, more, [PACE_OK, PACE_LOW]).h)).toEqual([276, 249, 218, 218])
})

test('the alt text names today and the week, and the savings when above zero', () => {
  const alt = cardSvg(WARM, 1400, { ...WITH_DAYS, saved: 1.5 }).alt
  expect(alt).toContain('Spend today $3.00, this week $11.00.')
  expect(alt).toContain('saved about $1.50')
  const plain = cardSvg(WARM, 1400, SPEND).alt
  expect(plain).not.toContain('today')
  expect(plain).not.toContain('saved')
})

// ---------- the metric row (three columns and up) ----------
const row = (s: string) => s.slice(s.indexOf('>CACHE HIT<') - 40)
const titleOf = (s: string, title: string) => Number(new RegExp(`<text x="([0-9.]+)" y="[0-9.]+"[^>]*>${title}<`).exec(s)![1])
const NONE: Metrics = { hit: null, perM: null, avg: null, last: null, multiple: null, runway: null, growth: null, models: [], deleg: null, subs: 0, top: [], tools: [], toolTok: 0, rereads: 0, rereadTok: 0 }
const METRIC_TITLES = ['CACHE HIT', 'PER TURN', 'BY MODEL', 'TOOL OUTPUT']
/** The metric cells' column width and x at a card width. */
const mcolW = (w: number) => Math.floor((w - 26 - 3 * 26) / 4)

test('the metric row is under the columns from three columns, warm and cold, 92 px taller, with four equal cells and no DELEGATION', () => {
  for (const [w, top] of [[1100, YC + ROW], [1400, YC + ROW]] as const)
    for (const v of [WARM, COLD]) {
      const plain = cardSvg(v, w, SPEND, [PACE_OK])
      const c = cardSvg(v, w, SPEND, [PACE_OK], METRICS)
      expect(c.h).toBe(plain.h + 92)
      const s = body(c.source)
      for (const title of METRIC_TITLES) expect(s).toContain(`>${title}<`)
      // DELEGATION is a column above, once, never a cell here.
      expect(s.split('>DELEGATION<').length - 1).toBe(1)
      expect(row(s)).not.toContain('DELEGATION')
      // The rule above it, and four equal cells across the card.
      expect(s).toContain(`<rect x="13" y="${top}" width="${w - 26}" height="1"`)
      const titleAt = (title: string) => Number(new RegExp(`<text x="([0-9.]+)" y="${top + 2 + 22}"[^>]*>${title}<`).exec(s)![1])
      expect(METRIC_TITLES.map(titleAt)).toEqual([0, 1, 2, 3].map(i => 13 + i * (mcolW(w) + 26)))
      expect(s).toContain('font-size="14" font-weight="700" fill="#8d8775" letter-spacing="1.4"')
    }
})

test('under three columns there is no metric row, whatever the card is given', () => {
  for (const w of [300, 800]) {
    const c = cardSvg(WARM, w, SPEND, [PACE_OK], METRICS)
    expect(c.h).toBe(cardSvg(WARM, w, SPEND, [PACE_OK]).h)
    for (const title of METRIC_TITLES) expect(c.source).not.toContain(title)
    // DELEGATION is a column all the same.
    expect(body(c.source)).toContain('>DELEGATION<')
    expect(c.alt).not.toContain('Cost by model')
  }
})

test('the metric row goes when the card would pass maxH, and stays when it just fits', () => {
  for (const w of [1100, 1400]) {
    const full = cardSvg(WARM, w, SPEND, [PACE_OK], METRICS)
    expect(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS, full.h).h).toBe(full.h)
    const short = cardSvg(WARM, w, SPEND, [PACE_OK], METRICS, full.h - 1)
    expect(short.h).toBe(full.h - 92)
    expect(short.source).not.toContain('CACHE HIT')
  }
})

test('the metric figures and captions', () => {
  const s = row(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS).source))
  expect(s).toContain('<tspan font-size="26">96%</tspan>')
  // The effective price is the cache hit's caption.
  expect(s).toContain('>$0.62 per 1M tokens<')
  expect(s).not.toContain('of input read from cache')
  expect(s).toContain('<tspan font-size="26">$0.38</tspan><tspan font-size="14" font-weight="500" fill="#8d8775" dx="7">avg</tspan>')
  expect(s).toContain(`last $2.11<tspan fill="${DANGER}" font-weight="700"> · 6× avg</tspan>`)
  // The context runway and the per-type subagent figures are not in the row.
  for (const gone of ['CONTEXT RUNWAY', 'SUBAGENTS', 'tokens a turn', 'Explore']) expect(s).not.toContain(gone)
})

test('without a known price the cache hit keeps its old caption', () => {
  const s = row(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, perM: null }).source))
  expect(s).toContain('>of input read from cache<')
  expect(s).not.toContain('per 1M tokens')
})

test("by model: the biggest share as the figure in its colour, a split bar in the models' colours, each cost in the caption", () => {
  const s = row(body(cardSvg(WARM, 1100, SPEND, [PACE_OK], METRICS).source))
  // 14.20 of 20.39 is 70%.
  expect(s).toContain(`<tspan font-size="26">Opus</tspan><tspan font-size="26" fill="${HUE.warm}" dx="8">70%</tspan>`)
  // The split bar: 6 px tall, 2 px gaps, one colour per model, as wide as the column and in the cost order.
  const bars = [...s.matchAll(/<rect x="([\d.]+)" y="\d+" width="([\d.]+)" height="6" rx="3" fill="(#\w+)"/g)].map(m => ({ x: Number(m[1]), w: Number(m[2]), fill: m[3] })).slice(0, 3)
  expect(bars.map(b => b.fill)).toEqual([HUE.warm, ORANGE, YELLOW])
  const x0 = 13 + 2 * (mcolW(1100) + 26)
  expect(bars[0].x).toBe(x0)
  expect(Math.abs(bars[1].x - (bars[0].x + bars[0].w + 2))).toBeLessThan(0.02)
  expect(Math.abs(bars[2].x - (bars[1].x + bars[1].w + 2))).toBeLessThan(0.02)
  expect(Math.abs(bars[2].x + bars[2].w - (x0 + mcolW(1100)))).toBeLessThan(0.05)
  expect(bars[0].w).toBeGreaterThan(bars[1].w)
  expect(bars[1].w).toBeGreaterThan(bars[2].w)
  // The caption: the first entry is the figure's model, so its name is left out; each ■ in its model's colour.
  // The third entry goes while it does not fit the cell, and is there on a wider card.
  expect(plainText(s)).toContain('■ $14.20')
  expect(plainText(s)).not.toContain('Sonnet $5.10')
  expect(plainText(row(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS).source)))).toContain('■ $14.20 · ■ Sonnet $5.10')
  expect(plainText(s)).not.toContain('Haiku $1.09')
  const wideCard = row(body(cardSvg(WARM, 1800, SPEND, [PACE_OK], METRICS).source))
  expect(plainText(wideCard)).toContain('■ $14.20 · ■ Sonnet $5.10 · ■ Haiku $1.09')
  expect(wideCard).toContain(`<tspan fill="${HUE.warm}">■</tspan> $14.20 · <tspan fill="${ORANGE}">■</tspan> Sonnet $5.10 · <tspan fill="${YELLOW}">■</tspan> Haiku $1.09`)
})

test('by model: entries that do not fit are cut from the back, one model fills the whole bar, Fable has its own colour', () => {
  const four = row(body(cardSvg(WARM, 1100, SPEND, [PACE_OK], { ...METRICS, models: [['fable', 12], ['opus', 3], ['sonnet', 2], ['haiku', 1]] }).source))
  expect(four).toContain(`<tspan font-size="26">Fable</tspan><tspan font-size="26" fill="${FABLE}" dx="8">67%</tspan>`)
  expect(plainText(four)).toContain('■ $12.00 · ■ Opus $3.00')
  expect(plainText(four)).not.toContain('Haiku $1.00')
  const one = row(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, deleg: null, models: [['sonnet', 4]] }).source))
  expect(one).toContain(`fill="${ORANGE}" dx="8">100%`)
  expect(plainText(one)).toContain('■ $4.00')
  expect([...one.matchAll(/height="6" rx="3"/g)].length).toBe(1)
  // No priced model yet: a dash.
  const dash = row(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, models: [] }).source))
  expect(plainText(dash.slice(dash.indexOf('>BY MODEL<') - 40))).toContain('BY MODEL—after a few turns')
})

// ---------- DELEGATION ----------
/** The DELEGATION column of the 1400 card, up to the next zone. */
const delegZone = (m: Metrics | null, w = 1400) => {
  const s = body(cardSvg(WARM, w, SPEND, [PACE_OK], m).source)
  return s.slice(s.indexOf('>DELEGATION<') - 40, s.indexOf('>IN CACHE<'))
}

test('delegation: the saving in the OK colour, a cost row and a time row on EMPTY tracks, and the work against the time', () => {
  const colW = colWOf(1400, 3)
  const s = delegZone(METRICS)
  expect(s).toContain('<tspan font-size="38">≈$3.10</tspan><tspan font-size="15" font-weight="500" fill="#8d8775" dx="7">saved</tspan>')
  expect(s).toContain(`<text x="13" y="${YC + 62}" font-weight="600" fill="${OK}">`)
  expect(plainText(s)).toContain('cost')
  expect(plainText(s)).toContain('time')
  const tracks = [...s.matchAll(/<rect x="([\d.]+)" y="(\d+)" width="([\d.]+)" height="6" rx="3" fill="#4a463b"\/>/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) }))
  expect(tracks.length).toBe(2)
  const fills = (fill: string) => [...s.matchAll(new RegExp(`<rect x="([\\d.]+)" y="(\\d+)" width="([\\d.]+)" height="6" rx="3" fill="${fill}"/>`, 'g'))]
  // The cost row is 40% full in orange, the time row 5 of 12 minutes in yellow; the rows are above each other, one track wide.
  const cost = fills(ORANGE).find(m => Number(m[2]) === tracks[0].y)!
  const time = fills(YELLOW).find(m => Number(m[2]) === tracks[1].y)!
  expect(Number(cost[3])).toBe(Math.round(0.4 * tracks[0].w))
  expect(Number(time[3])).toBe(Math.round((5 / 12) * tracks[1].w))
  expect(tracks[0].x).toBe(tracks[1].x)
  expect(tracks[0].w).toBe(tracks[1].w)
  expect(tracks[0].x + tracks[0].w).toBe(13 + colW)
  expect(tracks[1].y).toBeGreaterThan(tracks[0].y)
})

test('delegation is a column at every width, with its figure and caption on the other zones\' baselines', () => {
  for (const w of WIDTHS) {
    const s = body(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS).source)
    expect(s).toContain(`<text x="13" y="${YC + 24}" font-size="14" font-weight="700" fill="#8d8775" letter-spacing="1.4" text-anchor="start">DELEGATION<`)
    expect(s).toContain(`<text x="13" y="${YC + 62}" font-weight="600" fill="${OK}">`)
    expect(s).toContain(`<text x="13" y="${YC + 108}" font-size="18" font-weight="500"`)
    expect(plainText(s)).toContain('≈$3.10')
  }
})

test('the delegation caption gives work, wall time and the speed-up, shortened to fit the column', () => {
  const at = (w: number, m: Metrics) => plainText(delegZone(m, w))
  expect(at(1700, METRICS)).toContain('12m of agent work in 5m · 2.4× faster')
  expect(at(1400, METRICS)).toContain('12m of agent work in 5m · 2.4× faster')
  expect(at(1100, METRICS)).toContain('12m work in 5m · 2.4× faster')
  expect(at(300, METRICS)).toContain('12m work in 5m · 2.4× faster')
  // Never overlapped: 1.0x, said honestly; a sub-minute run is written in seconds.
  expect(at(1700, { ...METRICS, deleg: { ...DELEG, workMs: 90_000, wallMs: 90_000 } })).toContain('1m of agent work in 1m · 1.0× faster')
  expect(at(1700, { ...METRICS, deleg: { ...DELEG, workMs: 45_000, wallMs: 30_000 } })).toContain('45s of agent work in 30s · 1.5× faster')
})

test('delegation before any subagent: a dash and the plain words; with old subagent spend only, it waits for the next one; with no metrics, a dash', () => {
  const none = delegZone({ ...METRICS, deleg: null, subs: 0, top: [] })
  expect(plainText(none)).toContain('DELEGATION—no subagents this thread')
  expect(none).not.toContain('saved')
  expect(plainText(delegZone({ ...METRICS, deleg: null }))).toContain('DELEGATION—tracked from the next subagent')
  expect(plainText(delegZone(null))).toContain('DELEGATION—after a few turns')
  expect(plainText(delegZone(null, 300))).toContain('DELEGATION—after a few turns')
  // A subagent of the main model's own kind saves nothing: shown as $0.00, never negative.
  expect(delegZone({ ...METRICS, deleg: { ...DELEG, saved: 0, costRatio: 1 } })).toContain('<tspan font-size="38">≈$0.00</tspan>')
})

test('the alt text carries what the row left out: the per-type subagent costs, the models, the saving and the runway', () => {
  const alt = cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS).alt
  expect(alt).toContain('Subagents cost $5.14 (Explore $3.90, coder $1.24)')
  expect(alt).toContain('Cost by model: Opus $14.20, Sonnet $5.10, Haiku $1.09')
  expect(alt).toContain('Delegating saved about $3.10; subagents ran 12m of work in 5m')
  expect(alt).toContain('~40 turns left at +6k a turn')
  expect(alt).toContain('Effective price about $0.62 per million tokens')
})

test('the delegation sentence stays in the alt text at every width; the rest of the metrics only with the row', () => {
  for (const w of [300, 800]) {
    const alt = cardSvg(WARM, w, SPEND, [PACE_OK], METRICS).alt
    expect(alt).toContain('Delegating saved about $3.10; subagents ran 12m of work in 5m')
    expect(alt).not.toContain('Cost by model')
    expect(alt).not.toContain('Subagents cost')
    expect(cardSvg(WARM, w, SPEND, [PACE_OK], { ...METRICS, deleg: null }).alt).not.toContain('Delegating')
  }
  expect(cardSvg(WARM, 1100, SPEND, [PACE_OK], METRICS).alt).toContain('Delegating saved')
  expect(cardSvg(WARM, 1100, SPEND, [PACE_OK], METRICS).alt).toContain('Cost by model')
})

test('no outlier flag while the last turn is near the average', () => {
  const s = body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, multiple: null }).source)
  expect(s).toContain('last $2.11</text>')
  expect(s).not.toContain('× avg')
})

test('the runway is a second caption under IN CACHE at every width, with the rows and the card heights unchanged', () => {
  const plain = cardSvg(WARM, 1400, SPEND, [PACE_OK])
  const c = cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS)
  expect(plain.h).toBe(218)
  expect(c.h).toBe(310)
  const s = body(c.source)
  expect(s).toContain('>~40 turns left at +6k a turn<')
  expect(s).toContain('>24% of the 1M context · 760k free<')
  // Both captions, and the dots, sit inside the 124 px row, above the rule under it.
  const x = colXOf(1400, 3, 1)
  const ys = (re: RegExp) => Number(re.exec(s)![1])
  const second = ys(new RegExp(`<text x="${x}" y="(\\d+)"[^>]*>~40 turns left`))
  const first = ys(new RegExp(`<text x="${x}" y="(\\d+)"[^>]*>24% of the`))
  expect(first).toBeLessThan(second)
  expect(second + 4).toBeLessThanOrEqual(YC + ROW)
  const dotYs = [...s.matchAll(/<circle cx="[\d.]+" cy="(\d+)" r="3"/g)].map(m => Number(m[1])).slice(0, 50)
  expect(Math.max(...dotYs) + 3).toBeLessThan(first - 12)
  // At every width, the long form where it fits the column and the short one where it does not; not while the growth is unknown.
  expect(body(cardSvg(WARM, 800, SPEND, [PACE_OK], METRICS).source)).toContain('>~40 turns left at +6k a turn<')
  // With one column IN CACHE is a status line, which has no runway.
  expect(body(cardSvg(WARM, 300, SPEND, [PACE_OK], METRICS).source)).not.toContain('turns left')
  for (const w of WIDTHS) expect(body(cardSvg(WARM, w, SPEND, [PACE_OK], { ...METRICS, runway: null, growth: null }).source)).not.toContain('turns left')
})

test('the runway shows >99 past the cap, escaped, and small growth is written in tokens', () => {
  const s = body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, runway: 250, growth: 640 }).source)
  expect(s).toContain('>&gt;99 turns left at +640 a turn<')
})

test('an unknown metric shows its title, a dash and when it will be known', () => {
  // Nothing known at all: no row.
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], NONE).h).toBe(218)
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], null).h).toBe(218)
  // One known: the row, with the others as dashes (the DELEGATION column above has its own dash).
  const s = row(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...NONE, hit: 0.5 }).source))
  expect(s).toContain('<tspan font-size="26">50%</tspan>')
  expect(s.split('<tspan font-size="26">—</tspan>').length - 1).toBe(3)
  expect(s.split('>after a few turns<').length - 1).toBe(3)
  expect(s).toContain('>of input read from cache<')
  expect(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...NONE, hit: 0.5 }).source)).toContain('>no subagents this thread<')
  // Subagent cost alone is enough to show the row.
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...NONE, subs: 1, top: [['Explore', 1]] }).h).toBe(310)
})

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

// ---------- TOOL OUTPUT ----------
test('tool output: the figure in tokens, the top tools and the re-reads in orange as the caption', () => {
  const s = row(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS).source))
  expect(s).toContain('>TOOL OUTPUT<')
  expect(s).toContain('<tspan font-size="26">41k</tspan><tspan font-size="14" font-weight="500" fill="#8d8775" dx="7">tokens</tspan>')
  // Four cells: the fourth title is at the fourth column.
  expect(titleOf(s, 'TOOL OUTPUT')).toBe(13 + 3 * (mcolW(1400) + 26))
  // 1400: the column fits Bash and Read and the re-reads; Grep is cut from the back.
  expect(s).toContain(`>Bash 18k · Read 12k<tspan fill="${ORANGE}" font-weight="700"> · 4 re-reads</tspan>`)
  const wide = row(body(cardSvg(WARM, 1800, SPEND, [PACE_OK], METRICS).source))
  expect(wide).toContain(`>Bash 18k · Read 12k · Grep 6k<tspan fill="${ORANGE}" font-weight="700"> · 4 re-reads</tspan>`)
  // No re-reads: no orange part. One re-read is singular.
  const none = row(body(cardSvg(WARM, 1800, SPEND, [PACE_OK], { ...METRICS, rereads: 0, rereadTok: 0 }).source))
  expect(none).toContain('>Bash 18k · Read 12k · Grep 6k</text>')
  expect(none).not.toContain('re-read')
  expect(row(body(cardSvg(WARM, 1800, SPEND, [PACE_OK], { ...METRICS, rereads: 1 }).source))).toContain('> · 1 re-read</tspan>')
})

test('tool output: at the narrowest width the row shows, the re-read part stays and tools are cut from the back', () => {
  const s = row(body(cardSvg(WARM, 1023, SPEND, [PACE_OK], METRICS).source))
  expect(s).toContain('>TOOL OUTPUT<')
  expect(s).toContain(`>Bash 18k<tspan fill="${ORANGE}" font-weight="700"> · 4 re-reads</tspan>`)
  // Every caption in the row fits its cell (0.56 em a character, as the card estimates).
  const size = 16
  for (const m of s.matchAll(/<text x="[\d.]+" y="\d+" font-size="16" font-weight="500"[^>]*>(.*?)<\/text>/g)) expect(plainText(m[1]).length * size * 0.56).toBeLessThanOrEqual(mcolW(1023))
})

test('tool output: unknown shows a dash, and it alone is enough to show the row', () => {
  const c = cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...NONE, toolTok: 500, tools: [['Bash', 500]] })
  expect(c.h).toBe(310)
  expect(plainText(row(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...NONE, hit: 0.5 }).source)))).toContain('TOOL OUTPUT—after a few turns')
})

test('the alt text has the tool output sentence, the re-read part only when there are re-reads, and only with the row', () => {
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS).alt).toContain(' Tool output into the context: about 41k tokens (Bash 18k, Read 12k, Grep 6k); 4 re-reads of unchanged files, about 9k tokens.')
  const none = cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, rereads: 0, rereadTok: 0 }).alt
  expect(none).toContain(' Tool output into the context: about 41k tokens (Bash 18k, Read 12k, Grep 6k).')
  expect(none).not.toContain('re-read')
  expect(cardSvg(WARM, 800, SPEND, [PACE_OK], METRICS).alt).not.toContain('Tool output')
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, toolTok: 0, tools: [], rereads: 0 }).alt).not.toContain('Tool output')
})
