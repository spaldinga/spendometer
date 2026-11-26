import { expect, test } from 'claude-code/testing'

import { DANGER, FABLE, HUE, ORANGE, YELLOW } from '../hooks/band/look'
import { TABS, TAB_NAMES, cardSvg, tabFrom } from '../hooks/band/card'
import type { Metrics } from '../hooks/band/card-metrics'
import { WARM, COLD, SPEND, WIDTHS, METRICS, ROW, colWOf, colXOf, body, plainText, PACE_OK, PACE_LOW, TAB_IDS, cap, cost, after, titleOf, NONE, byModel } from './card-kit'
test('the tabs are the domains: Cost then Capacity, Cost the default', () => {
  expect(TABS).toEqual(['cost', 'capacity'])
  expect(TAB_NAMES).toEqual({ cost: 'Cost', capacity: 'Capacity' })
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS).source).toBe(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS, 'cost').source)
})

test('old tab names map to the new ones; an unknown one maps to nothing', () => {
  expect([tabFrom('overview'), tabFrom('context'), tabFrom('cost'), tabFrom('capacity')]).toEqual(['cost', 'capacity', 'cost', 'capacity'])
  expect([tabFrom('nonsense'), tabFrom(undefined), tabFrom(null), tabFrom(3)]).toEqual([null, null, null, null])
})

test('Cost has SPEND, DELEGATION, CACHE DISCOUNT, PER MESSAGE and BY MODEL, no pace strip and nothing of Capacity', () => {
  // Wide enough for every zone: the columns that fit, the rest as status lines.
  const s = plainText(body(cost(1400).source))
  for (const z of ['SPEND', 'DELEGATION', 'CACHE DISCOUNT', 'PER MESSAGE']) expect(s).toContain(z)
  expect(s).toContain('by model Opus')
  for (const w of WIDTHS) {
    const c = body(cost(w).source)
    for (const gone of ['PACE VS RESET', 'TOOL OUTPUT', 'CONVERSATION SIZE', 'CACHE HIT', 'PER TURN']) expect(c).not.toContain(gone)
  }
})

test('Capacity has the pace strip, CONVERSATION SIZE (RE-CACHE once cold) and TOOL OUTPUT, and nothing of Cost', () => {
  for (const w of WIDTHS) {
    const s = body(cap(w).source)
    for (const z of ['>PACE VS RESET<', '>CONVERSATION SIZE<']) expect(s).toContain(z)
    for (const gone of ['DELEGATION', 'SPEND<', 'CACHE DISCOUNT', 'PER MESSAGE', 'BY MODEL', 'IN CACHE']) expect(s).not.toContain(gone)
    const c = body(cap(w, METRICS, COLD).source)
    expect(c).toContain('>RE-CACHE<')
    expect(c).not.toContain('CONVERSATION SIZE')
  }
  for (const w of WIDTHS.slice(1)) expect(body(cap(w).source)).toContain('>TOOL OUTPUT<')
})

test('there is no metric row on any tab', () => {
  for (const tab of TAB_IDS)
    for (const w of WIDTHS) {
      const s = body(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS, tab).source)
      for (const gone of ['CACHE HIT', 'PER TURN']) expect(s).not.toContain(gone)
    }
})

test('Cost under four columns: the zones with no column are status lines, in the zones\' order', () => {
  const lines = (w: number) => plainText(body(cost(w).source))
  // 1100: three columns, PER MESSAGE and BY MODEL below.
  expect(lines(1100)).toContain('CACHE DISCOUNT')
  expect(lines(1100)).not.toContain('PER MESSAGE')
  expect(lines(1100)).toContain('per message $0.38 avg · last $2.11 · 6× avg')
  expect(lines(1100)).toContain('by model Opus $14.20 · Sonnet $5.10 · Haiku $1.09')
  // 800: two columns, DISCOUNT too goes below.
  expect(lines(800)).not.toContain('CACHE DISCOUNT')
  expect(lines(800)).toContain('cache discount 96% · $0.62 per 1M tokens')
  // 300: SPEND alone.
  const one = lines(300)
  expect(one).not.toContain('DELEGATION')
  for (const l of ['delegation ≈$3.10 saved', 'cache discount 96%', 'per message $0.38 avg', 'by model Opus']) expect(one).toContain(l)
  // The status lines come in the zones' order.
  const at = (s: string, x: string) => s.indexOf(x)
  expect([at(one, 'delegation'), at(one, 'cache discount'), at(one, 'per message'), at(one, 'by model')]).toEqual([...[at(one, 'delegation'), at(one, 'cache discount'), at(one, 'per message'), at(one, 'by model')]].sort((a, b) => a - b))
})

test('the Cost tab is as tall as its status lines, the Capacity tab as the strip and the row; neither depends on the data', () => {
  const at = (tab: 'cost' | 'capacity', w: number, m: Metrics | null = METRICS) => cardSvg(WARM, w, SPEND, [PACE_OK, PACE_LOW], m, tab).h
  // 6 px gap, the 124 px row, 27 k + 4 for k status lines; Capacity has the 88 px pace strip too.
  expect(WIDTHS.map(w => at('cost', w))).toEqual([6 + ROW + 112, 6 + ROW + 85, 6 + ROW + 58, 6 + ROW + 31])
  expect(WIDTHS.map(w => at('capacity', w))).toEqual([6 + 88 + ROW + 31, 6 + 88 + ROW, 6 + 88 + ROW, 6 + 88 + ROW])
  for (const tab of TAB_IDS) {
    expect(WIDTHS.map(w => at(tab, w, NONE))).toEqual(WIDTHS.map(w => at(tab, w)))
    expect(WIDTHS.map(w => at(tab, w, null))).toEqual(WIDTHS.map(w => at(tab, w)))
  }
})

test('the figures and captions on Cost', () => {
  const s = body(cost(1400).source)
  expect(s).toContain('<tspan font-size="38">96%</tspan>')
  // The effective price is the cache discount's caption.
  expect(s).toContain('>$0.62 per 1M tokens<')
  expect(s).not.toContain('of input read from cache')
  expect(s).toContain('<tspan font-size="38">$0.38</tspan><tspan font-size="15" font-weight="500" fill="#8d8775" dx="7">avg</tspan>')
  expect(s).toContain(`last $2.11<tspan fill="${DANGER}" font-weight="700"> · 6× avg</tspan>`)
  // The context runway and the per-type subagent figures are not on this tab.
  for (const gone of ['CONTEXT RUNWAY', 'SUBAGENTS', 'tokens a turn', 'Explore', 'turns left']) expect(s).not.toContain(gone)
})

test('without a known price the cache discount keeps its old caption', () => {
  const s = body(cost(1400, { ...METRICS, perM: null }).source)
  expect(s).toContain('>of input read from cache<')
  expect(s).not.toContain('per 1M tokens')
})

test("by model: the biggest share as the figure in its colour, a split bar in the models' colours, each cost in the caption", () => {
  const s = byModel(1100, METRICS.models)
  // 14.20 of 20.39 is 70%.
  expect(s).toContain(`<tspan font-size="38">Opus</tspan><tspan font-size="38" fill="${HUE.warm}" dx="10">70%</tspan>`)
  // The split bar: 6 px tall, 2 px gaps, one colour per model, as wide as the column and in the cost order.
  const bars = [...s.matchAll(/<rect x="([\d.]+)" y="\d+" width="([\d.]+)" height="6" rx="3" fill="(#\w+)"/g)].map(m => ({ x: Number(m[1]), w: Number(m[2]), fill: m[3] })).slice(0, 3)
  expect(bars.map(b => b.fill)).toEqual([HUE.warm, ORANGE, YELLOW])
  const x0 = colXOf(1100, 3, 2)
  const cw = colWOf(1100, 3)
  expect(bars[0].x).toBe(x0)
  expect(Math.abs(bars[1].x - (bars[0].x + bars[0].w + 2))).toBeLessThan(0.02)
  expect(Math.abs(bars[2].x - (bars[1].x + bars[1].w + 2))).toBeLessThan(0.02)
  expect(Math.abs(bars[2].x + bars[2].w - (x0 + cw))).toBeLessThan(0.05)
  expect(bars[0].w).toBeGreaterThan(bars[1].w)
  expect(bars[1].w).toBeGreaterThan(bars[2].w)
  // The caption: the first entry is the figure's model, so its name is left out; each ■ in its model's colour.
  // The third entry goes while it does not fit the column, and is there on a wider card.
  expect(plainText(s)).toContain('■ $14.20 · ■ Sonnet $5.10')
  expect(plainText(s)).not.toContain('Haiku $1.09')
  const wideCard = byModel(1400, METRICS.models)
  expect(plainText(wideCard)).toContain('■ $14.20 · ■ Sonnet $5.10 · ■ Haiku $1.09')
  expect(wideCard).toContain(`<tspan fill="${HUE.warm}">■</tspan> $14.20 · <tspan fill="${ORANGE}">■</tspan> Sonnet $5.10 · <tspan fill="${YELLOW}">■</tspan> Haiku $1.09`)
})

test('by model: entries that do not fit are cut from the back, one model fills the whole bar, Fable has its own colour', () => {
  const four = byModel(1100, [['fable', 12], ['opus', 3], ['sonnet', 2], ['haiku', 1]])
  expect(four).toContain(`<tspan font-size="38">Fable</tspan><tspan font-size="38" fill="${FABLE}" dx="10">67%</tspan>`)
  expect(plainText(four)).toContain('■ $12.00 · ■ Opus $3.00')
  expect(plainText(four)).not.toContain('Haiku $1.00')
  const one = byModel(1400, [['sonnet', 4]])
  expect(one).toContain(`fill="${ORANGE}" dx="10">100%`)
  expect(plainText(one)).toContain('■ $4.00')
  expect([...one.matchAll(/height="6" rx="3"/g)].length).toBe(1)
  // No priced model yet: a dash.
  const dash = byModel(1400, [])
  expect(plainText(dash)).toContain('BY MODEL—after a few turns')
})

// ---------- TOOL OUTPUT (the Capacity tab) ----------
test('tool output: the figure in tokens, the top tools and the re-reads in orange as the caption', () => {
  const s = after(body(cap(1400, METRICS).source), 'TOOL OUTPUT')
  expect(s).toContain('>TOOL OUTPUT<')
  expect(s).toContain('<tspan font-size="38">41k</tspan><tspan font-size="15" font-weight="500" fill="#8d8775" dx="7">tokens</tspan>')
  // Two columns: the second title is at the second column.
  expect(titleOf(body(cap(1400, METRICS).source), 'TOOL OUTPUT')).toBe(colXOf(1400, 2, 1))
  // 1400: the column fits every tool and the re-reads.
  expect(s).toContain(`>Bash 18k · Read 12k · Grep 6k<tspan fill="${ORANGE}" font-weight="700"> · 4 re-reads</tspan>`)
  // No re-reads: no orange part. One re-read is singular.
  const none = after(body(cap(1400, { ...METRICS, rereads: 0, rereadTok: 0 }).source), 'TOOL OUTPUT')
  expect(none).toContain('>Bash 18k · Read 12k · Grep 6k</text>')
  expect(none).not.toContain('re-read')
  expect(after(body(cap(1400, { ...METRICS, rereads: 1 }).source), 'TOOL OUTPUT')).toContain('> · 1 re-read</tspan>')
})

test('tool output: at the narrowest two-column width the re-read part stays and tools are cut from the back', () => {
  const s = after(body(cap(682, METRICS).source), 'TOOL OUTPUT')
  expect(s).toContain(`>Bash 18k<tspan fill="${ORANGE}" font-weight="700"> · 4 re-reads</tspan>`)
  // Every caption fits its column (0.56 em a character, as the card estimates).
  for (const m of s.matchAll(/<text x="[\d.]+" y="\d+" font-size="18" font-weight="500"[^>]*>(.*?)<\/text>/g)) expect(plainText(m[1]).length * 18 * 0.56).toBeLessThanOrEqual(colWOf(682, 2))
})

test('tool output on one column is a status line: the figure, and with room the top tools and the re-reads', () => {
  const s = plainText(body(cap(300, METRICS).source))
  expect(s).not.toContain('TOOL OUTPUT')
  expect(s).toContain('tool output 41k tokens')
  expect(plainText(body(cap(600, METRICS).source))).toContain('tool output 41k tokens · 4 re-reads')
})

test('tool output: unknown shows a dash and when it will be known', () => {
  expect(plainText(after(body(cap(1400, { ...NONE, hit: 0.5 }).source), 'TOOL OUTPUT'))).toContain('TOOL OUTPUT—after a few turns')
  expect(plainText(after(body(cap(1400, null).source), 'TOOL OUTPUT'))).toContain('TOOL OUTPUT—after a few turns')
})

test('the alt text has the tool output sentence at every tab and width, the re-read part only when there are re-reads', () => {
  for (const tab of TAB_IDS)
    for (const w of WIDTHS)
      expect(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS, tab).alt).toContain(' Tool output into the context: about 41k tokens (Bash 18k, Read 12k, Grep 6k); 4 re-reads of unchanged files, about 9k tokens.')
  const none = cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, rereads: 0, rereadTok: 0 }).alt
  expect(none).toContain(' Tool output into the context: about 41k tokens (Bash 18k, Read 12k, Grep 6k).')
  expect(none).not.toContain('re-read')
  expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...METRICS, toolTok: 0, tools: [], rereads: 0 }).alt).not.toContain('Tool output')
})
