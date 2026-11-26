import { expect, test } from 'claude-code/testing'

import { DANGER, EMPTY, FABLE, OK } from '../hooks/band/look'
import { MODELS } from '../hooks/cost/prices'
import { cardSvg } from '../hooks/band/card'
import { cheaperModels, fmtBreakEven, keepWarmCost } from '../hooks/cost/cache/chip'
import type { PaceRow } from '../hooks/capacity/usage/art'
import type { Metrics } from '../hooks/band/card-metrics'
import { WARM, COLD, SPEND, WIDTHS, METRICS, YC, ROW, colXOf, body, plainText, PACE_OK, PACE_LOW, PACE_NONE, dotsOf, TAB_IDS, cap, titleAt } from './card-kit'
test('the warm Cost tab has the conversation\'s cost and Capacity the size at every width, and nothing the row already shows', () => {
  for (const w of WIDTHS) {
    expect(plainText(body(cardSvg(WARM, w, SPEND).source))).toContain('≈$7.77')
    expect(plainText(body(cap(w).source))).toContain('760k free')
    for (const tab of TAB_IDS) {
      const s = body(cardSvg(WARM, w, SPEND, [], null, tab).source)
      for (const gone of ['IDLE', 'LIMIT', '>WARM<', 'NEXT MESSAGE', 'HAIKU', 'OPUS', 'last reply']) expect(s).not.toContain(gone)
    }
  }
  const s = body(cardSvg(WARM, 1400, SPEND).source)
  expect(s).toContain('>SPEND<')
  expect(s).toContain('main $7.40 · subagents $0.37')
  expect(body(cap(1400).source)).toContain('24% of the 1M context · 760k free')
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

test('the Cost heights: the 124 px row and the status lines of the zones with no column, with or without figures', () => {
  // 6 px gap + 124 row, then 27 k + 4 for k status lines: five zones, so 4, 3, 2, 1 lines at one to four columns.
  const at = (w: number, v = WARM, m: Metrics | null = null) => cardSvg(v, w, SPEND, [PACE_OK, PACE_LOW], m, 'cost').h
  const want = [6 + ROW + 112, 6 + ROW + 85, 6 + ROW + 58, 6 + ROW + 31]
  expect(want).toEqual([242, 215, 188, 161])
  expect(WIDTHS.map(w => at(w))).toEqual(want)
  expect(WIDTHS.map(w => at(w, COLD))).toEqual(want)
  expect(WIDTHS.map(w => at(w, WARM, METRICS))).toEqual(want)
})

test('the Capacity heights: the pace strip, the 124 px row and the status line, with or without figures', () => {
  // 6 px gap + 88 strip + 124 row, then 27 + 4 for the one status line on one column.
  const at = (w: number, v = WARM, m: Metrics | null = null) => cardSvg(v, w, SPEND, [PACE_OK, PACE_LOW], m, 'capacity').h
  expect(WIDTHS.map(w => at(w))).toEqual([249, 218, 218, 218])
  expect(WIDTHS.map(w => at(w, COLD))).toEqual([249, 218, 218, 218])
  expect(WIDTHS.map(w => at(w, WARM, METRICS))).toEqual([249, 218, 218, 218])
  expect(6 + YC + ROW + 27 + 4).toBe(249)
  expect(6 + YC + ROW).toBe(218)
})

test('the free context is spelled out in the caption and in the alt text', () => {
  expect(body(cap(1400).source)).toContain('760k free')
  const c = cardSvg(WARM, 1400, SPEND)
  expect(c.alt.startsWith('Tab: Cost. Cache warm')).toBe(true)
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

// ---------- the columns ----------
test('Cost: SPEND, DELEGATION, CACHE DISCOUNT, PER MESSAGE and BY MODEL in this order, as many columns as fit, evenly spaced', () => {
  const titles = ['SPEND', 'DELEGATION', 'CACHE DISCOUNT', 'PER MESSAGE', 'BY MODEL']
  for (const [k, w] of [300, 800, 1100, 1400].entries()) {
    const n = k + 1
    const c = cardSvg(WARM, w, SPEND, [PACE_OK], METRICS, 'cost')
    const s = body(c.source)
    titles.forEach((title, i) => {
      if (i < n) expect(titleAt(s, title, 24)).toBe(colXOf(w, n, i))
      else expect(new RegExp(`>${title}<`).test(s)).toBe(false)
    })
    expect(c.cols).toBe(n)
    // The vlines between the columns, one fewer than the columns.
    expect(s.split(`y="18" width="1" height="88"`).length - 1).toBe(n - 1)
  }
  // 1200 px: three columns (SPEND, DELEGATION, CACHE DISCOUNT) and two status lines; 600 px: SPEND and four status lines.
  const wide = cardSvg(WARM, 1200, SPEND, [PACE_OK], METRICS, 'cost')
  expect(wide.cols).toBe(3)
  expect(dotsOf(wide.source).length).toBe(2)
  const narrow = cardSvg(WARM, 600, SPEND, [PACE_OK], METRICS, 'cost')
  expect(narrow.cols).toBe(1)
  expect(dotsOf(narrow.source).length).toBe(4)
  expect(plainText(body(narrow.source))).toContain('delegation ≈$3.10 saved · 12m of work in 5m')
})

test('Cost has no pace strip and no Capacity zone; Capacity has no Cost zone', () => {
  for (const w of WIDTHS) {
    const c = body(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS, 'cost').source)
    for (const gone of ['PACE VS RESET', 'CONVERSATION SIZE', 'TOOL OUTPUT']) expect(c).not.toContain(gone)
    const k = body(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS, 'capacity').source)
    for (const gone of ['>SPEND<', 'DELEGATION', 'CACHE DISCOUNT', 'PER MESSAGE', 'BY MODEL']) expect(k).not.toContain(gone)
    expect(k).toContain('>PACE VS RESET<')
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

test('the cold Capacity tab turns CONVERSATION SIZE into RE-CACHE and keeps its dot grid', () => {
  const warm = body(cap(1400).source)
  // 25 dots a row, two rows.
  const size = warm.slice(warm.indexOf('>CONVERSATION SIZE<'), warm.indexOf('>TOOL OUTPUT<'))
  expect(size.split('<circle').length - 1).toBe(50)
  const cold = body(cap(1400, METRICS, COLD).source)
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

