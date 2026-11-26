// The band's look: its palette and the SVG document every drawing is wrapped in. The one file the
// domains may import; it imports nothing else of the mod's own but the font.

import { SANS } from './font'

export type Mode = 'warm' | 'cold'

// The band's own colours, measured from the app.
export const TEXT = '#e8e2d2'
export const MUTED = '#8d8775'
export const EMPTY = '#4a463b'
export const LINE = '#36332b'
export const ORANGE = '#ff6b1a'
export const YELLOW = '#f5a623'
/** A window that runs out before it resets. */
export const DANGER = '#e24b4a'
/** A window that lasts until it resets: a muted green beside DANGER. */
export const OK = '#1d9e75'

// The cache's two states in a muted shade: desaturated so they sit
// beside the band's own orange and yellow.
export const HUE: Record<Mode, string> = { warm: '#cc6363', cold: '#6aaabd' }
/** Fable's colour in the by-model split: a lavender beside the others. */
export const FABLE = '#b59fd0'
/** Text on a filled chip. */
export const INK = '#1c1a16'

// The console progress theme's palette, after a Star Trek-like panel: dark values here, light ones in LIGHT.
export const LC_OR = '#ff9900'
export const LC_PE = '#ffcc99'
export const LC_TA = '#cc9966'
export const LC_LA = '#cc99cc'
export const LC_BL = '#9999ff'
/** Text on the console's blocks. */
export const LC_INK = '#000000'

const mix = (a: string, b: string, t: number): string =>
  '#' +
  [1, 3, 5]
    .map(i => Math.round(parseInt(a.substr(i, 2), 16) * (1 - t) + parseInt(b.substr(i, 2), 16) * t).toString(16).padStart(2, '0'))
    .join('')

/** The frozen Robo's pale blue: the cold hue half way to white. */
export const ICE = mix(HUE.cold, '#ffffff', 0.5)

/**
 * The drawings' colours on a light background, by the dark colour each replaces: the one place both palettes
 * live. A drawing is painted in the dark palette; svgDoc adds a light-scheme style that swaps each colour by
 * attribute, so no drawing code knows about themes. Left alone on purpose: `#000` (the shadow under Robo,
 * translucent black, which reads on light as well as on dark).
 */
export const LIGHT: Record<string, string> = {
  [TEXT]: '#2b2a26',
  [MUTED]: '#6b675c',
  [EMPTY]: '#d9d4c7',
  [LINE]: '#e0dbcf',
  [ORANGE]: '#d4560c',
  [YELLOW]: '#a8700f',
  [HUE.warm]: '#b04545',
  [HUE.cold]: '#2c7a94',
  [FABLE]: '#7a5fa3',
  [OK]: '#0f7a57',
  [DANGER]: '#c03534',
  [INK]: '#ffffff',
  // The frozen Robo: pale on dark, a mid blue on light, with its white glints as a light blue so they still show.
  [ICE]: '#3a86a0',
  '#fff': '#8fc1d2',
  // The console theme of the progress row: orange, peach, tan, lavender and blue blocks with black ink.
  [LC_OR]: '#c06f00',
  [LC_PE]: '#b8743a',
  [LC_TA]: '#8a5a2b',
  [LC_LA]: '#8e5a8e',
  [LC_BL]: '#5555bb',
  [LC_INK]: '#ffffff',
}

const LIGHT_CSS =
  '@media (prefers-color-scheme: light){' +
  Object.entries(LIGHT)
    .map(([dark, light]) => `[fill="${dark}"]{fill:${light}} [stroke="${dark}"]{stroke:${light}}`)
    .join(' ') +
  '}'

/** Every drawing carries its style: the light-scheme colours, and the font when it has text. */
export const svgDoc = (w: number, h: number, body: string, font: boolean): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  '<style>' +
  (font ? `@font-face{font-family:RS;font-weight:100 900;src:url(data:font/woff2;base64,${SANS}) format('woff2')} text{font-family:RS,system-ui,'Segoe UI',sans-serif}` : '') +
  LIGHT_CSS +
  '</style>' +
  body +
  '</svg>'

// ---------- The drawing kit ----------
export type TextOpts = { size?: number; w?: number; fill?: string; ls?: number; anchor?: string }

/** The small drawing helpers the card's zones share, bound to the card's width and the cache's mode. */
export type Kit = {
  W: number
  mode: Mode
  /** The cache mode's colour. */
  HUEM: string
  esc: (s: string) => string
  t: (x: number, y: number, str: string, o?: TextOpts) => string
  vline: (x: number, y: number, h: number) => string
  hline: (y: number) => string
  /** The first of `variants` that fits `px` (a character is estimated at 0.56 em: the mod cannot measure text), else the last. */
  pick: (variants: string[], px: number, size: number, em?: number) => string
  /** A column caption: the card reserves CARD_COL_PX for 33 characters at 18 px, so 0.53 em a character here. */
  capPick: (variants: string[], px: number, size: number) => string
  /** A zone's big figure with its small unit after it. */
  big: (x: number, yy: number, figure: string, bs: number, unit: string, ts: number, fill?: string) => string
  /** Dots in `rows` rows of `cols`, each dot coloured by its index. */
  dots: (gx: number, gy: number, cols: number, step: number, rows: number, fill: (i: number) => string) => string
  /** A zone's caption size: a little smaller where the zone is narrow. */
  capSize: (w: number) => number
  /** The metric zones' shared pieces: a title, the caption on the row's last line, and a zone that says its figure is unknown. */
  mhead: (x: number, y: number, title: string) => string
  mwords: (x: number, y: number, w: number, str: string) => string
  mdash: (x: number, y: number, w: number, title: string) => string
  famName: (id: string) => string
}

/** The kit for a card `W` wide in the cache's `mode`. */
export const kitOf = (W: number, mode: Mode): Kit => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const t = (x: number, y: number, str: string, o: TextOpts = {}) =>
    `<text x="${x}" y="${y}" font-size="${o.size || 11}" font-weight="${o.w || 700}" fill="${o.fill || MUTED}"` +
    ` letter-spacing="${o.ls ?? 0}" text-anchor="${o.anchor || 'start'}">${str}</text>`
  const vline = (x: number, y: number, h: number) => `<rect x="${x}" y="${y}" width="1" height="${h}" fill="${LINE}"/>`
  const hline = (y: number) => `<rect x="13" y="${y}" width="${W - 26}" height="1" fill="${LINE}"/>`
  const pick = (variants: string[], px: number, size: number, em = 0.56) => variants.find(s => s.length * size * em <= px) ?? variants[variants.length - 1]
  const capPick = (variants: string[], px: number, size: number) => pick(variants, px, size, 0.53)
  const big = (x: number, yy: number, figure: string, bs: number, unit: string, ts: number, fill = TEXT) =>
    `<text x="${x}" y="${yy}" font-weight="600" fill="${fill}"><tspan font-size="${bs}">${figure}</tspan>` +
    (unit ? `<tspan font-size="${ts}" font-weight="500" fill="${MUTED}" dx="7">${unit}</tspan>` : '') +
    '</text>'
  const dots = (gx: number, gy: number, cols: number, step: number, rows: number, fill: (i: number) => string) => {
    let d = ''
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) d += `<circle cx="${gx + 3 + c * step}" cy="${gy + r * 9}" r="3" fill="${fill(r * cols + c)}"/>`
    return d
  }
  // Drawn at 12 px a column, shown at DESKTOP_COL_PX (8.6): about 70%. 18 shows as about 13 px, the band's own text size.
  const capSize = (w: number) => (w < 230 ? 16 : 18)
  const mhead = (x: number, y: number, title: string) => t(x, y + 24, title, { size: 14, ls: 1.4 })
  const mwords = (x: number, y: number, w: number, str: string) => t(x, y + 108, esc(str), { size: capSize(w), w: 500 })
  const mdash = (x: number, y: number, w: number, title: string) => mhead(x, y, title) + big(x, y + 62, '—', 38, '', 15) + mwords(x, y, w, 'after a few turns')
  const famName = (id: string) => id[0].toUpperCase() + id.slice(1)
  return { W, mode, HUEM: HUE[mode], esc, t, vline, hline, pick, capPick, big, dots, capSize, mhead, mwords, mdash, famName }
}
