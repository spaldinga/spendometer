import { expect, test } from 'claude-code/testing'

import { DANGER, cardSvg, fmtBreakEven, keepWarmCost } from '../hooks/cache-art'
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
    expect(s).toContain('>THIS CONVERSATION<')
    expect(s).toContain('≈$7.77')
    expect(s).toContain('main $7.40 · subagents $0.37')
    expect(s).toContain('24% of the 1M context · 760k free')
    for (const gone of ['IDLE', 'LIMIT', '>WARM<', 'NEXT MESSAGE', 'HAIKU', 'OPUS', 'last reply']) expect(s).not.toContain(gone)
  })

  test(`the cold ${kind} card adds what the next message costs on each model`, () => {
    const s = body(cardSvg(COLD, kind, WIDTH[kind], SPEND).source)
    expect(s).toContain('>THIS CONVERSATION<')
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
  const dots = s.slice(s.indexOf('>THIS CONVERSATION<'))
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
  for (const z of ['>IN CACHE<', '>THIS CONVERSATION<', '>KEEP WARM<', '>PACE VS RESET<']) expect(warm).toContain(z)
  expect(warm).toContain('$0.06')
  expect(warm).toContain('going cold costs $1.92')
  // At today's prices the break-even is over a day, so the card leaves the line out.
  expect(warm).not.toContain('warm is cheaper')
  expect(warm).toContain('bar: time left at this pace · line: reset')
  expect(warm).not.toContain('NEXT MESSAGE')
  // IN CACHE keeps its dot grid: 25 dots a row, two rows.
  const inCache = warm.slice(warm.indexOf('>IN CACHE<'), warm.indexOf('>THIS CONVERSATION<'))
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
  expect(s).toContain('~2h 40m at this pace')
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
  expect(wide).toContain('re-caching now costs $')
  expect(wide).not.toContain('going cold')
  const stacked = body(cardSvg(COLD, 'stacked', 800, SPEND, [PACE_OK]).source)
  expect(stacked).toContain('re-cache now $')
})
