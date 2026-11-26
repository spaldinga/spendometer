import { expect, test } from 'claude-code/testing'

import { EMPTY, OK, ORANGE, YELLOW } from '../hooks/band/look'
import { cardSvg } from '../hooks/band/card'
import type { Metrics } from '../hooks/band/card-metrics'
import { WARM, SPEND, WIDTHS, DELEG, METRICS, YC, ROW, colWOf, colXOf, body, plainText, PACE_OK, TAB_IDS, TAB_LABEL, ctx, cost, NONE } from './card-kit'
// ---------- DELEGATION ----------
/** The DELEGATION column of the 1400 card, up to the next zone. */
const delegZone = (m: Metrics | null, w = 1400) => {
  const s = body(cardSvg(WARM, w, SPEND, [PACE_OK], m).source)
  return s.slice(s.indexOf('>DELEGATION<') - 40, s.indexOf('>SPEND<'))
}

test('delegation: the saving in the OK colour, a cost row and a time row on EMPTY tracks, and the work against the time', () => {
  const colW = colWOf(1400, 2)
  const s = delegZone(METRICS)
  expect(s).toContain('<tspan font-size="38">≈$3.10</tspan><tspan font-size="15" font-weight="500" fill="#8d8775" dx="7">saved</tspan>')
  expect(s).toContain(`<text x="13" y="${YC + 62}" font-weight="600" fill="${OK}">`)
  expect(plainText(s)).toContain('cost')
  expect(plainText(s)).toContain('time')
  const tracks = [...s.matchAll(/<rect x="([\d.]+)" y="(\d+)" width="([\d.]+)" height="6" rx="3" fill="#4a463b"\/>/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]) }))
  expect(tracks.length).toBe(2)
  const fills = (fill: string) => [...s.matchAll(new RegExp(`<rect x="([\\d.]+)" y="(\\d+)" width="([\\d.]+)" height="6" rx="3" fill="${fill}"/>`, 'g'))]
  // The cost row is 40% full in orange, the time row 5 of 12 minutes in yellow; the rows are above each other, one track wide.
  const cost = fills(ORANGE).find(m => Number(m[2]) === tracks[0].y)!
  const time = fills(YELLOW).find(m => Number(m[2]) === tracks[1].y)!
  expect(Number(cost[3])).toBe(Math.round(0.4 * tracks[0].w))
  expect(Number(time[3])).toBe(Math.round((5 / 12) * tracks[1].w))
  expect(tracks[0].x).toBe(tracks[1].x)
  expect(tracks[0].w).toBe(tracks[1].w)
  expect(tracks[0].x + tracks[0].w).toBe(13 + colW)
  expect(tracks[1].y).toBeGreaterThan(tracks[0].y)
})

test('delegation is a column at every width, with its figure and caption on the other zones\' baselines', () => {
  for (const w of WIDTHS) {
    const s = body(cardSvg(WARM, w, SPEND, [PACE_OK], METRICS).source)
    expect(s).toContain(`<text x="13" y="${YC + 24}" font-size="14" font-weight="700" fill="#8d8775" letter-spacing="1.4" text-anchor="start">DELEGATION<`)
    expect(s).toContain(`<text x="13" y="${YC + 62}" font-weight="600" fill="${OK}">`)
    expect(s).toContain(`<text x="13" y="${YC + 108}" font-size="18" font-weight="500"`)
    expect(plainText(s)).toContain('≈$3.10')
  }
})

test('the delegation caption gives work, wall time and the speed-up, shortened to fit the column', () => {
  const at = (w: number, m: Metrics) => plainText(delegZone(m, w))
  expect(at(1700, METRICS)).toContain('12m of agent work in 5m · 2.4× faster')
  expect(at(1400, METRICS)).toContain('12m of agent work in 5m · 2.4× faster')
  expect(at(1100, METRICS)).toContain('12m of agent work in 5m · 2.4× faster')
  expect(at(300, METRICS)).toContain('12m work in 5m · 2.4× faster')
  // Never overlapped: 1.0x, said honestly; a sub-minute run is written in seconds.
  expect(at(1700, { ...METRICS, deleg: { ...DELEG, workMs: 90_000, wallMs: 90_000 } })).toContain('1m of agent work in 1m · 1.0× faster')
  expect(at(1700, { ...METRICS, deleg: { ...DELEG, workMs: 45_000, wallMs: 30_000 } })).toContain('45s of agent work in 30s · 1.5× faster')
})

test('delegation before any subagent: a dash and the plain words; with old subagent spend only, it waits for the next one; with no metrics, a dash', () => {
  const none = delegZone({ ...METRICS, deleg: null, subs: 0, top: [] })
  expect(plainText(none)).toContain('DELEGATION—no subagents this thread')
  expect(none).not.toContain('saved')
  expect(plainText(delegZone({ ...METRICS, deleg: null }))).toContain('DELEGATION—tracked from the next subagent')
  expect(plainText(delegZone(null))).toContain('DELEGATION—after a few turns')
  expect(plainText(delegZone(null, 300))).toContain('DELEGATION—after a few turns')
  // A subagent of the main model's own kind saves nothing: shown as $0.00, never negative.
  expect(delegZone({ ...METRICS, deleg: { ...DELEG, saved: 0, costRatio: 1 } })).toContain('<tspan font-size="38">≈$0.00</tspan>')
})

test('the alt text carries what the row left out: the per-type subagent costs, the models, the saving and the runway', () => {
  const alt = cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS).alt
  expect(alt).toContain('Subagents cost $5.14 (Explore $3.90, coder $1.24)')
  expect(alt).toContain('Cost by model: Opus $14.20, Sonnet $5.10, Haiku $1.09')
  expect(alt).toContain('Delegating saved about $3.10; subagents ran 12m of work in 5m')
  expect(alt).toContain('~40 turns left at +6k a turn')
  expect(alt).toContain('Effective price about $0.62 per million tokens')
})

test('the alt text keeps every sentence at every width and on every tab, and leads with the tab', () => {
  for (const tab of TAB_IDS)
    for (const w of WIDTHS) {
      const alt = cardSvg(WARM, w, SPEND, [PACE_OK], METRICS, tab).alt
      expect(alt.startsWith(`Tab: ${TAB_LABEL[tab]}. Cache warm.`)).toBe(true)
      expect(alt).toContain('Delegating saved about $3.10; subagents ran 12m of work in 5m')
      expect(alt).toContain('Cost by model: Opus $14.20, Sonnet $5.10, Haiku $1.09')
      expect(alt).toContain('Subagents cost $5.14')
      expect(alt).toContain('~40 turns left at +6k a turn')
      expect(alt).toContain('Keeping the cache warm costs about $0.06 an hour')
      expect(cardSvg(WARM, w, SPEND, [PACE_OK], { ...METRICS, deleg: null }, tab).alt).not.toContain('Delegating')
    }
})

test('no outlier flag while the last message is near the average', () => {
  const s = body(cost(1400, { ...METRICS, multiple: null }).source)
  expect(s).toContain('last $2.11</text>')
  expect(s).not.toContain('× avg')
})

test('the runway is a second caption under CONVERSATION SIZE, with the rows and the card heights unchanged', () => {
  const c = ctx(1400, METRICS)
  expect(c.h).toBe(6 + ROW)
  const s = body(c.source)
  expect(s).toContain('>~40 turns left at +6k a turn<')
  expect(s).toContain('>24% of the 1M context · 760k free<')
  // Both captions, and the dots, sit inside the 124 px row, above the rule under it.
  const x = colXOf(1400, 2, 0)
  const ys = (re: RegExp) => Number(re.exec(s)![1])
  const second = ys(new RegExp(`<text x="${x}" y="(\\d+)"[^>]*>~40 turns left`))
  const first = ys(new RegExp(`<text x="${x}" y="(\\d+)"[^>]*>24% of the`))
  expect(first).toBeLessThan(second)
  expect(second + 4).toBeLessThanOrEqual(ROW)
  const dotYs = [...s.matchAll(/<circle cx="[\d.]+" cy="(\d+)" r="3"/g)].map(m => Number(m[1])).slice(0, 50)
  expect(Math.max(...dotYs) + 3).toBeLessThan(first - 12)
  // At every width, the long form where it fits the column and the short one where it does not; not while the growth is unknown.
  for (const w of [800, 300]) expect(body(ctx(w, METRICS).source)).toContain('turns left')
  expect(body(ctx(300, METRICS).source)).toContain('>~40 turns left at +6k a turn<')
  for (const w of WIDTHS) expect(body(ctx(w, { ...METRICS, runway: null, growth: null }).source)).not.toContain('turns left')
  // Only the Context tab draws it.
  for (const tab of ['overview', 'cost'] as const) expect(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS, tab).source)).not.toContain('turns left')
})

test('the runway shows >99 past the cap, escaped, and small growth is written in tokens', () => {
  const s = body(ctx(1400, { ...METRICS, runway: 250, growth: 640 }).source)
  expect(s).toContain('>&gt;99 turns left at +640 a turn<')
})

test('an unknown metric shows its title, a dash and when it will be known', () => {
  // Nothing known at all: the tabs are as tall as with figures.
  for (const tab of TAB_IDS) {
    expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], NONE, tab).h).toBe(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS, tab).h)
    expect(cardSvg(WARM, 1400, SPEND, [PACE_OK], null, tab).h).toBe(cardSvg(WARM, 1400, SPEND, [PACE_OK], METRICS, tab).h)
  }
  // One known: its cell, with the others as dashes.
  const s = body(cost(1400, { ...NONE, hit: 0.5 }).source)
  expect(s).toContain('<tspan font-size="38">50%</tspan>')
  expect(s.split('<tspan font-size="38">—</tspan>').length - 1).toBe(2)
  expect(s.split('>after a few turns<').length - 1).toBe(2)
  expect(s).toContain('>of input read from cache<')
  expect(body(cardSvg(WARM, 1400, SPEND, [PACE_OK], { ...NONE, hit: 0.5 }).source)).toContain('>no subagents this thread<')
})
