import { expect, mock, test } from 'claude-code/testing'

import { DANGER, EMPTY, HUE, MUTED, OK, ORANGE, kitOf } from '../hooks/band/look'
import { metricsOf } from '../hooks/band/card-metrics'
import { discountZone } from '../hooks/cost/cache/card'
import { avgZone } from '../hooks/cost/spend/card'
import { RECENT_KEEP, recordOf } from '../hooks/cost/spend/record'
import type { Spent } from '../types'
import { METRICS, NONE, body, colXOf, cost, plainText } from './card-kit'
import { FRESH, NOW, USED, done, engine, seed } from './keepwarm-kit'

// The Cost tab's pictures (item 100): a bar per message, and the split bar with warm against cold under CACHE DISCOUNT.

/** The Cost card's height at 300, 800, 1100 and 1400 px, as it was before the pictures. */
const PINNED: [number, number][] = [[300, 242], [800, 215], [1100, 188], [1400, 161]]

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.02)
/** PER MESSAGE's bars: rx 1 rects at or right of minX. */
const barsOf = (s: string, minX = 0) =>
  [...s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="1" fill="(#[0-9a-f]{6})"\/>/g)]
    .map(m => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]), fill: m[5] }))
    .filter(b => b.x >= minX)
/** Rects 6 px high at the given y (the split bar is at 78, the compare rows at 40 and 56), at or right of minX. */
const rectsAt = (s: string, y: number, minX = 0) =>
  [...s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="6" rx="3" fill="(#[0-9a-f]{6})"\/>/g)]
    .filter(m => Number(m[2]) === y && Number(m[1]) >= minX)
    .map(m => ({ x: Number(m[1]), w: Number(m[3]), fill: m[4] }))

const k = kitOf(1400, 'warm')
const avg = (recent: number[], a = 0.38) => avgZone(k, 0, 0, 324, { avg: a, last: recent[recent.length - 1] ?? null, multiple: null, recent })
const disc = (hit: number, kw: { warm: number; cold: number } | null, w = 340) => discountZone(k, 0, 0, w, { hit, perM: 0.62 }, kw)

test('the Cost card is as tall as before the pictures, with or without the new data', () => {
  for (const [w, h] of PINNED) {
    expect(cost(w, METRICS).h).toBe(h)
    expect(cost(w, NONE).h).toBe(h)
    expect(cost(w, { ...METRICS, recent: [] }).h).toBe(h)
    expect(cost(w, null).h).toBe(h)
  }
})

// ---------- PER MESSAGE: a bar per message ----------
test('a bar per recent message, oldest left, on a baseline 90 down, the dearest 20 px tall', () => {
  const bars = barsOf(avg([0.1, 0.2, 0.4, 0.2]))
  expect(bars.length).toBe(4)
  expect(bars.map(b => b.y + b.h)).toEqual([90, 90, 90, 90])
  // Scaled to the largest: 20 px for 0.4, half of it for 0.2, and 0.1 a quarter (5).
  expect(bars.map(b => b.h)).toEqual([5, 10, 20, 10])
  // 12 px wide, 4 px apart, from the column's left edge.
  expect(bars.map(b => [b.x, b.w])).toEqual([[0, 12], [16, 12], [32, 12], [48, 12]])
})

test('a bar is at least 3 px for a cost above 0, a cost of 0 is a 2 px stub in the empty colour', () => {
  const bars = barsOf(avg([0.001, 0, 2]))
  expect(bars.map(b => b.h)).toEqual([3, 2, 20])
  expect(bars[1].fill).toBe(EMPTY)
})

test('the bars narrow to fit ten in a narrow column', () => {
  const bars = barsOf(avgZone(k, 0, 0, 100, { avg: 0.38, last: 0.2, multiple: null, recent: Array(10).fill(0.2) }))
  // floor((100 - 36) / 10) = 6
  expect(bars[0].w).toBe(6)
  expect(bars[9].x + bars[9].w).toBeLessThan(100.01)
})

test('an outlier is red, the last bar orange, the rest muted; an outlier that is last is red', () => {
  expect(barsOf(avg([0.2, 0.3, 2, 0.25, 0.3])).map(b => b.fill)).toEqual([MUTED, MUTED, DANGER, MUTED, ORANGE])
  expect(barsOf(avg([0.2, 0.3, 0.25, 0.3, 2])).map(b => b.fill)).toEqual([MUTED, MUTED, MUTED, MUTED, DANGER])
  // Under 3 messages nothing is an outlier.
  expect(barsOf(avg([0.1, 2])).map(b => b.fill)).toEqual([MUTED, ORANGE])
})

test('the card draws the bars from the metrics, and none when recent is empty', () => {
  const x = colXOf(1400, 4, 3)
  const s = body(cost(1400, METRICS).source)
  const bars = barsOf(s, x)
  expect(bars.length).toBe(10)
  expect(bars.map(b => b.fill)).toEqual([...Array(9).fill(MUTED), DANGER])
  expect(bars[9].h).toBe(20)
  expect(bars[0].x).toBe(x)
  const none = body(cost(1400, { ...METRICS, recent: [] }).source)
  expect(barsOf(none, x).length).toBe(0)
  // The figure and the caption are as before.
  for (const t of [s, none]) {
    expect(plainText(t)).toContain('$0.38avg')
    expect(t).toContain('last $2.11')
    expect(t).toContain('6× avg')
  }
})

test('the status line form of PER MESSAGE stays text', () => {
  const s = body(cost(800, METRICS).source)
  expect(plainText(s)).toContain('per message $0.38 avg')
  expect(barsOf(s).length).toBe(0)
})

// ---------- CACHE DISCOUNT: split bar, warm against cold ----------
test('the split bar is as wide as the column, the cached share green and the rest muted, 2 px apart', () => {
  const [a, b] = rectsAt(disc(0.963, null), 78)
  expect([a.fill, b.fill]).toEqual([OK, MUTED])
  near(a.w, 0.963 * 338)
  near(b.x, a.w + 2)
  near(b.x + b.w, 340)
})

test('a part above 0 is at least 3 px; a share of 0 or 100% is one full-width bar', () => {
  const [a, b] = rectsAt(disc(0.001, null), 78)
  expect(a.w).toBe(3)
  near(b.x + b.w, 340)
  const [c, d] = rectsAt(disc(0.999, null), 78)
  expect(d.w).toBe(3)
  near(c.x + c.w + 2, d.x)
  expect(rectsAt(disc(0, null), 78)).toEqual([{ x: 0, w: 340, fill: MUTED }])
  expect(rectsAt(disc(1, null), 78)).toEqual([{ x: 0, w: 340, fill: OK }])
})

test('warm against cold: two rows right of the figure, each filled against the larger', () => {
  const s = disc(0.963, { warm: 1, cold: 4 })
  const warm = rectsAt(s, 40)
  const cold = rectsAt(s, 56)
  // Track then fill; the cold row is full, the warm row a quarter.
  expect(warm.map(r => r.fill)).toEqual([EMPTY, HUE.warm])
  expect(cold.map(r => r.fill)).toEqual([EMPTY, HUE.cold])
  expect(cold[1].w).toBe(cold[0].w)
  near(warm[1].w, Math.round(warm[0].w / 4))
  expect(plainText(s)).toContain('warm')
  expect(plainText(s)).toContain('cold')
  // The caption is as before.
  expect(plainText(s)).toContain('$0.62 per 1M tokens')
})

test('no warm and cold rows without keep-warm figures, nor without room', () => {
  const s = disc(0.963, null)
  expect(rectsAt(s, 40).length + rectsAt(s, 56).length).toBe(0)
  expect(plainText(s)).not.toContain('warm')
  // The rows start at half the column; a track under 30 px is not drawn.
  expect(rectsAt(disc(0.963, { warm: 1, cold: 4 }, 120), 40).length).toBe(0)
})

test('the dash state of CACHE DISCOUNT is unchanged', () => {
  const s = discountZone(k, 0, 0, 340, { hit: null, perM: null }, { warm: 1, cold: 4 })
  expect(rectsAt(s, 78).length + rectsAt(s, 40).length).toBe(0)
  expect(plainText(s)).toContain('after a few turns')
})

test('the card passes keep-warm cost to the zone: both rows in the discount column', () => {
  const x = colXOf(1100, 3, 2)
  const s = body(cost(1100, METRICS).source)
  expect(rectsAt(s, 40, x).map(r => r.fill)).toEqual([EMPTY, HUE.warm])
  expect(rectsAt(s, 56, x).map(r => r.fill)).toEqual([EMPTY, HUE.cold])
  // Going cold costs more than an hour of pings, so the cold row is the full one.
  const [, w1] = rectsAt(s, 40, x)
  const [t2, w2] = rectsAt(s, 56, x)
  expect(w2.w).toBe(t2.w)
  expect(w1.w).toBeLessThan(w2.w)
  expect(rectsAt(s, 78, x).map(r => r.fill)).toEqual([OK, MUTED])
})

test('the status line of CACHE DISCOUNT leads with warm and cold, and falls back to the old lines', () => {
  expect(plainText(body(cost(800, METRICS).source))).toContain('cache discount 96% · $0.62 per 1M tokens · warm $0.06/h, cold $')
  const tight = plainText(body(cost(300, METRICS).source))
  expect(tight).toContain('cache discount 96%')
  expect(tight).not.toContain('warm $')
})

// ---------- the alt text ----------
test('the alt text lists the last messages when there are some', () => {
  expect(cost(1400, METRICS).alt).toContain('Last 10 messages: $0.20, $0.31, $0.25, $0.40, $0.22, $0.35, $0.28, $0.30, $0.14, $2.11.')
  expect(cost(1400, { ...METRICS, recent: [] }).alt).not.toContain('Last ')
})

// ---------- the record ----------
test('metricsOf carries recent, empty when the record has none', () => {
  const s: Spent = { main: 1, subs: 0, last: 0.5, at: 0, recent: [0.1, 0.5] }
  expect(metricsOf(s, 100)!.recent).toEqual([0.1, 0.5])
  expect(metricsOf({ ...s, recent: undefined }, 100)!.recent).toEqual([])
})

test('recordOf copies recent rather than sharing it', () => {
  const was: Spent = { main: 1, subs: 0, last: 0.5, at: 0, recent: [0.1, 0.5] }
  const next = recordOf(was, 5)
  expect(next.recent).toEqual([0.1, 0.5])
  next.recent!.push(9)
  expect(was.recent).toEqual([0.1, 0.5])
  expect(recordOf(null, 5).recent).toBeUndefined()
})

test('readSpend keeps the last 10 finite non-negative numbers of recent', async ($, on) => {
  mock.clock(on, { now: NOW })
  const bad = [1, 'x', -2, NaN, null, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  const { store } = engine(on, { keep: true, prefill: { 'spend:S1': { ...FRESH(2, 1, 0.5), recent: bad } } })
  await seed($, 18)
  await done($, { usage: USED, agentId: 'sub1' })
  const r = store.get('spend:S1') as Spent
  expect(r.recent).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  expect(r.recent!.length).toBe(RECENT_KEEP)
  store.set('spend:S1', { ...FRESH(2, 1, 0.5), recent: 'nope' })
  await done($, { usage: USED, agentId: 'sub1' })
  expect((store.get('spend:S1') as Spent).recent).toBeUndefined()
})

test('a main turn appends its cost to recent, keeping the last 10; a subagent turn does not', async ($, on) => {
  mock.clock(on, { now: NOW })
  const { store } = engine(on, { keep: true, prefill: { 'spend:S1': { ...FRESH(2, 1, 0.5), recent: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } } })
  await seed($, 18)
  await done($, { usage: USED })
  const m = store.get('spend:S1') as Spent
  expect(m.recent!.length).toBe(10)
  expect(m.recent![9]).toBe(m.last)
  expect(m.recent![0]).toBe(2)
  await done($, { usage: USED, agentId: 'sub1' })
  expect((store.get('spend:S1') as Spent).recent).toEqual(m.recent)
  // A record with none starts the list.
  store.set('spend:S1', FRESH(2, 1, 0.5))
  await done($, { usage: USED })
  expect((store.get('spend:S1') as Spent).recent!.length).toBe(1)
})

test('the bars flag an outlier by the conversation\'s turn count, as the caption does, not by the bars shown', () => {
  const two = (turns?: number) => barsOf(avgZone(k, 0, 0, 324, { avg: 0.38, last: 2.11, multiple: 6, turns, recent: [0.3, 2.11] })).map(b => b.fill)
  // An older conversation has 2 bars but 20 turns: the last is red, like the caption's "6× avg".
  expect(two(20)).toEqual([MUTED, DANGER])
  // A conversation of 2 turns is too short for an outlier.
  expect(two(2)).toEqual([MUTED, ORANGE])
})
