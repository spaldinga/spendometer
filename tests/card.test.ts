import { expect, test } from 'claude-code/testing'

import { cardSvg } from '../hooks/cache-art'
import type { CacheView, Kind } from '../hooks/cache-art'

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
    for (const gone of ['IDLE', 'LIMIT', 'WARM', 'NEXT MESSAGE', 'HAIKU', 'OPUS', 'last reply']) expect(s).not.toContain(gone)
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

test('the card heights: no empty space, and clearly shorter than the old card', () => {
  const h = (v: CacheView, kind: Kind) => cardSvg(v, kind, WIDTH[kind], SPEND).h
  expect({ wide: h(WARM, 'wide'), stacked: h(WARM, 'stacked'), tight: h(WARM, 'tight') }).toEqual({ wide: 130, stacked: 130, tight: 182 })
  expect({ wide: h(COLD, 'wide'), stacked: h(COLD, 'stacked'), tight: h(COLD, 'tight') }).toEqual({ wide: 130, stacked: 254, tight: 296 })
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
