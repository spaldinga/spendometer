// The context window's zones of the card: CONVERSATION SIZE (RE-CACHE once the cache is cold) and TOOL OUTPUT.
// Pure: each returns an SVG string the band places.

import { EMPTY, MUTED, ORANGE } from '../../band/look'
import type { Kit } from '../../band/look'
import { RUNWAY_CAP } from './runway'

// A copy of cost/prices's tok: a domain imports no other domain.
/** Tokens as the card writes them: 842, 38k, 1.2M. */
const tok = (n: number): string => (n >= 1e6 ? `${Number((n / 1e6).toFixed(1))}M` : n < 1000 ? `${Math.round(n)}` : `${Math.round(n / 1000)}k`)

/** The runway as the card writes it: the turns (`~12`, or `>99`) and the full line; both empty until the growth is known. */
export const runwayOf = (runway: number | null, growth: number | null): { turns: string; line: string } => {
  const turns = runway !== null && growth !== null ? (runway > RUNWAY_CAP ? `>${RUNWAY_CAP}` : `~${Math.round(runway)}`) : ''
  const line = turns ? `${turns} turns left at +${growth! >= 1000 ? tok(growth!) : Math.round(growth!)} a turn` : ''
  return { turns, line }
}

/** CONVERSATION SIZE: the context filled, in dots and tokens; `runway` is the caption variants for the line under it, longest first. */
export const sizeZone = (k: Kit, x: number, y: number, w: number, d: { tokens: number; window: number; cold: boolean; runway?: string[] }): string => {
  const { t, big, dots, capPick, capSize, esc, HUEM } = k
  const free = Math.max(0, d.window - d.tokens)
  const share = d.window > 0 ? Math.min(1, d.tokens / d.window) : 0
  const pct = Math.round(share * 100)
  const caption = capPick([`${pct}% of the ${tok(d.window)} context · ${tok(free)} free`, `${pct}% of ${tok(d.window)} · ${tok(free)} free`], w, capSize(w))
  const g = t(x, y + 24, d.cold ? 'RE-CACHE' : 'CONVERSATION SIZE', { size: 14, ls: 1.4 })
  // 25 dots a row on the page; fewer only where the band is too narrow for them.
  const cols = Math.max(10, Math.min(25, Math.floor(w / 9.6)))
  const lit = Math.round(share * cols * 2)
  const fill = (i: number) => (i < lit ? HUEM : EMPTY)
  // With the runway line the figure, dots and first caption move up to leave the row's last 24 px for it.
  if (d.runway && d.runway.length) {
    return (
      g +
      big(x, y + 60, tok(d.tokens), 38, 'tokens', 15) +
      dots(x, y + 68, cols, 9.6, 2, fill) +
      t(x, y + 98, esc(caption), { size: capSize(w), w: 500 }) +
      t(x, y + 118, esc(capPick(d.runway, w, capSize(w))), { size: capSize(w), w: 500 })
    )
  }
  return g + big(x, y + 62, tok(d.tokens), 38, 'tokens', 15) + dots(x, y + 80, cols, 9.6, 2, fill) + t(x, y + 108, esc(caption), { size: capSize(w), w: 500 })
}

// TOOL OUTPUT: tokens of tool output in the main context as the figure; the top tools as the caption, with the
// re-reads of unchanged files in orange after them. Tools are cut from the back until the line fits; the re-read part stays.
export const toolsZone = (k: Kit, x: number, y: number, w: number, m: { tools: [string, number][]; toolTok: number; rereads: number } | null): string => {
  const { big, capSize, esc, mdash, mhead } = k
  if (!m || m.toolTok <= 0) return mdash(x, y, w, 'TOOL OUTPUT')
  const size = capSize(w)
  const reread = m.rereads > 0 ? `${m.rereads} re-read${m.rereads === 1 ? '' : 's'}` : ''
  let list = m.tools.map(([n, c]) => `${n} ${tok(c)}`)
  const len = (l: string[]) => (l.join(' · ') + (reread ? (l.length ? ' · ' : '') + reread : '')).length
  while (list.length > 1 && len(list) * size * 0.56 > w) list = list.slice(0, -1)
  const cap =
    `<text x="${x}" y="${y + 108}" font-size="${size}" font-weight="500" fill="${MUTED}">` +
    esc(list.join(' · ')) +
    (reread ? `<tspan fill="${ORANGE}" font-weight="700">${list.length ? ' · ' : ''}${reread}</tspan>` : '') +
    '</text>'
  return mhead(x, y, 'TOOL OUTPUT') + big(x, y + 62, tok(m.toolTok), 38, 'tokens', 15) + cap
}
