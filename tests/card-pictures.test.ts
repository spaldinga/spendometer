import { expect, test } from 'claude-code/testing'

import { DANGER, EMPTY, HUE, LC_BL, LC_LA, LC_PE, LC_TA, MUTED, OK, ORANGE, kitOf } from '../hooks/band/look'
import { sizeZone, stackOf } from '../hooks/capacity/context/card'
import { WARM, METRICS, NONE, body, plainText, colWOf, colXOf, cap, cost } from './card-kit'

// The Capacity tab's pictures (item 90): the stacked bar, the gauge of turns left and the file chips.

/** The Capacity card's height at 1400, 900, 600 and 400 px, as it was before the pictures: 3 and 2 columns have no status line, 1 has one. */
const PINNED: [number, number][] = [[1400, 218], [900, 218], [600, 249], [400, 249]]

/** The bar's parts, left to right: bars are the 16 px high rects. */
const barOf = (s: string) => [...s.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="16" fill="(#[0-9a-f]{6})"\/>/g)].map(m => ({ x: Number(m[1]), w: Number(m[2]), fill: m[3] }))
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.02)
/** The gauge's arcs: the track and, when something is filled, the fill. */
const arcsOf = (s: string) => [...s.matchAll(/<path d="M([\d.]+) [\d.]+A21 21 0 0 1 ([\d.]+) [\d.-]+" fill="none" stroke="(#[0-9a-f]{6})" stroke-width="5"/g)].map(m => ({ from: Number(m[1]), to: Number(m[2]), stroke: m[3] }))
const chipsOf = (s: string) => [...s.matchAll(/<rect [^>]*height="20" rx="10"[^>]*stroke="#ff6b1a"[^>]*\/><text [^>]*>([^<]*)<\/text>/g)].map(m => m[1])

test('the Capacity card is as tall as before the pictures, with or without the new data', () => {
  for (const [w, h] of PINNED) {
    expect(cap(w, METRICS).h).toBe(h)
    expect(cap(w, NONE).h).toBe(h)
    expect(cap(w, { ...METRICS, ctxFirst: null, rereadFiles: [] }).h).toBe(h)
    expect(cap(w, { ...METRICS, runway: null, growth: null }).h).toBe(h)
    expect(cap(w, null).h).toBe(h)
  }
})

// ---------- the stacked bar ----------
test('stackOf: setup, tool output clamped to what fits after it, chat the rest, free what is over', () => {
  const tools: [string, number][] = [['Bash', 18000], ['Read', 12000], ['Grep', 6000]]
  const s = stackOf(240000, 1000000, 18000, tools, 41000)
  expect([s.setup, s.chat, s.free]).toEqual([18000, 181000, 760000])
  // Each top tool keeps its tokens; the tools not in the top three are the other part.
  expect(s.tools).toEqual(tools)
  near(s.other, 5000)
  // Tool output over what fits: it is cut to the room after the setup, shared in proportion; chat is 0.
  const big = stackOf(240000, 1000000, 18000, tools, 500000)
  near(big.chat, 0)
  near(big.tools.reduce((a, [, c]) => a + c, big.other), 222000)
  near(big.tools[0][1], (222000 * 18000) / 500000)
  // No ctxFirst: no setup, everything not tool output is chat. Setup over the context is cut to it.
  expect(stackOf(240000, 1000000, null, [], 0)).toEqual({ setup: 0, chat: 240000, tools: [], other: 0, free: 760000 })
  // A context below the setup estimate (after a compaction) has no setup part: the estimate no longer holds.
  expect(stackOf(10000, 1000000, 18000, [], 0)).toEqual({ setup: 0, chat: 10000, tools: [], other: 0, free: 990000 })
  expect(stackOf(18000, 1000000, 18000, [], 0).setup).toBe(18000)
  // At or over the window there is no free part.
  expect(stackOf(1200000, 1000000, 18000, tools, 41000).free).toBe(0)
})

test('the bar is as wide as the column, each part a share of the window, in the colours of its legend', () => {
  const s = body(cap(1400, METRICS).source)
  const w = colWOf(1400, 2)
  const x = colXOf(1400, 2, 0)
  const bar = barOf(s.slice(s.indexOf('>CONVERSATION SIZE<'), s.indexOf('>TOOL OUTPUT<')))
  expect(bar.map(b => b.fill)).toEqual([MUTED, HUE.warm, LC_BL, LC_LA, LC_PE, LC_TA, EMPTY])
  // 18k setup, 181k chat, 18k + 12k + 6k tools, 5k other, 760k free, of 1M.
  const shares = [18000, 181000, 18000, 12000, 6000, 5000, 760000]
  bar.forEach((b, i) => near(b.w, (w * shares[i]) / 1e6))
  expect(bar[0].x).toBe(x)
  // The parts follow each other and end at the column's edge.
  bar.forEach((b, i) => i && near(b.x, bar[i - 1].x + bar[i - 1].w))
  near(bar[6].x + bar[6].w, x + w)
})

test('without ctxFirst there is no setup part and the chat starts at zero', () => {
  const s = body(cap(1400, { ...METRICS, ctxFirst: null }).source)
  const bar = barOf(s.slice(s.indexOf('>CONVERSATION SIZE<'), s.indexOf('>TOOL OUTPUT<')))
  expect(bar.map(b => b.fill)).toEqual([HUE.warm, LC_BL, LC_LA, LC_PE, LC_TA, EMPTY])
  expect(bar[0].x).toBe(colXOf(1400, 2, 0))
  // With no metrics at all the whole context is chat.
  expect(barOf(body(cap(1400, NONE).source)).map(b => b.fill)).toEqual([HUE.warm, EMPTY])
  const k = kitOf(1400, 'warm')
  const plain = barOf(sizeZone(k, 0, 0, 500, { tokens: 250000, window: 1000000, cold: false }))
  expect(plain.map(b => [b.fill, b.w])).toEqual([[HUE.warm, 125], [EMPTY, 375]])
})

test('tool output over what fits is clamped: no chat part, and the bar still ends at the window', () => {
  const s = body(cap(1400, { ...METRICS, toolTok: 500000 }).source)
  const bar = barOf(s.slice(s.indexOf('>CONVERSATION SIZE<'), s.indexOf('>TOOL OUTPUT<')))
  expect(bar.map(b => b.fill)).toEqual([MUTED, LC_BL, LC_LA, LC_PE, LC_TA, EMPTY])
  const last = bar[bar.length - 1]
  near(last.x + last.w, colXOf(1400, 2, 0) + colWOf(1400, 2))
})

test('a full context has no free part, and the parts still fit the column', () => {
  const s = body(cap(1400, METRICS, { ...WARM, tokens: 1200000 }).source)
  const bar = barOf(s.slice(s.indexOf('>CONVERSATION SIZE<'), s.indexOf('>TOOL OUTPUT<')))
  expect(bar.some(b => b.fill === EMPTY)).toBe(false)
  const last = bar[bar.length - 1]
  near(last.x + last.w, colXOf(1400, 2, 0) + colWOf(1400, 2))
})

test('the bar replaces the dots, warm or cold', () => {
  for (const v of [WARM, { ...WARM, mode: 'cold' as const }]) {
    const s = body(cap(1400, METRICS, v).source)
    expect(s.slice(s.indexOf('RE-CACHE') >= 0 ? s.indexOf('RE-CACHE') : s.indexOf('CONVERSATION SIZE'), s.indexOf('>TOOL OUTPUT<'))).not.toContain('<circle')
  }
})

// ---------- the gauge ----------
test('the gauge shows the turns left inside a half circle at the right of the figure, from 260 px of column up', () => {
  const s = body(cap(1400, METRICS).source)
  expect(s).toContain('>~40</text>')
  const [track, fill] = arcsOf(s)
  expect(track.stroke).toBe(EMPTY)
  // 40.4 turns fill the whole scale: the fill ends where the track does.
  expect(fill.stroke).toBe(OK)
  expect(fill.to).toBe(track.to)
  // At the column's right edge.
  expect(track.to).toBeLessThanOrEqual(colXOf(1400, 2, 0) + colWOf(1400, 2))
  expect(track.to).toBeGreaterThan(colXOf(1400, 2, 0) + colWOf(1400, 2) - 6)
  // Past the cap it is >99, escaped.
  expect(body(cap(1400, { ...METRICS, runway: 250 }).source)).toContain('>&gt;99</text>')
  // A narrow column has none (280 px: a column of 254); 286 px has one (260). The runway line stays.
  expect(arcsOf(body(cap(280, METRICS).source)).length).toBe(0)
  expect(body(cap(280, METRICS).source)).toContain('turns left')
  expect(arcsOf(body(cap(286, METRICS).source)).length).toBe(2)
  // Without a runway there is no gauge, and no runway line.
  for (const w of [1400, 400]) expect(arcsOf(body(cap(w, { ...METRICS, runway: null, growth: null }).source)).length).toBe(0)
  expect(arcsOf(body(cap(1400, NONE).source)).length).toBe(0)
  // Only the Capacity tab.
  expect(arcsOf(body(cost(1400, METRICS).source)).length).toBe(0)
})

test('the gauge fills to a share of 40 turns and is red at 5 or fewer, orange at 15 or fewer, green above', () => {
  const stroke = (turns: number) => arcsOf(body(cap(1400, { ...METRICS, runway: turns }).source))[1]?.stroke
  // The colour follows the rounded figure the gauge prints: 5.4 shows ~5 and is red, 5.6 shows ~6 and is orange.
  expect([stroke(1), stroke(5), stroke(5.4), stroke(5.6), stroke(15), stroke(15.4), stroke(15.6), stroke(16), stroke(60)]).toEqual([DANGER, DANGER, DANGER, ORANGE, ORANGE, ORANGE, OK, OK, OK])
  // No turns left: the track alone, with a 0 in it.
  const none = body(cap(1400, { ...METRICS, runway: 0 }).source)
  expect(arcsOf(none).length).toBe(1)
  expect(none).toContain('>~0</text>')
  // Half of the scale ends at the arc's top.
  const [track, half] = arcsOf(body(cap(1400, { ...METRICS, runway: 20 }).source))
  near(half.to, (track.from + track.to) / 2)
})

test('the gauge leaves room for the biggest realistic figure', () => {
  // 1.2M tokens: four 38 px digits and the unit, about 150 px; the gauge starts further right than that at the narrowest column that has one.
  const w = colWOf(286, 1)
  const [track] = arcsOf(body(cap(286, METRICS, { ...WARM, tokens: 1200000 }).source))
  expect(track.from - colXOf(286, 1, 0)).toBeGreaterThan(160)
  expect(w).toBe(260)
})

// ---------- the file chips ----------
test('a chip a re-read file, newest first, with the count', () => {
  const s = body(cap(1400, METRICS).source)
  expect(chipsOf(s)).toEqual(['card.ts ×2', 'record.ts ×1'])
  // Under the figure, above the caption, in the same column.
  const zone = s.slice(s.indexOf('>TOOL OUTPUT<'))
  expect(zone.indexOf('card.ts ×2')).toBeGreaterThan(zone.indexOf('>tokens<'))
  expect(zone.indexOf('card.ts ×2')).toBeLessThan(zone.indexOf('Bash 18k'))
  expect(chipsOf(body(cap(900, METRICS).source))).toEqual(['card.ts ×2', 'record.ts ×1'])
  // None to show: none drawn. A name with a character that needs escaping is escaped.
  expect(chipsOf(body(cap(1400, { ...METRICS, rereadFiles: [] }).source))).toEqual([])
  expect(chipsOf(body(cap(1400, { ...METRICS, rereadFiles: [['a&b.ts', 1]] }).source))).toEqual(['a&amp;b.ts ×1'])
  expect(chipsOf(body(cap(1400, NONE).source))).toEqual([])
})

test('chips that do not fit the column are dropped, not shortened', () => {
  const files: [string, number][] = [['averylongfilename.ts', 3], ['another-long-name.ts', 2], ['short.ts', 1]]
  const s = body(cap(682, { ...METRICS, rereadFiles: files }).source)
  const chips = chipsOf(s)
  // The column is 315 px: the first chip fits, a second one of the same size does not, and the chips after it are dropped too.
  expect(chips).toEqual(['averylongfilename.ts ×3'])
  expect(s).not.toContain('another-long')
  expect(s).not.toContain('short.ts')
  // Wide: all three.
  expect(chipsOf(body(cap(1400, { ...METRICS, rereadFiles: files }).source)).length).toBe(3)
  // Every chip stays inside the column.
  const x = colXOf(1400, 2, 1)
  const ends = [...body(cap(1400, { ...METRICS, rereadFiles: files }).source).matchAll(/<rect x="([\d.]+)" y="\d+" width="(\d+)" height="20"/g)].map(m => Number(m[1]) + Number(m[2]))
  expect(Math.max(...ends)).toBeLessThanOrEqual(x + colWOf(1400, 2))
})

test('the caption names each tool in its bar colour, and keeps the re-read count', () => {
  const s = body(cap(1400, METRICS).source)
  const zone = s.slice(s.indexOf('>TOOL OUTPUT<'))
  for (const [name, color] of [['Bash 18k', LC_BL], ['Read 12k', LC_LA], ['Grep 6k', LC_PE]]) expect(zone).toContain(`<tspan fill="${color}">${name}</tspan>`)
  expect(plainText(zone)).toContain('4 re-reads')
})

// ---------- the status line and the alt text ----------
test('on one column the tool output line names the most re-read file (ties: the most recent), where it fits', () => {
  // The newest file has the fewest re-reads: the line still names the one read most.
  expect(plainText(body(cap(600, { ...METRICS, rereadFiles: [['new.ts', 1], ['old.ts', 3], ['mid.ts', 3]] }).source))).toContain('(old.ts ×3)')
  expect(plainText(body(cap(600, METRICS).source))).toContain('tool output 41k tokens · 4 re-reads (card.ts ×2)')
  // Without files, or too narrow for the longer line, today's variants.
  expect(plainText(body(cap(600, { ...METRICS, rereadFiles: [] }).source))).not.toContain('card.ts')
  expect(plainText(body(cap(600, { ...METRICS, rereadFiles: [] }).source))).toContain('tool output 41k tokens · 4 re-reads')
  expect(plainText(body(cap(400, METRICS).source))).not.toContain('card.ts')
  // No re-reads at all: no file either.
  expect(plainText(body(cap(600, { ...METRICS, rereads: 0 }).source))).not.toContain('card.ts')
})

test('the alt text gives the context makeup, with the setup as an estimate, and the re-read files', () => {
  const alt = cap(1400, METRICS).alt
  expect(alt).toContain(' Context makeup: setup about 18k (an estimate from the first turn), chat about 181k, tool output about 41k.')
  expect(alt).toContain(' Re-read files: card.ts ×2, record.ts ×1.')
  // The clamped figures, as in the bar.
  expect(cap(1400, { ...METRICS, toolTok: 500000 }).alt).toContain(' Context makeup: setup about 18k (an estimate from the first turn), chat about 0, tool output about 222k.')
  // Unknown setup: no makeup sentence. No files: no files sentence.
  const none = cap(1400, { ...METRICS, ctxFirst: null, rereadFiles: [] }).alt
  expect(none).not.toContain('Context makeup')
  expect(none).not.toContain('Re-read files')
  expect(cap(1400, NONE).alt).not.toContain('Context makeup')
  expect(cap(1400, null).alt).not.toContain('Re-read files')
})
