import { expect, test } from 'claude-code/testing'

import { cardSvg } from '../hooks/cache-art'
import type { CacheView, Kind } from '../hooks/cache-art'

const NOW = Date.parse('2098-12-31T22:00:00Z')
const VIEW: CacheView = { mode: 'warm', idle: '18m', idleMin: 18, tokens: 200000, window: 1000000, mine: 'claude-opus-5-5' }
const WINDOWS = [
  { kind: 'seven_day', percentUsed: 75, resetsAt: '2099-01-03T00:00:00Z' },
  { kind: 'five_hour', percentUsed: 13, resetsAt: '2099-01-01T02:01:00Z' },
]
const WIDTH: Record<Kind, number> = { wide: 1300, stacked: 800, tight: 300 }

// Drawings put their words between tags; look after the font data in the style block.
const body = (s: string) => s.slice(s.indexOf('</style>'))

for (const kind of ['wide', 'stacked', 'tight'] as const) {
  test(`the ${kind} card names the limits first, before IDLE`, () => {
    const c = cardSvg(VIEW, kind, WIDTH[kind], WINDOWS, NOW)
    const s = body(c.source)
    const at = (x: string) => s.indexOf(x)
    expect(at('>7-DAY LIMIT<')).toBeGreaterThan(-1)
    expect(at('>5-HOUR LIMIT<')).toBeGreaterThan(at('>7-DAY LIMIT<'))
    expect(at('>IDLE<')).toBeGreaterThan(at('>5-HOUR LIMIT<'))
    expect(s).toContain('25%')
    expect(s).toContain('87%')
    expect(s).toContain('resets in 2d 2h')
    expect(s).toContain('resets in 4h 1m')
    expect(s).toContain('#ff6b1a')
    expect(s).toContain('#f5a623')
    expect(s).not.toContain('LOW')
  })
}

test('under 15% left the figure carries LOW', () => {
  const c = cardSvg(VIEW, 'wide', 1300, [{ kind: 'seven_day', percentUsed: 90 }], NOW)
  expect(body(c.source)).toContain('LOW')
  expect(body(c.source)).not.toContain('resets in')
})

test('with no windows there is no limits zone and the card is as tall as before', () => {
  for (const kind of ['wide', 'stacked', 'tight'] as const) {
    const none = cardSvg(VIEW, kind, WIDTH[kind])
    expect(body(none.source)).not.toContain('LIMIT')
    expect(none.alt.startsWith('Cache warm')).toBe(true)
    expect(none.h).toBe({ wide: 138, stacked: 272, tight: 302 }[kind])
    const some = cardSvg(VIEW, kind, WIDTH[kind], WINDOWS, NOW)
    expect(some.h).toBeGreaterThan(none.h)
  }
})

test('the alt starts with the limits', () => {
  const c = cardSvg(VIEW, 'wide', 1300, WINDOWS, NOW)
  expect(c.alt.startsWith('7-day limit 25% left, resets in 2d 2h. 5-hour limit 87% left, resets in 4h 1m. Cache warm')).toBe(true)
})

test('any other window is named by its kind', () => {
  const c = cardSvg(VIEW, 'stacked', 800, [{ kind: 'spend_limit', percentUsed: 40 }], NOW)
  expect(body(c.source)).toContain('>SPEND LIMIT<')
  expect(body(c.source)).toContain('#e8e2d2')
})
