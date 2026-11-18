import { expect, test } from 'claude-code/testing'

import { DANGER, OK, cardSvg, fmtBreakEven, keepWarmCost } from '../hooks/cache-art'
import type { CacheView, Kind, PaceRow } from '../hooks/cache-art'

const WARM: CacheView = { mode: 'warm', idle: '18m', idleMin: 18, tokens: 240000, window: 1000000, mine: 'opus' }
const COLD: CacheView = { mode: 'cold', idle: '2h 5m', idleMin: 125, tokens: 240000, window: 1000000, mine: 'opus' }
const SPEND = { main: 7.4, subs: 0.37 }
const WIDTH: Record<Kind, number> = { wide: 1300, stacked: 800, tight: 300 }
const KINDS = ['wide', 'stacked', 'tight'] as const

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

  test(`the cold ${kind} card adds what the next message costs on each model`, () => {
    const s = body(cardSvg(COLD, kind, WIDTH[kind], SPEND).source)
    expect(s).toContain('>SPEND<')
    expect(s).toContain('>NEXT MESSAGE COSTS<')
    for (const name of ['FABLE', 'OPUS', 'SONNET', 'HAIKU']) expect(s).toContain(`>${name}<`)
    expect(s).not.toContain('IDLE')
    expect(s).not.toContain('LIMIT')
  })

  test(`the ${kind} card is never shorter cold than warm`, () => {
    expect(cardSvg(COLD, kind, WIDTH[kind], SPEND).h).toBeGreaterThanOrEqual(cardSvg(WARM, kind, WIDTH[kind], SPEND).h)
  })
}

test('the card heights: no empty space', () => {
  const h = (v: CacheView, kind: Kind) => cardSvg(v, kind, WIDTH[kind], SPEND).h
  expect({ wide: h(WARM, 'wide'), stacked: h(WARM, 'stacked'), tight: h(WARM, 'tight') }).toEqual({ wide: 130, stacked: 184, tight: 228 })
  expect({ wide: h(COLD, 'wide'), stacked: h(COLD, 'stacked'), tight: h(COLD, 'tight') }).toEqual({ wide: 254, stacked: 308, tight: 342 })
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

test('the warm wide card has four columns, and the cold one adds the model costs beneath them', () => {
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
  for (const name of ['FABLE', 'OPUS', 'SONNET', 'HAIKU', 'NEXT MESSAGE COSTS', 'KEEP WARM', 'PACE VS RESET']) expect(cold).toContain(name)
  // The model costs sit beneath the columns, not beside them.
  expect(cold.indexOf('NEXT MESSAGE COSTS')).toBeGreaterThan(cold.indexOf('PACE VS RESET'))
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

test('while cold, the keep-warm caption says what re-caching costs now, not what going cold would', () => {
  const wide = body(cardSvg(COLD, 'wide', 1300, SPEND, [PACE_OK]).source)
  expect(wide).toContain('re-caching now costs <tspan')
  expect(wide).not.toContain('going cold')
  const stacked = body(cardSvg(COLD, 'stacked', 800, SPEND, [PACE_OK]).source)
  expect(stacked).toContain('re-cache now $')
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
    expect(bars[6]).toContain('height="18"')
    expect(bars[0]).toContain('height="2"')
    expect(bars[0]).toContain('fill="#4a463b"')
    expect(bars[4]).toContain('height="24"')
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
  expect(KINDS.map(k => cardSvg(COLD, k, WIDTH[k], more, [PACE_OK, PACE_LOW]).h)).toEqual([254, 308, 342])
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
