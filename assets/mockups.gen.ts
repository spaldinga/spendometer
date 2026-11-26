// The README images of the band, drawn from the mod's own SVG: run `bash assets/mockups.sh assets`, not directly.
// mockups.sh copies this file into a scratch copy of the mod as a test (the test kit is the only way to run the
// mod's TypeScript here, and it cannot write files) and writes each `@@mockup <file> <svg>` line it prints.
//
// The card, the pies, the pace track, Robo and the chip are the code's own drawings, so they match the app. The
// row's words and buttons are the host's components, not SVG: they are drawn here with example numbers, in the
// order and colours the row uses (band/row.tsx, band/buttons.tsx). Redraw when the row changes.

import { expect, test } from 'claude-code/testing'

import { cardSvg } from '../hooks/band/card'
import type { Tab } from '../hooks/band/card'
import type { Metrics } from '../hooks/band/card-metrics'
import { DANGER, HUE, LIGHT, MUTED, OK, ORANGE, TEXT, YELLOW } from '../hooks/band/look'
import { pieSvg, paceTrackSvg, PACE_TRACK_PX, PIE_SIZE } from '../hooks/capacity/usage/art'
import type { PaceRow } from '../hooks/capacity/usage/art'
import { ROBO_SIZE, chipSvg, roboSvg } from '../hooks/cost/cache/chip'
import type { CacheView } from '../hooks/cost/cache/facts'

type Theme = 'dark' | 'light'

// ---------- Example figures: one warm conversation, the same in every image ----------
const VIEW: CacheView = { mode: 'warm', idle: '28m', idleMin: 28, tokens: 190000, window: 1000000, mine: 'opus' }
const H5 = 5 * 3600_000
const D7 = 7 * 24 * 3600_000
const PACE: PaceRow[] = [
  { label: '5H', color: YELLOW, untilResetMs: 3 * 3600_000, windowMs: H5, used: 70, pace: { lastsMs: 160 * 60_000, untilResetMs: 3 * 3600_000, ok: false, atReset: 175 } },
  { label: '7D', color: ORANGE, untilResetMs: 75 * 3600_000, windowMs: D7, used: 31, pace: { lastsMs: 206 * 3600_000, untilResetMs: 75 * 3600_000, ok: true, atReset: 54 } },
]
const SPEND = { main: 15.2, subs: 1.41, days: [0.8, 2.1, 3.4, 0, 4.2, 2.9, 3.1], saved: 4.2, pings: 9, commits: 4, prs: 1 }
const METRICS: Metrics = {
  hit: 0.96, perM: 0.42, avg: 0.38, last: 2.11, multiple: 5.6, runway: 40, growth: 6000,
  models: [['opus', 12.96], ['sonnet', 2.9], ['haiku', 0.75]],
  deleg: { saved: 3.4, costRatio: 0.4, workMs: 12 * 60000, wallMs: 5 * 60000 }, subs: 1.41, top: [['Explore', 0.9], ['coder', 0.51]],
  tools: [['Read', 30000], ['Bash', 12000], ['Grep', 6000]], toolTok: 48000, rereads: 3, rereadTok: 9000,
  ctxFirst: 24000, rereadFiles: [['hooks/band/card.ts', 2], ['README.md', 1]],
  recent: [0.21, 0.34, 0.18, 0.42, 0.29, 0.55, 0.31, 0.26, 0.47, 2.11],
}

// ---------- The two themes ----------
// The drawings are painted in the dark palette and carry a light-scheme style (look.ts svgDoc). An <img> on GitHub
// follows GitHub's theme through <picture>, not the system's, so each file is baked: dark drops the style, light
// applies it always. The row below is drawn in the same dark colours, so the same swap recolours it.
const LIGHT_RULES = Object.entries(LIGHT).map(([dark, light]) => `[fill="${dark}"]{fill:${light}} [stroke="${dark}"]{stroke:${light}}`).join(' ')
const LIGHT_CSS = `@media (prefers-color-scheme: light){${LIGHT_RULES}}`
const bake = (svg: string, theme: Theme) => svg.split(LIGHT_CSS).join(theme === 'dark' ? '' : LIGHT_RULES)
/** The band's background and a button's face: the host's, not the mod's, so not in LIGHT. */
const BG: Record<Theme, string> = { dark: '#2a2925', light: '#f4f1ea' }
const BTN: Record<Theme, string> = { dark: '#3a3832', light: '#e6e2d8' }

// ---------- Drawing the row ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
/** About the width of the row's 13 px text in px a character (the card's font, which the whole image uses); bold a little wider. */
const cw = (s: string, bold: boolean) => Math.round([...s].length * (bold ? 6.9 : 6.4))
const EMOJI = "Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif"

/** A row drawn left to right: text, nested drawings and buttons, each advancing x. */
class Row {
  x = 14
  out = ''
  constructor(readonly theme: Theme, readonly mid: number) {}
  text(s: string, fill: string, bold = false, gapAfter = 0) {
    this.out += `<text x="${this.x}" y="${this.mid + 4.5}" font-size="13" font-weight="${bold ? 700 : 500}" fill="${fill}" xml:space="preserve">${esc(s)}</text>`
    this.x += cw(s, bold) + gapAfter
  }
  svg(source: string, w: number, h: number, gapAfter = 0) {
    this.out += source.replace('<svg ', `<svg x="${this.x}" y="${this.mid - h / 2}" `)
    this.x += w + gapAfter
  }
  gap(px: number) {
    this.x += px
  }
  /** A host button: a rounded face, the label, dimmed when `dim`. Drawn at x, returns its width. */
  button(x: number, label: string, dim = false): number {
    const emoji = /\p{Extended_Pictographic}/u.test(label)
    const w = (emoji ? 22 : 0) + cw(label.replace(/\p{Extended_Pictographic}\s?/u, ''), false) + 18
    const op = dim ? ' opacity="0.45"' : ''
    this.out += `<rect x="${x}" y="${this.mid - 12}" width="${w}" height="24" rx="6" fill="${BTN[this.theme]}"/>`
    if (emoji) {
      const [e, ...rest] = [...label]
      this.out += `<text x="${x + 9}" y="${this.mid + 5}" font-size="14" font-family="${EMOJI}"${op}>${e}</text>`
      const word = rest.join('').trim()
      if (word) this.out += `<text x="${x + 31}" y="${this.mid + 4.5}" font-size="12.5" font-weight="500" fill="${TEXT}"${op}>${esc(word)}</text>`
    } else {
      this.out += `<text x="${x + w / 2}" y="${this.mid + 4.5}" font-size="13" font-weight="500" fill="${TEXT}" text-anchor="middle"${op}>${esc(label)}</text>`
    }
    return w
  }
}

const TAB_LABEL: Record<Tab, [string, string]> = { cost: ['💰', 'Cost'], capacity: ['🔋', 'Capacity'] }

/**
 * The desktop band's one row with the card open on `tab`. Wide: USAGE, the 5h window with its pie, percent, pace
 * track and words, the 7d window with its reset, the cost and the last turn, Robo and the WARM chip with the minutes
 * left, the keep-warm ✓, then the tabs (emoji and word) and −. Narrow (the compact row, a step in: the next
 * message's cost shows only while cold): the short names, the percents, the 5h's short pace, the cost, the chip,
 * the ✓, the tabs as emoji, and −.
 */
const rowOf = (W: number, wide: boolean, tab: Tab, theme: Theme) => {
  const r = new Row(theme, 22)
  const pie = (pct: number, col: string, gap = 6) => r.svg(pieSvg(pct, col), PIE_SIZE, PIE_SIZE, gap)
  const track = (px: number) => {
    const t = paceTrackSvg(70, 0.4, YELLOW, false, px)
    r.gap(7)
    r.svg(t.source, t.w, t.h, 0)
  }
  const chip = chipSvg('warm')
  if (wide) {
    r.text('USAGE', TEXT, true, 14)
    r.text('5H ', MUTED, true); pie(70, YELLOW); r.text('70% used', YELLOW, true); track(PACE_TRACK_PX.wide); r.text(' out in ~2h 40m', DANGER, true, 22)
    r.text('7D ', MUTED, true); pie(31, ORANGE); r.text('31% used', ORANGE, true); r.text(' · 3d 3h', MUTED, false, 22)
    r.text('COST ', MUTED, true); r.text('≈$16.61', TEXT, true); r.text(' · last $0.47', MUTED, false, 16)
    r.svg(roboSvg('warm'), ROBO_SIZE, ROBO_SIZE, 7); r.svg(chip.source, chip.w, chip.h, 0); r.text(' 32m left', HUE.warm, true, 8)
    r.text('✓', OK, true)
  } else {
    r.text('5h ', MUTED); pie(70, YELLOW); r.text('70%', YELLOW, true); track(PACE_TRACK_PX.compact); r.text(' out 2h', DANGER, true, 14)
    r.text('week ', MUTED); pie(31, ORANGE); r.text('31%', ORANGE, true, 14)
    r.text('≈$16.61', TEXT, true, 14)
    r.svg(chip.source, chip.w, chip.h, 8)
    r.text('✓', OK, true)
  }
  // The buttons, right-aligned: the tabs (the one in use undimmed), then −.
  const labels = (['cost', 'capacity'] as Tab[]).map(id => [id, wide ? TAB_LABEL[id].join(' ') : TAB_LABEL[id][0]] as const)
  const probe = new Row(theme, 0)
  const widths = labels.map(([, l]) => probe.button(0, l)).concat(probe.button(0, '−'))
  let x = W - 14 - widths.reduce((a, b) => a + b, 0) - 8 * (widths.length - 1)
  labels.forEach(([id, l], i) => { r.button(x, l, id !== tab); x += widths[i] + 8 })
  r.button(x, '−')
  return { body: r.out, h: 44, fits: r.x <= W - 14 - widths.reduce((a, b) => a + b, 0) - 8 * widths.length }
}

/** One README image: the band's row over the card on `tab`, at width W, in one theme. */
export const mockup = (W: number, tab: Tab, theme: Theme) => {
  const wide = W >= 1000
  const row = rowOf(W, wide, tab, theme)
  const card = cardSvg(VIEW, W, SPEND, PACE, METRICS, tab)
  const H = row.h + 6 + card.h + 10
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui,-apple-system,'Segoe UI',sans-serif">` +
    `<rect width="${W}" height="${H}" rx="12" fill="${BG[theme]}"/>` +
    row.body +
    card.source.replace('<svg ', `<svg x="0" y="${row.h + 6}" `) +
    '</svg>'
  return { svg: bake(svg, theme).replace(/\n/g, ''), alt: card.alt, fits: row.fits }
}

const SHOTS: [number, Tab][] = [[1200, 'cost'], [1200, 'capacity'], [600, 'cost'], [600, 'capacity']]

test('README mockups', () => {
  // The row's words must end before the buttons, and no file may depend on the system's scheme.
  const wrong: string[] = []
  for (const [W, tab] of SHOTS) {
    for (const theme of ['dark', 'light'] as Theme[]) {
      const m = mockup(W, tab, theme)
      console.log(`@@mockup band-${tab}-${W}-${theme}.svg ${m.svg}`)
      if (theme === 'dark') console.log(`@@alt band-${tab}-${W} ${m.alt}`)
      if (!m.fits) wrong.push(`band-${tab}-${W}-${theme}: the row runs into the buttons`)
      if (m.svg.includes('prefers-color-scheme')) wrong.push(`band-${tab}-${W}-${theme}: still has the light-scheme media query`)
    }
  }
  expect(wrong).toEqual([])
})
