import { expect, test } from 'claude-code/testing'

import { MUTED } from '../hooks/band/look'
import { cardSvg } from '../hooks/band/card'
import type { Metrics } from '../hooks/band/card-metrics'
import { chipTip } from '../hooks/cost/cache/chip'
import { WARM, COLD, SPEND, WIDTHS, METRICS, ROW, body, plainText, PACE_OK, PACE_LOW, dotsOf, WITH_DAYS, TAB_IDS, cap, cost } from './card-kit'
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
test('Cost: SPEND is the column at every width; the other zones are status lines until they get a column', () => {
  const lines = (w: number) => plainText(body(cardSvg(WARM, w, SPEND, [PACE_OK]).source))
  // 300: SPEND, then four status lines; its words are the column's own.
  expect(dotsOf(cardSvg(WARM, 300, SPEND, [PACE_OK]).source)).toEqual([MUTED, MUTED, MUTED, MUTED])
  expect(lines(300)).toContain('SPEND')
  expect(lines(300)).toContain('≈$7.77')
  // One status line fewer for each column more: 800 two columns, 1100 three, 1400 four.
  expect([300, 800, 1100, 1400].map(w => dotsOf(cardSvg(WARM, w, SPEND, [PACE_OK]).source).length)).toEqual([4, 3, 2, 1])
  // 1200: the three columns of the design, and DELEGATION as a column rather than a line; 600: SPEND and four lines.
  expect(dotsOf(cardSvg(WARM, 1200, SPEND, [PACE_OK]).source).length).toBe(2)
  expect(dotsOf(cardSvg(WARM, 600, SPEND, [PACE_OK]).source).length).toBe(4)
  // No status line says anything of keep warm or the cache size.
  for (const w of WIDTHS) {
    expect(lines(w)).not.toContain('keep warm')
    expect(lines(w)).not.toContain('in cache')
  }
})

test('the delegation status line: the saving and the work against the time, shortened to fit; waiting words without data', () => {
  const at = (w: number, m: Metrics | null) => plainText(body(cardSvg(WARM, w, SPEND, [PACE_OK], m, 'cost').source))
  // 600: the long variant fits the 16 px line.
  expect(at(600, METRICS)).toContain('delegation ≈$3.10 saved · 12m of work in 5m')
  // 300: only the saving fits.
  expect(at(300, METRICS)).toContain('delegation ≈$3.10 saved')
  expect(at(300, METRICS)).not.toContain('12m of work')
  // The time is not recorded: the saving alone.
  expect(at(600, { ...METRICS, deleg: { ...METRICS.deleg!, workMs: 0, wallMs: 0 } })).toContain('delegation ≈$3.10 saved')
  expect(at(600, { ...METRICS, deleg: { ...METRICS.deleg!, workMs: 0, wallMs: 0 } })).not.toContain('of work')
  // No subagent yet, or no figures at all.
  expect(at(600, { ...METRICS, deleg: null })).toContain('delegation: when subagents run')
  expect(at(600, null)).toContain('delegation: after a few turns')
  // Once DELEGATION has a column there is no status line for it.
  expect(at(800, METRICS)).not.toContain('delegation ≈$3.10')
})

test('Capacity: the size and the tool output at 300 (the tool output as a status line), 800 and up both columns', () => {
  const lines = (w: number) => plainText(body(cap(w).source))
  expect(dotsOf(cap(300).source)).toEqual([MUTED])
  expect(lines(300)).toContain('tool output 41k tokens')
  expect(lines(800)).not.toContain('tool output')
  expect(dotsOf(cap(800).source)).toEqual([])
  expect(dotsOf(cap(1400).source)).toEqual([])
})

test('the status lines are one rule below the columns, a dot and the text, 27 px apart', () => {
  // Cost on one column: the column, then four status lines.
  const s = body(cost(300).source)
  expect(s).toContain(`<rect x="13" y="${ROW}" width="274" height="1"`)
  const ys = [...s.matchAll(/<circle cx="17" cy="(\d+)" r="4"/g)].map(m => Number(m[1]))
  expect(ys.length).toBe(4)
  expect(ys[1] - ys[0]).toBe(27)
  expect(ys[3] - ys[2]).toBe(27)
  // Each text is at x 27, the dot a little above its baseline.
  const texts = [...s.matchAll(/<text x="27" y="(\d+)" font-size="16"/g)].map(m => Number(m[1]))
  expect(texts).toEqual([0, 1, 2, 3].map(k => ROW + 24 + 27 * k))
})

test('the cold status lines have no keep warm or re-cache line', () => {
  for (const tab of TAB_IDS) {
    const s = body(cardSvg(COLD, 300, SPEND, [PACE_OK], METRICS, tab).source)
    expect(plainText(s)).not.toContain('re-cache $')
    expect(s).not.toContain('keep warm')
  }
  expect(dotsOf(cardSvg(COLD, 300, SPEND, [PACE_OK]).source)).toEqual([MUTED, MUTED, MUTED, MUTED])
})

test('the alt text keeps what the pings saved, and the card has no saved or pings line', () => {
  for (const tab of TAB_IDS)
    for (const w of WIDTHS) {
      const s = body(cardSvg(WARM, w, { ...SPEND, saved: 1.5, pings: 0.1 }, [PACE_OK], METRICS, tab).source)
      expect(s).not.toContain('saved $')
      expect(s).not.toContain('pings $')
    }
  expect(cardSvg(WARM, 1400, { ...SPEND, saved: 1.5 }).alt).toContain('Keep-warm pings have saved about $1.50.')
})

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

test('the spend column on a narrow card uses the today and week caption when days are known', () => {
  for (const w of [600, 300]) {
    const s = plainText(body(cardSvg(WARM, w, WITH_DAYS).source))
    expect(s).toContain('≈$7.77')
    expect(s).toContain('today $3.00 · week $11.00')
    expect(s).not.toContain('subagents $0.37')
  }
})

test('the Cost heights do not change with daily figures or savings', () => {
  const more = { ...WITH_DAYS, saved: 1.5, pings: 0.12 }
  expect(WIDTHS.map(w => cardSvg(WARM, w, more, [PACE_OK, PACE_LOW]).h)).toEqual([242, 215, 188, 161])
  expect(WIDTHS.map(w => cardSvg(COLD, w, more, [PACE_OK, PACE_LOW]).h)).toEqual([242, 215, 188, 161])
})

test('the alt text names today and the week, and the savings when above zero', () => {
  const alt = cardSvg(WARM, 1400, { ...WITH_DAYS, saved: 1.5 }).alt
  expect(alt).toContain('Spend today $3.00, this week $11.00.')
  expect(alt).toContain('saved about $1.50')
  const plain = cardSvg(WARM, 1400, SPEND).alt
  expect(plain).not.toContain('today')
  expect(plain).not.toContain('saved')
})
