import { expect, test } from 'claude-code/testing'

import { DANGER, EMPTY, FABLE, HUE, ICE, INK, LC_BL, LC_INK, LC_LA, LC_OR, LC_PE, LC_TA, LIGHT, LINE, MODELS, MUTED, OK, ORANGE, TEXT, YELLOW, cardSvg, chipSvg, fmtBreakEven, keepWarmCost, roboSvg, svgDoc } from '../hooks/cache-art'
import type { CacheView, Kind, PaceRow } from '../hooks/cache-art'
import type { Metrics } from '../hooks/metrics'

const WARM: CacheView = { mode: 'warm', idle: '18m', idleMin: 18, tokens: 240000, window: 1000000, mine: 'opus' }
const COLD: CacheView = { mode: 'cold', idle: '2h 5m', idleMin: 125, tokens: 240000, window: 1000000, mine: 'opus' }
const SPEND = { main: 7.4, subs: 0.37 }
const WIDTH: Record<Kind, number> = { wide: 1300, stacked: 800, tight: 300 }
const KINDS = ['wide', 'stacked', 'tight'] as const
const DELEG = { saved: 3.1, costRatio: 0.4, workMs: 12 * 60000, wallMs: 5 * 60000 }
const METRICS: Metrics = {
  hit: 0.963, perM: 0.62, avg: 0.38, last: 2.11, multiple: 6, runway: 40.4, growth: 6200,
  models: [['opus', 14.2], ['sonnet', 5.1], ['haiku', 1.09]], deleg: DELEG, subs: 5.14, top: [['Explore', 3.9], ['coder', 1.24]],
}

// Drawings put their words between tags; look after the font data in the style block.
const body = (s: string) => s.slice(s.indexOf('</style>'))

for (const kind of KINDS) {
  test(`the warm ${kind} card has IN CACHE and the conversation's cost, and nothing the row already shows`, () => {
    const s = body(cardSvg(WARM, kind, WIDTH[kind], SPEND).source)
    expect(s).toContain('>IN CACHE<')
    expect(s).toContain('>SPEND<')
    expect(s).toContain('≈$7.77')
    expect(s).toContain('main $7.40 · subagents $0.37')
    expect(s).toContain('24% of the 1M context · 760k free')
    for (const gone of ['IDLE', 'LIMIT', '>WARM<', 'NEXT MESSAGE', 'HAIKU', 'OPUS', 'last reply']) expect(s).not.toContain(gone)
  })

  test(`the ${kind} card has no block of model costs, warm or cold`, () => {
    for (const v of [WARM, COLD]) {
      const c = cardSvg(v, kind, WIDTH[kind], SPEND, [PACE_OK], METRICS)
      expect(c.source).not.toContain('NEXT MESSAGE')
      expect(c.alt).not.toContain('NEXT MESSAGE')
      for (const name of ['FABLE', 'OPUS', 'SONNET', 'HAIKU', 'YOU']) expect(body(c.source)).not.toContain(`>${name}<`)
    }
    expect(body(cardSvg(COLD, kind, WIDTH[kind], SPEND).source)).toContain('>SPEND<')
  })

  test(`the ${kind} card is as tall cold as warm`, () => {
    expect(cardSvg(COLD, kind, WIDTH[kind], SPEND).h).toBe(cardSvg(WARM, kind, WIDTH[kind], SPEND).h)
    expect(cardSvg(COLD, kind, WIDTH[kind], SPEND, [], METRICS).h).toBe(cardSvg(WARM, kind, WIDTH[kind], SPEND, [], METRICS).h)
  })
}

test('the card heights: no empty space', () => {
  const h = (v: CacheView, kind: Kind) => cardSvg(v, kind, WIDTH[kind], SPEND).h
  expect({ wide: h(WARM, 'wide'), stacked: h(WARM, 'stacked'), tight: h(WARM, 'tight') }).toEqual({ wide: 130, stacked: 184, tight: 228 })
  expect({ wide: h(COLD, 'wide'), stacked: h(COLD, 'stacked'), tight: h(COLD, 'tight') }).toEqual({ wide: 130, stacked: 184, tight: 228 })
})

test('the free context is spelled out in the caption and in the alt text', () => {
  const c = cardSvg(WARM, 'wide', 1300, SPEND)
  expect(body(c.source)).toContain('760k free')
  expect(c.alt.startsWith('Cache warm')).toBe(true)
  expect(c.alt).toContain('760k of the context free')
  expect(c.alt).toContain('main $7.40, subagents $0.37')
})

test('with no cost yet the figure is ≈$0.00 and there is no caption', () => {
  for (const kind of KINDS) {
    const s = body(cardSvg(WARM, kind, WIDTH[kind], null).source)
    expect(s).toContain('≈$0.00')
    expect(s).not.toContain('subagents')
  }
})

test('the cost dots split between the main session and the subagents', () => {
  const s = body(cardSvg(WARM, 'wide', 1300, SPEND).source)
  // Main in the mode hue, subagents muted: both colours are on the cost dots.
  const dots = s.slice(s.indexOf('>SPEND<'))
  expect(dots).toContain('fill="#cc6363"')
  expect(dots).toContain('fill="#8d8775"')
})

test('the card keeps the limits out of its alt text', () => {
  for (const kind of KINDS) expect(cardSvg(WARM, kind, WIDTH[kind], SPEND).alt).not.toContain('limit')
})

const PACE_OK: PaceRow = { label: '7D', color: '#ff6b1a', untilResetMs: 3 * 3600_000, pace: { lastsMs: 5 * 3600_000, untilResetMs: 3 * 3600_000, ok: true } }
const PACE_LOW: PaceRow = { label: '5H', color: '#f5a623', untilResetMs: 82 * 60_000, pace: { lastsMs: 160 * 60_000, untilResetMs: 200 * 60_000, ok: false } }
const PACE_NONE: PaceRow = { label: '5H', color: '#f5a623', untilResetMs: 82 * 60_000, pace: null }

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

test('the warm wide card has four columns, and the cold one turns keep warm into re-cache now', () => {
  const warm = body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK, PACE_LOW]).source)
  for (const z of ['>IN CACHE<', '>SPEND<', '>KEEP WARM<', '>PACE VS RESET<']) expect(warm).toContain(z)
  expect(warm).toContain('$0.06')
  expect(warm).toContain('going cold costs <tspan fill="#6aaabd" font-weight="700">$1.92</tspan>')
  // At today's prices the break-even is over a day, so the card leaves the line out.
  expect(warm).not.toContain('warm is cheaper')
  expect(warm).not.toContain('bar: time left')
  expect(warm).not.toContain('NEXT MESSAGE')
  // IN CACHE keeps its dot grid: 25 dots a row, two rows.
  const inCache = warm.slice(warm.indexOf('>IN CACHE<'), warm.indexOf('>SPEND<'))
  expect(inCache.split('<circle').length - 1).toBe(50)
  const cold = body(cardSvg(COLD, 'wide', 1300, SPEND, [PACE_OK]).source)
  for (const name of ['>RE-CACHE<', '>RE-CACHE NOW<', 'PACE VS RESET']) expect(cold).toContain(name)
  expect(cold).not.toContain('KEEP WARM')
})

test('the cold wide card: the re-cache cost on this model in the cold hue, the cheaper models, and what warm costs', () => {
  const s = body(cardSvg(COLD, 'wide', 1300, SPEND).source)
  const zone = s.slice(s.indexOf('>RE-CACHE NOW<'), s.indexOf('>PACE VS RESET<'))
  // Opus on 240k tokens: $4 x 2 a million to write; warm is 1.2 pings of cache reads an hour.
  expect(zone).toContain('<tspan font-size="38">$1.92</tspan>')
  expect(zone).toContain('>on Opus</tspan>')
  expect(zone).toContain(`font-weight="600" fill="${HUE.cold}"`)
  expect(zone).toContain('>Sonnet $0.96 · Haiku $0.24<')
  expect(zone).toContain('>warm costs $0.06/h<')
  expect(zone).not.toContain('Fable')
})

test('the cheaper models are the priced ones below this session, in MODELS order; none for the cheapest', () => {
  expect(MODELS.map(m => m.id)).toEqual(['fable', 'opus', 'sonnet', 'haiku'])
  const fable = body(cardSvg({ ...COLD, mine: 'fable' }, 'wide', 1300, SPEND).source)
  expect(fable).toContain('>on Fable</tspan>')
  // Wide: the column has room for the two cheapest of the three cheaper models, not for all three.
  expect(fable).toContain('Sonnet $0.96 · Haiku $0.24')
  const haiku = body(cardSvg({ ...COLD, mine: 'haiku' }, 'wide', 1300, SPEND).source)
  expect(haiku).toContain('>on Haiku</tspan>')
  expect(haiku).toContain('>warm costs $0.01/h<')
  // No cheaper model: no line for them, and the warm line takes its place one step up.
  expect(haiku).not.toContain('Sonnet')
  expect(haiku).toContain('y="88" font-size="18" font-weight="500" fill="#8d8775" letter-spacing="0" text-anchor="start">warm costs')
})

test('a cold card on an unpriced model still says so', () => {
  const v = { ...COLD, mine: null }
  expect(body(cardSvg(v, 'wide', 1300, SPEND).source)).toContain('model not priced')
  expect(body(cardSvg(v, 'stacked', 800, SPEND).source)).toContain('keep warm: model not priced')
})

test('the cold stacked and tight cards write the re-cache cost and the cheaper models as one line, its dot in the cold hue', () => {
  for (const kind of ['stacked', 'tight'] as const) {
    const s = body(cardSvg(COLD, kind, kind === 'tight' ? 700 : 800, SPEND, [PACE_OK]).source)
    expect(s).toContain('re-cache $1.92 on Opus · Sonnet $0.96 · Haiku $0.24')
    expect(s).not.toContain('keep warm')
    expect(s).toContain(`r="4" fill="${HUE.cold}"`)
  }
  // A narrow band drops the dearest of the cheaper models first.
  expect(body(cardSvg({ ...COLD, mine: 'fable' }, 'tight', 300, SPEND).source)).toContain('re-cache $4.80 on Fable · Haiku $0.24')
})

test('the warm stacked and tight keep line adds what the pings saved', () => {
  for (const kind of ['stacked', 'tight'] as const) {
    expect(body(cardSvg(WARM, kind, WIDTH[kind], { ...SPEND, saved: 1.5 }).source)).toContain('keep warm $0.06/h · going cold $1.92 · saved $1.50')
    expect(body(cardSvg(WARM, kind, WIDTH[kind], SPEND).source)).not.toContain('saved')
    expect(body(cardSvg(WARM, kind, WIDTH[kind], { ...SPEND, saved: 0, pings: 0.1 }).source)).not.toContain('saved')
  }
})

test('the cold alt text gives the re-cache cost and the cheaper models', () => {
  expect(cardSvg(COLD, 'wide', 1300, SPEND).alt).toContain('re-caching now costs $1.92 on Opus (cheaper: Sonnet $0.96, Haiku $0.24)')
  expect(cardSvg({ ...COLD, mine: 'haiku' }, 'wide', 1300, SPEND).alt).toContain('re-caching now costs $0.24 on Haiku.')
  expect(cardSvg(WARM, 'wide', 1300, SPEND).alt).toContain('going cold costs $1.92.')
})

test('the pace bar is the window colour when it lasts to the reset and red when it ends before', () => {
  const s = body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK, PACE_LOW]).source)
  expect(s).toContain('height="6" rx="3" fill="#ff6b1a"')
  expect(s).toContain(`height="6" rx="3" fill="${DANGER}"`)
  expect(s).toContain(`<tspan fill="${DANGER}">runs out in ~2h 40m</tspan> · resets 3h 20m`)
})

test('the wide card says so when the pace is unknown for every window', () => {
  const s = body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_NONE]).source)
  expect(s).toContain('>pace unknown<')
  expect(s).not.toContain(DANGER)
})

test('the stacked and tight cards carry keep warm and the riskiest window as text lines', () => {
  for (const kind of ['stacked', 'tight'] as const) {
    const s = body(cardSvg(WARM, kind, WIDTH[kind], SPEND, [PACE_OK, PACE_LOW]).source)
    expect(s).toContain('keep warm $0.06/h · going cold $1.92')
    expect(s).toContain('5H runs out in ~2h 40m · resets in 3h 20m')
    expect(s).toContain(DANGER)
    expect(s).not.toContain('>KEEP WARM<')
    const ok = body(cardSvg(WARM, kind, WIDTH[kind], SPEND, [PACE_OK]).source)
    expect(ok).toContain('7D ✓ lasts until reset · resets in 3h 0m')
    expect(ok).not.toContain(DANGER)
    expect(body(cardSvg(WARM, kind, WIDTH[kind], SPEND, []).source)).toContain('>pace unknown<')
  }
})

test('an unpriced model leaves keep warm without figures', () => {
  const v = { ...WARM, mine: null }
  expect(body(cardSvg(v, 'wide', 1300, SPEND).source)).toContain('model not priced')
  expect(body(cardSvg(v, 'stacked', 800, SPEND).source)).toContain('keep warm: model not priced')
})

test('while cold, nothing on the card says going cold', () => {
  expect(body(cardSvg(COLD, 'wide', 1300, SPEND, [PACE_OK]).source)).not.toContain('going cold')
  expect(body(cardSvg(COLD, 'stacked', 800, SPEND, [PACE_OK]).source)).not.toContain('going cold')
})

const WITH_DAYS = { ...SPEND, days: [0, 1, 2, 0, 4, 1, 3] }

// The x of a zone's title, which sits at y 24 in the first row.
const titleX = (s: string, title: string) => Number(new RegExp(`<text x="([0-9.]+)" y="24"[^>]*>${title}<`).exec(s)![1])

test('the warm wide card has four equal columns: the titles are evenly spaced', () => {
  for (const w of [1300, 1500, 1981]) {
    const s = body(cardSvg(WARM, 'wide', w, SPEND, [PACE_OK]).source)
    const xs = ['IN CACHE', 'SPEND', 'KEEP WARM', 'PACE VS RESET'].map(z => titleX(s, z))
    const colW = Math.floor((w - 26 - 3 * 26) / 4)
    expect(xs).toEqual([13, 13 + colW + 26, 13 + 2 * (colW + 26), 13 + 3 * (colW + 26)])
  }
})

test('the spend zone draws seven day bars, today in orange and a day with no spend as a 2 px stub', () => {
  for (const v of [WARM, COLD]) {
    const s = body(cardSvg(v, 'wide', 1300, WITH_DAYS).source)
    const zone = s.slice(s.indexOf('>SPEND<'), s.indexOf('>KEEP WARM<'))
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
  const s = body(cardSvg(WARM, 'wide', 1300, { ...SPEND, days: [1, 0, 0, 0, 0, 0, 0] }).source)
  const bars = s.slice(s.indexOf('>SPEND<'), s.indexOf('>KEEP WARM<')).match(/<rect [^>]*rx="1"[^>]*\/>/g)!
  expect(bars[6]).toContain('fill="#4a463b"')
  expect(bars[6]).toContain('height="2"')
})

test('without daily figures the spend zone falls back to the dot split and main and subagents', () => {
  for (const days of [undefined, [0, 0, 0, 0, 0, 0, 0]]) {
    const s = body(cardSvg(WARM, 'wide', 1300, { ...SPEND, days }).source)
    const zone = s.slice(s.indexOf('>SPEND<'), s.indexOf('>KEEP WARM<'))
    expect(zone).toContain('main $7.40 · subagents $0.37')
    expect(zone).not.toContain('today $')
    expect(zone).not.toContain('rx="1"')
    expect(zone).toContain('<circle')
  }
})

test('stacked and tight cards use the today and week caption when days are known', () => {
  for (const kind of ['stacked', 'tight'] as const) {
    const s = body(cardSvg(WARM, kind, WIDTH[kind], WITH_DAYS).source)
    expect(s).toContain('today $3.00 · week $11.00')
    expect(s).not.toContain('subagents $0.37')
  }
})

test('the heights do not change with daily figures or savings', () => {
  const more = { ...WITH_DAYS, saved: 1.5, pings: 0.12 }
  expect(KINDS.map(k => cardSvg(WARM, k, WIDTH[k], more, [PACE_OK, PACE_LOW]).h)).toEqual([130, 184, 228])
  expect(KINDS.map(k => cardSvg(COLD, k, WIDTH[k], more, [PACE_OK, PACE_LOW]).h)).toEqual([130, 184, 228])
})

test('keep warm adds a saved and pings line, which takes the break-even line\'s place', () => {
  const s = body(cardSvg(WARM, 'wide', 1300, { ...SPEND, saved: 1.5, pings: 0.123 }).source)
  expect(s).toContain('saved $1.50 · pings $0.12')
  expect(s).not.toContain('warm is cheaper')
  expect(body(cardSvg(WARM, 'wide', 1300, { ...SPEND, pings: 0.05 }).source)).toContain('saved $0.00 · pings $0.05')
  const none = body(cardSvg(WARM, 'wide', 1300, SPEND).source)
  expect(none).not.toContain('saved $')
  expect(none).not.toContain('pings $')
  expect(body(cardSvg({ ...WARM, mine: null }, 'wide', 1300, { ...SPEND, saved: 1 }).source)).not.toContain('saved $')
})

test('the alt text names today and the week, and the savings when above zero', () => {
  const alt = cardSvg(WARM, 'wide', 1300, { ...WITH_DAYS, saved: 1.5 }).alt
  expect(alt).toContain('Spend today $3.00, this week $11.00.')
  expect(alt).toContain('saved about $1.50')
  const plain = cardSvg(WARM, 'wide', 1300, SPEND).alt
  expect(plain).not.toContain('today')
  expect(plain).not.toContain('saved')
})

test('the stacked and tight text lines have a status dot: green or the cold hue for keep warm, green, red or grey for the pace', () => {
  for (const kind of ['stacked', 'tight'] as const) {
    const at = (rows: PaceRow[]) => body(cardSvg(WARM, kind, WIDTH[kind], SPEND, rows).source)
    const dotsOf = (s: string) => s.match(/<circle [^>]*r="4" fill="[^"]+"/g)!.map(d => /fill="([^"]+)"/.exec(d)![1])
    expect(dotsOf(at([PACE_OK]))).toEqual([OK, OK])
    expect(dotsOf(at([PACE_LOW]))).toEqual([OK, DANGER])
    expect(dotsOf(at([PACE_NONE]))).toEqual([OK, '#8d8775'])
    expect(dotsOf(body(cardSvg(COLD, kind, WIDTH[kind], SPEND, [PACE_OK]).source))[0]).toBe('#6aaabd')
  }
})

test('the wide pace zone writes the forecast under each bar', () => {
  const s = body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK, PACE_LOW, PACE_NONE]).source)
  expect(s).toContain(`>lasts ~5h 0m</tspan> · resets 3h 0m<tspan fill="${OK}"`)
  expect(s).toContain('>runs out in ~2h 40m</tspan> · resets 3h 20m')
  expect(s).not.toContain('pace unknown')
  expect(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_NONE]).source)).toContain('>pace unknown<')
})

// ---------- the metric row (wide only) ----------
const row = (s: string) => s.slice(s.indexOf('>CACHE HIT<') - 40)

test('the wide card gets a metric row under the four columns, warm and cold, 92 px taller', () => {
  for (const v of [WARM, COLD]) {
    const plain = cardSvg(v, 'wide', 1300, SPEND, [PACE_OK])
    const c = cardSvg(v, 'wide', 1300, SPEND, [PACE_OK], METRICS)
    expect(c.h).toBe(plain.h + 92)
    expect(c.h).toBe(222)
    const s = body(c.source)
    for (const title of ['CACHE HIT', 'PER TURN', 'BY MODEL', 'DELEGATION']) expect(s).toContain(`>${title}<`)
    // The rule above it, and the same x grid as the row above.
    expect(s).toContain('<rect x="13" y="124" width="1274" height="1"')
    const titleAt = (title: string) => Number(new RegExp(`<text x="([0-9.]+)" y="${124 + 2 + 22}"[^>]*>${title}<`).exec(s)![1])
    const colW = Math.floor((1300 - 26 - 3 * 26) / 4)
    expect(['CACHE HIT', 'PER TURN', 'BY MODEL', 'DELEGATION'].map(titleAt)).toEqual([0, 1, 2, 3].map(i => 13 + i * (colW + 26)))
    expect(s).toContain('font-size="14" font-weight="700" fill="#8d8775" letter-spacing="1.4"')
  }
})

test('the other layouts have no metric row, whatever they are given', () => {
  for (const kind of ['stacked', 'tight'] as const) {
    const c = cardSvg(WARM, kind, WIDTH[kind], SPEND, [PACE_OK], METRICS)
    expect(c.h).toBe(cardSvg(WARM, kind, WIDTH[kind], SPEND, [PACE_OK]).h)
    for (const title of ['CACHE HIT', 'PER TURN', 'BY MODEL', 'DELEGATION']) expect(c.source).not.toContain(title)
  }
})

const plainText = (s: string) => s.replace(/<[^>]*>/g, '')
const NONE: Metrics = { hit: null, perM: null, avg: null, last: null, multiple: null, runway: null, growth: null, models: [], deleg: null, subs: 0, top: [] }
const colWide = Math.floor((1300 - 26 - 3 * 26) / 4)

test('the metric figures and captions', () => {
  const s = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], METRICS).source))
  expect(s).toContain('<tspan font-size="26">96%</tspan>')
  // The effective price is the cache hit's caption.
  expect(s).toContain('>$0.62 per 1M tokens<')
  expect(s).not.toContain('of input read from cache')
  expect(s).toContain('<tspan font-size="26">$0.38</tspan><tspan font-size="14" font-weight="500" fill="#8d8775" dx="7">avg</tspan>')
  expect(s).toContain(`last $2.11<tspan fill="${DANGER}" font-weight="700"> · 6× avg</tspan>`)
  // The context runway and the per-type subagent figures are no longer in the row.
  for (const gone of ['CONTEXT RUNWAY', 'SUBAGENTS', 'tokens a turn', 'Explore']) expect(s).not.toContain(gone)
})

test('without a known price the cache hit keeps its old caption', () => {
  const s = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, perM: null }).source))
  expect(s).toContain('>of input read from cache<')
  expect(s).not.toContain('per 1M tokens')
})

test("by model: the biggest share as the figure in its colour, a split bar in the models' colours, each cost in the caption", () => {
  const s = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], METRICS).source))
  // 14.20 of 20.39 is 70%.
  expect(s).toContain(`<tspan font-size="26">Opus</tspan><tspan font-size="26" fill="${HUE.warm}" dx="8">70%</tspan>`)
  // The split bar: 6 px tall, 2 px gaps, one colour per model, as wide as the column and in the cost order.
  const bars = [...s.matchAll(/<rect x="([\d.]+)" y="\d+" width="([\d.]+)" height="6" rx="3" fill="(#\w+)"/g)].map(m => ({ x: Number(m[1]), w: Number(m[2]), fill: m[3] })).slice(0, 3)
  expect(bars.map(b => b.fill)).toEqual([HUE.warm, ORANGE, YELLOW])
  const x0 = 13 + 2 * (colWide + 26)
  expect(bars[0].x).toBe(x0)
  expect(Math.abs(bars[1].x - (bars[0].x + bars[0].w + 2))).toBeLessThan(0.02)
  expect(Math.abs(bars[2].x - (bars[1].x + bars[1].w + 2))).toBeLessThan(0.02)
  expect(Math.abs(bars[2].x + bars[2].w - (x0 + colWide))).toBeLessThan(0.05)
  expect(bars[0].w).toBeGreaterThan(bars[1].w)
  expect(bars[1].w).toBeGreaterThan(bars[2].w)
  // The caption: the first entry is the figure's model, so its name is left out; each ■ in its model's colour.
  // The third entry goes while it does not fit the column, and is there on a wider card.
  expect(plainText(s)).toContain('■ $14.20 · ■ Sonnet $5.10')
  expect(plainText(s)).not.toContain('Haiku $1.09')
  const wideCard = row(body(cardSvg(WARM, 'wide', 1800, SPEND, [PACE_OK], METRICS).source))
  expect(plainText(wideCard)).toContain('■ $14.20 · ■ Sonnet $5.10 · ■ Haiku $1.09')
  expect(wideCard).toContain(`<tspan fill="${HUE.warm}">■</tspan> $14.20 · <tspan fill="${ORANGE}">■</tspan> Sonnet $5.10 · <tspan fill="${YELLOW}">■</tspan> Haiku $1.09`)
})

test('by model: entries that do not fit are cut from the back, one model fills the whole bar, Fable has its own colour', () => {
  const four = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, models: [['fable', 12], ['opus', 3], ['sonnet', 2], ['haiku', 1]] }).source))
  expect(four).toContain(`<tspan font-size="26">Fable</tspan><tspan font-size="26" fill="${FABLE}" dx="8">67%</tspan>`)
  expect(plainText(four)).toContain('■ $12.00 · ■ Opus $3.00')
  expect(plainText(four)).not.toContain('Haiku $1.00')
  const one = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, deleg: null, models: [['sonnet', 4]] }).source))
  expect(one).toContain(`fill="${ORANGE}" dx="8">100%`)
  expect(plainText(one)).toContain('■ $4.00')
  expect([...one.matchAll(/height="6" rx="3"/g)].length).toBe(1)
  // No priced model yet: a dash.
  const dash = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, models: [] }).source))
  expect(plainText(dash.slice(dash.indexOf('>BY MODEL<') - 40))).toContain('BY MODEL—after a few turns')
})

test('delegation: the saving in the OK colour, a cost row and a time row on EMPTY tracks, and the work against the time', () => {
  const s = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], METRICS).source))
  expect(s).toContain('<tspan font-size="26">≈$3.10</tspan><tspan font-size="14" font-weight="500" fill="#8d8775" dx="7">saved</tspan>')
  expect(s).toContain(`<text x="${13 + 3 * (colWide + 26)}" y="${124 + 2 + 54}" font-weight="600" fill="${OK}">`)
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
  expect(tracks[0].x + tracks[0].w).toBe(13 + 3 * (colWide + 26) + colWide)
  expect(tracks[1].y).toBeGreaterThan(tracks[0].y)
})

test('the delegation caption gives work, wall time and the speed-up, shortened to fit the column', () => {
  const at = (w: number, m: Metrics) => plainText(row(body(cardSvg(WARM, 'wide', w, SPEND, [PACE_OK], m).source)))
  expect(at(1700, METRICS)).toContain('12m of agent work in 5m · 2.4× faster')
  expect(at(1300, METRICS)).toContain('12m work in 5m · 2.4× faster')
  // Never overlapped: 1.0x, said honestly; a sub-minute run is written in seconds.
  expect(at(1700, { ...METRICS, deleg: { ...DELEG, workMs: 90_000, wallMs: 90_000 } })).toContain('1m of agent work in 1m · 1.0× faster')
  expect(at(1700, { ...METRICS, deleg: { ...DELEG, workMs: 45_000, wallMs: 30_000 } })).toContain('45s of agent work in 30s · 1.5× faster')
})

test('delegation before any subagent: a dash and the plain words; with old subagent spend only, it waits for the next one', () => {
  const none = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, deleg: null, subs: 0, top: [] }).source))
  expect(plainText(none.slice(none.indexOf('>DELEGATION<') - 40))).toContain('DELEGATION—no subagents this thread')
  expect(none).not.toContain('saved')
  const old = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, deleg: null }).source))
  expect(plainText(old)).toContain('tracked from the next subagent')
  // A subagent of the main model's own kind saves nothing: shown as $0.00, never negative.
  const same = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, deleg: { ...DELEG, saved: 0, costRatio: 1 } }).source))
  expect(same).toContain('<tspan font-size="26">≈$0.00</tspan>')
})

test('the alt text carries what the row left out: the per-type subagent costs, the models, the saving and the runway', () => {
  const alt = cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], METRICS).alt
  expect(alt).toContain('Subagents cost $5.14 (Explore $3.90, coder $1.24)')
  expect(alt).toContain('Cost by model: Opus $14.20, Sonnet $5.10, Haiku $1.09')
  expect(alt).toContain('Delegating saved about $3.10; subagents ran 12m of work in 5m')
  expect(alt).toContain('~40 turns left at +6k a turn')
  expect(alt).toContain('Effective price about $0.62 per million tokens')
  expect(cardSvg(WARM, 'stacked', 800, SPEND, [PACE_OK], METRICS).alt).not.toContain('Cost by model')
})

test('no outlier flag while the last turn is near the average', () => {
  const s = body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, multiple: null }).source)
  expect(s).toContain('last $2.11</text>')
  expect(s).not.toContain('× avg')
})

test('the runway is a second caption under IN CACHE, with the rows and the card heights unchanged', () => {
  const plain = cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK])
  const c = cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], METRICS)
  expect(plain.h).toBe(130)
  expect(c.h).toBe(222)
  const s = body(c.source)
  expect(s).toContain('>~40 turns left at +6k a turn<')
  expect(s).toContain('>24% of the 1M context · 760k free<')
  // Both captions, and the dots, sit inside the 124 px row, above the rule under it.
  const ys = (re: RegExp) => Number(re.exec(s)![1])
  const second = ys(/<text x="13" y="(\d+)"[^>]*>~40 turns left/)
  const first = ys(/<text x="13" y="(\d+)"[^>]*>24% of the/)
  expect(first).toBeLessThan(second)
  expect(second + 4).toBeLessThanOrEqual(124)
  const dotYs = [...s.matchAll(/<circle cx="[\d.]+" cy="(\d+)" r="3"/g)].map(m => Number(m[1])).slice(0, 50)
  expect(Math.max(...dotYs) + 3).toBeLessThan(first - 12)
  // Not on the stacked card, and not while the growth is unknown.
  expect(body(cardSvg(WARM, 'stacked', 800, SPEND, [PACE_OK], METRICS).source)).not.toContain('turns left')
  expect(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, runway: null, growth: null }).source)).not.toContain('turns left')
})

test('the runway shows >99 past the cap, escaped, and small growth is written in tokens', () => {
  const s = body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...METRICS, runway: 250, growth: 640 }).source)
  expect(s).toContain('>&gt;99 turns left at +640 a turn<')
})

test('an unknown metric shows its title, a dash and when it will be known', () => {
  // Nothing known at all: no row.
  expect(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], NONE).h).toBe(130)
  expect(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], null).h).toBe(130)
  // One known: the row, with the others as dashes.
  const s = row(body(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...NONE, hit: 0.5 }).source))
  expect(s).toContain('<tspan font-size="26">50%</tspan>')
  expect(s.split('<tspan font-size="26">—</tspan>').length - 1).toBe(3)
  expect(s.split('>after a few turns<').length - 1).toBe(2)
  expect(s).toContain('>of input read from cache<')
  expect(s).toContain('>no subagents this thread<')
  // Subagent cost alone is enough to show the row.
  expect(cardSvg(WARM, 'wide', 1300, SPEND, [PACE_OK], { ...NONE, subs: 1, top: [['Explore', 1]] }).h).toBe(222)
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
    ...KINDS.flatMap(k => [cardSvg(WARM, k, WIDTH[k], SPEND).source, cardSvg(COLD, k, WIDTH[k], SPEND).source]),
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
    ...KINDS.flatMap(k => [cardSvg(WARM, k, WIDTH[k], SPEND, [PACE_OK, PACE_LOW, PACE_NONE], METRICS).source, cardSvg(COLD, k, WIDTH[k], { ...WITH_DAYS, saved: 1 }, [PACE_OK]).source]),
  ]
  for (const d of sources) {
    const drawing = d.slice(d.indexOf('</style>'))
    for (const m of drawing.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,6})"/g)) painted.add(m[1])
  }
  for (const c of painted) if (c !== '#000') expect(Object.keys(LIGHT)).toContain(c)
  expect(painted.size).toBeGreaterThan(8)
})
