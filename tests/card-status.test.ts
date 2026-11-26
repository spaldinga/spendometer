import { expect, test } from 'claude-code/testing'

import { MUTED } from '../hooks/band/look'
import { cardSvg } from '../hooks/band/card'
import { chipTip } from '../hooks/cost/cache/chip'
import { WARM, COLD, SPEND, WIDTHS, METRICS, ROW, body, plainText, PACE_OK, PACE_LOW, dotsOf, WITH_DAYS, TAB_IDS, ctx, cost } from './card-kit'
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
test('Overview: SPEND is a status line on one column, and a column from two', () => {
  const lines = (w: number) => plainText(body(cardSvg(WARM, w, SPEND, [PACE_OK]).source))
  // 300: the shortest variant fits the 260 px line.
  expect(dotsOf(cardSvg(WARM, 300, SPEND, [PACE_OK]).source)).toEqual([MUTED])
  expect(lines(300)).toContain('≈$7.77 this thread')
  expect(lines(300)).not.toContain('SPEND')
  // 600 is still one column, with room for the whole line.
  expect(lines(600)).toContain('≈$7.77 this thread · main $7.40 · subagents $0.37')
  // 800 and up: two columns, nothing below.
  for (const w of [800, 1100, 1400]) {
    expect(dotsOf(cardSvg(WARM, w, SPEND, [PACE_OK]).source)).toEqual([])
    expect(lines(w)).not.toContain('this thread · ')
  }
  // No status line says anything of keep warm or the cache size.
  for (const w of WIDTHS) {
    expect(lines(w)).not.toContain('keep warm')
    expect(lines(w)).not.toContain('in cache')
  }
})

test('Context: the size and the tool output at 300 (the tool output as a status line), 800 and up both columns', () => {
  const lines = (w: number) => plainText(body(ctx(w).source))
  expect(dotsOf(ctx(300).source)).toEqual([MUTED])
  expect(lines(300)).toContain('tool output 41k tokens')
  expect(lines(800)).not.toContain('tool output')
  expect(dotsOf(ctx(800).source)).toEqual([])
  expect(dotsOf(ctx(1400).source)).toEqual([])
})

test('the status lines are one rule below the columns, a dot and the text, 27 px apart', () => {
  // Cost on one column: the column, then two status lines.
  const s = body(cost(300).source)
  expect(s).toContain(`<rect x="13" y="${ROW}" width="274" height="1"`)
  const ys = [...s.matchAll(/<circle cx="17" cy="(\d+)" r="4"/g)].map(m => Number(m[1]))
  expect(ys.length).toBe(2)
  expect(ys[1] - ys[0]).toBe(27)
  // Each text is at x 27, the dot a little above its baseline.
  const texts = [...s.matchAll(/<text x="27" y="(\d+)" font-size="16"/g)].map(m => Number(m[1]))
  expect(texts).toEqual([ROW + 24, ROW + 24 + 27])
})

test('the cold status lines have no keep warm or re-cache line', () => {
  for (const tab of TAB_IDS) {
    const s = body(cardSvg(COLD, 300, SPEND, [PACE_OK], METRICS, tab).source)
    expect(plainText(s)).not.toContain('re-cache $')
    expect(s).not.toContain('keep warm')
  }
  expect(dotsOf(cardSvg(COLD, 300, SPEND, [PACE_OK]).source)).toEqual([MUTED])
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

test('the spend status line uses the today and week caption when days are known', () => {
  for (const w of [600, 300]) {
    const s = plainText(body(cardSvg(WARM, w, WITH_DAYS).source))
    expect(s).toContain(w === 600 ? '≈$7.77 this thread · today $3.00 · week $11.00' : '≈$7.77 this thread')
    expect(s).not.toContain('subagents $0.37')
  }
})

test('the heights do not change with daily figures or savings', () => {
  const more = { ...WITH_DAYS, saved: 1.5, pings: 0.12 }
  expect(WIDTHS.map(w => cardSvg(WARM, w, more, [PACE_OK, PACE_LOW]).h)).toEqual([249, 218, 218, 218])
  expect(WIDTHS.map(w => cardSvg(COLD, w, more, [PACE_OK, PACE_LOW]).h)).toEqual([249, 218, 218, 218])
})

test('the alt text names today and the week, and the savings when above zero', () => {
  const alt = cardSvg(WARM, 1400, { ...WITH_DAYS, saved: 1.5 }).alt
  expect(alt).toContain('Spend today $3.00, this week $11.00.')
  expect(alt).toContain('saved about $1.50')
  const plain = cardSvg(WARM, 1400, SPEND).alt
  expect(plain).not.toContain('today')
  expect(plain).not.toContain('saved')
})
