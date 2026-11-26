// The width the band was last drawn at and the layout it chose, kept for the status command: a layout that does not
// fit can be traced to the width the band was given. A module variable: lost on reload.

type Drawn = { body: number | null; viewport: number | null; used: number; kind: string; need: string; fit?: string }

let lastWidth: Drawn | null = null

/** The band was drawn at this width, in this layout; the open card's fit is added after by `noteFit`. */
export function noteWidth(drawn: Drawn): void {
  lastWidth = drawn
}

/** How the open card fitted the rows the host allows, for the drawing noted last. */
export function noteFit(fit: string): void {
  if (lastWidth) lastWidth.fit = fit
}

/** The status command's line about the band's width. */
export function widthLine(): string {
  return lastWidth === null
    ? 'band: not drawn yet since the mod loaded'
    : `band: drawn at ${lastWidth.used} columns (bodyColumns ${lastWidth.body ?? 'none'}, viewport ${lastWidth.viewport ?? 'none'}), layout ${lastWidth.kind}; estimated need ${lastWidth.need}${lastWidth.fit ? `; open card ${lastWidth.fit}` : ''}`
}
