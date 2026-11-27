// The context window's zones of the card: CONVERSATION SIZE (RE-CACHE once the cache is cold) and TOOL OUTPUT.
// Pure: each returns an SVG string the band places.

import { DANGER, EMPTY, LC_BL, LC_LA, LC_PE, LC_TA, MUTED, OK, ORANGE, TEXT } from '../../band/look'
import type { Kit } from '../../band/look'
import { RUNWAY_CAP } from './runway'

// A copy of cost/prices's tok: a domain imports no other domain.
/** Tokens as the card writes them: 842, 38k, 1.2M. */
const tok = (n: number): string => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : n < 1000 ? `${Math.round(n)}` : `${Math.round(n / 1000)}k`)

// Geometry of the zones, in px of the card's SVG; y offsets count from the zone's top.
/** Baseline of a zone's heading, and its font size and letter spacing. */
const HEAD_DY = 24
const HEAD_SIZE = 14
const HEAD_LS = 1.4
/** The figure's font size, and the font size of the unit beside it. */
const FIG_SIZE = 38
const FIG_UNIT_SIZE = 15
/** Baseline of the figure, and of the caption line under it (px). */
const FIG_DY = 62
const CAP_DY = 108
/** CONVERSATION SIZE with a runway line: figure, caption and runway line baselines (px). */
const FIG_UP_DY = 60
const RUNWAY_CAP_DY = 98
const RUNWAY_LINE_DY = 118
/** The stacked bar: its top below the zone's top with the runway line and without it, and its height (px). */
const RUNWAY_BAR_DY = 66
const BAR_DY = 77
const BAR_H = 16
/** The colours of the top tools in the bar and the caption, in order, and of the other tools. */
export const TOOL_COLORS = [LC_BL, LC_LA, LC_PE]
export const OTHER_COLOR = LC_TA
/** The gauge of turns left: the narrowest column that has one, the arc's radius and stroke, the baseline of its flat side below the zone's top, and the turns that fill it (px, turns). */
const GAUGE_MIN_W = 260
const GAUGE_R = 21
const GAUGE_STROKE = 5
const GAUGE_BASE_DY = 60
const GAUGE_FULL_TURNS = 40
/** The gauge turns red at this many turns left or fewer, and orange at this many or fewer. */
const GAUGE_DANGER_TURNS = 5
const GAUGE_WARN_TURNS = 15
/** The turns inside the gauge: size and the drop of its baseline from the arc's flat side (px). */
const GAUGE_TEXT_SIZE = 13
const GAUGE_TEXT_DY = 4
/** The file chips: top and height below the zone's top, text size and baseline below the chip's top, padding at each side, gap between chips, outline width, and a character's width as a share of the size (px). */
const CHIP_DY = 73
const CHIP_H = 20
const CHIP_SIZE = 12
const CHIP_TEXT_DY = 14
const CHIP_PAD = 8
const CHIP_GAP = 6
const CHIP_STROKE = 1.2
const CHIP_CHAR_W = 0.6
/** Width of a caption character as a share of its font size, for fitting lines to the column. */
const CAP_CHAR_W = 0.56

/** The turns left as the card writes them: `~12`, or `>99`. */
export const turnsOf = (runway: number): string => (runway > RUNWAY_CAP ? `>${RUNWAY_CAP}` : `~${Math.round(runway)}`)

/** The runway as the card writes it: the turns (`~12`, or `>99`) and the full line; both empty until the growth is known. */
export const runwayOf = (runway: number | null, growth: number | null): { turns: string; line: string } => {
  const turns = runway !== null && growth !== null ? turnsOf(runway) : ''
  const line = turns ? `${turns} turns left at +${growth! >= 1000 ? tok(growth!) : Math.round(growth!)} a turn` : ''
  return { turns, line }
}

/** What fills the context, in tokens: the setup, the chat, each top tool, the other tools, and the free room. */
export type Stack = { setup: number; chat: number; tools: [string, number][]; other: number; free: number }

/**
 * Splits the `tokens` of context. Setup is `ctxFirst` (an estimate; none when unknown or when the context has shrunk below it). Tool output is the most that fits after
 * it, shared by the top `tools` in proportion to their tokens with the rest as other. Chat is what is left, free what the window has over.
 */
export const stackOf = (tokens: number, window: number, ctxFirst: number | null | undefined, tools: [string, number][], toolTok: number): Stack => {
  const used = Math.max(0, tokens)
  // A context below the estimate was compacted since: the estimate no longer describes it, so no setup part.
  const setup = ctxFirst != null && ctxFirst <= used ? Math.max(0, ctxFirst) : 0
  const tool = toolTok > 0 ? Math.min(toolTok, used - setup) : 0
  const own: [string, number][] = tools.map(([n, c]) => [n, toolTok > 0 ? (tool * c) / toolTok : 0])
  const other = Math.max(0, tool - own.reduce((a, [, c]) => a + c, 0))
  return { setup, chat: used - setup - tool, tools: own, other, free: Math.max(0, window - used) }
}

const px = (n: number): number => Math.round(n * 100) / 100

/** The stack as one bar `w` wide: a part per piece with tokens, each as wide as its share of the window (of the context when that is over it). */
const stackBar = (x: number, y: number, w: number, s: Stack, chat: string, window: number): string => {
  const parts: [number, string][] = [
    [s.setup, MUTED],
    [s.chat, chat],
    ...s.tools.map(([, c], i) => [c, TOOL_COLORS[i % TOOL_COLORS.length]] as [number, string]),
    [s.other, OTHER_COLOR],
    [s.free, EMPTY],
  ]
  const total = Math.max(window, parts.reduce((a, [c]) => a + c, 0) - s.free)
  if (total <= 0) return `<rect x="${x}" y="${y}" width="${w}" height="${BAR_H}" fill="${EMPTY}"/>`
  let out = ''
  let cum = 0
  for (const [c, fill] of parts) {
    if (c <= 0) continue
    const x0 = px(x + (w * cum) / total)
    cum += c
    const x1 = px(x + (w * cum) / total)
    if (x1 > x0) out += `<rect x="${x0}" y="${y}" width="${px(x1 - x0)}" height="${BAR_H}" fill="${fill}"/>`
  }
  return out
}

/** The gauge of turns left: a half circle with its flat side on `base`, filled to the share of GAUGE_FULL_TURNS, coloured by how few turns are left, the turns inside. */
const gauge = (k: Kit, cx: number, base: number, turns: number): string => {
  const share = Math.min(1, Math.max(0, turns / GAUGE_FULL_TURNS))
  const a = Math.PI * share
  const shown = Math.round(turns)
  const color = shown <= GAUGE_DANGER_TURNS ? DANGER : shown <= GAUGE_WARN_TURNS ? ORANGE : OK
  const arc = (x1: number, y1: number) => `M${px(cx - GAUGE_R)} ${base}A${GAUGE_R} ${GAUGE_R} 0 0 1 ${px(x1)} ${px(y1)}`
  const stroke = (d: string, c: string) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${GAUGE_STROKE}" stroke-linecap="round"/>`
  return (
    stroke(arc(cx + GAUGE_R, base), EMPTY) +
    (share > 0 ? stroke(arc(cx - GAUGE_R * Math.cos(a), base - GAUGE_R * Math.sin(a)), color) : '') +
    k.t(cx, base - GAUGE_TEXT_DY, k.esc(turnsOf(turns)), { size: GAUGE_TEXT_SIZE, w: 600, fill: TEXT, anchor: 'middle' })
  )
}

/**
 * CONVERSATION SIZE: the context filled as one stacked bar (setup, chat, the top tools, other tools, free) and in tokens;
 * `runway` is the caption variants for the line under it, longest first, and `gauge` the turns left for the half circle beside the figure.
 * Without `setup`, `tools` and `toolTok` everything in use is chat.
 */
export const sizeZone = (
  k: Kit,
  x: number,
  y: number,
  w: number,
  d: { tokens: number; window: number; cold: boolean; runway?: string[]; setup?: number | null; tools?: [string, number][]; toolTok?: number; gauge?: number | null },
): string => {
  const { t, big, capPick, capSize, esc, HUEM } = k
  const free = Math.max(0, d.window - d.tokens)
  const share = d.window > 0 ? Math.min(1, d.tokens / d.window) : 0
  const pct = Math.round(share * 100)
  const caption = capPick([`${pct}% of the ${tok(d.window)} context · ${tok(free)} free`, `${pct}% of ${tok(d.window)} · ${tok(free)} free`], w, capSize(w))
  const g = t(x, y + HEAD_DY, d.cold ? 'RE-CACHE' : 'CONVERSATION SIZE', { size: HEAD_SIZE, ls: HEAD_LS })
  const bar = (dy: number) => stackBar(x, y + dy, w, stackOf(d.tokens, d.window, d.setup, d.tools ?? [], d.toolTok ?? 0), HUEM, d.window)
  // With the runway line the figure, bar and first caption move up to leave the row's last 24 px for it.
  if (d.runway && d.runway.length) {
    return (
      g +
      big(x, y + FIG_UP_DY, tok(d.tokens), FIG_SIZE, 'tokens', FIG_UNIT_SIZE) +
      (d.gauge != null && w >= GAUGE_MIN_W ? gauge(k, x + w - GAUGE_R - GAUGE_STROKE / 2, y + GAUGE_BASE_DY, d.gauge) : '') +
      bar(RUNWAY_BAR_DY) +
      t(x, y + RUNWAY_CAP_DY, esc(caption), { size: capSize(w), w: 500 }) +
      t(x, y + RUNWAY_LINE_DY, esc(capPick(d.runway, w, capSize(w))), { size: capSize(w), w: 500 })
    )
  }
  return g + big(x, y + FIG_DY, tok(d.tokens), FIG_SIZE, 'tokens', FIG_UNIT_SIZE) + bar(BAR_DY) + t(x, y + CAP_DY, esc(caption), { size: capSize(w), w: 500 })
}

// TOOL OUTPUT: tokens of tool output in the main context as the figure; the re-read files as chips under it; the top tools as the
// caption, each in its colour in the bar, with the re-reads of unchanged files in orange after them. Tools are cut from the back
// until the line fits; the re-read part stays.
export const toolsZone = (
  k: Kit,
  x: number,
  y: number,
  w: number,
  m: { tools: [string, number][]; toolTok: number; rereads: number; rereadFiles?: [string, number][] } | null,
): string => {
  const { big, capSize, esc, mdash, mhead } = k
  if (!m || m.toolTok <= 0) return mdash(x, y, w, 'TOOL OUTPUT')
  const size = capSize(w)
  const reread = m.rereads > 0 ? `${m.rereads} re-read${m.rereads === 1 ? '' : 's'}` : ''
  let list = m.tools.map(([n, c]) => `${n} ${tok(c)}`)
  const len = (l: string[]) => (l.join(' · ') + (reread ? (l.length ? ' · ' : '') + reread : '')).length
  while (list.length > 1 && len(list) * size * CAP_CHAR_W > w) list = list.slice(0, -1)
  const cap =
    `<text x="${x}" y="${y + CAP_DY}" font-size="${size}" font-weight="500" fill="${MUTED}">` +
    list.map((s, i) => (i ? ' · ' : '') + `<tspan fill="${TOOL_COLORS[i % TOOL_COLORS.length]}">${esc(s)}</tspan>`).join('') +
    (reread ? `<tspan fill="${ORANGE}" font-weight="700">${list.length ? ' · ' : ''}${reread}</tspan>` : '') +
    '</text>'
  // One chip a re-read file, newest first, in a row: the first that does not fit ends it.
  let chips = ''
  let cx = x
  for (const [name, n] of m.rereadFiles ?? []) {
    const label = `${name} ×${n}`
    const cw = Math.ceil(label.length * CHIP_SIZE * CHIP_CHAR_W + 2 * CHIP_PAD)
    if (cx + cw > x + w) break
    chips +=
      `<rect x="${cx}" y="${y + CHIP_DY}" width="${cw}" height="${CHIP_H}" rx="${CHIP_H / 2}" fill="none" stroke="${ORANGE}" stroke-width="${CHIP_STROKE}"/>` +
      k.t(cx + cw / 2, y + CHIP_DY + CHIP_TEXT_DY, esc(label), { size: CHIP_SIZE, w: 600, fill: ORANGE, anchor: 'middle' })
    cx += cw + CHIP_GAP
  }
  return mhead(x, y, 'TOOL OUTPUT') + big(x, y + FIG_DY, tok(m.toolTok), FIG_SIZE, 'tokens', FIG_UNIT_SIZE) + chips + cap
}
