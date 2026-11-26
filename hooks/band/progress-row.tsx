// The progress row: the bar for where the request is (or one sweeping while a turn works), its words, and the
// subagents at work, fitted to the room the band leaves. The theme draws the bar; the numbers come from activity/.

import type { Progress, Turn, Worker } from '../../types'
import { BAR_H, crewSvg } from '../activity/progress/art'
import { CREW_SHOWN, crewText } from '../activity/crew'
import { barText, fmtElapsed, labelOf, pulseText } from '../activity/progress/progress'
import type { Theme } from '../activity/progress/themes/kit'
import { COMPACT_CHAR_COLS } from '../layout'
import type { Kind } from '../layout'
import type { BandUi } from './buttons'
import { ORANGE } from './look'
import { CELLS, TIGHT_CELLS } from './widths'

/** The step's name beside the bar is cut to this, so the bar keeps its room. */
const NOTE_MAX = 32
const BAR_MIN_PX = 140
/** A column is 12 px; the row's words are measured at COMPACT_CHAR_COLS of it a character. */
const COL_PX_FULL = 12

/** What the progress row is drawn from; `walking` and `pacing` are as the render read them. */
export type ProgressIn = {
  ui: BandUi
  kind: Kind
  columns: number
  now: number
  /** The progress with steps to measure against, else null. */
  walking: Progress | null
  /** The turn while it works with no list or report, else null. */
  pacing: Turn | null
  running: Worker[]
  theme: Theme
}

/** The progress row on a row of its own, at the width the words leave: the band less its padding and a column of safety. Null when there is nothing to show. */
export function progressRowOf(p: ProgressIn) {
  const rowPx = (p.columns - 3) * COL_PX_FULL
  return progressOf(p, 'progress-row', rowPx, rowPx)
}

/**
 * The bar, its words and the crew in `availPx` of room, the bar's drawing at most `max` wide; null when
 * there is nothing to show. The bar keeps at least BAR_MIN_PX; the step's name is cut to what is left
 * and dropped when nothing is, so the row never wraps past the band.
 */
function progressOf(p: ProgressIn, key: string, availPx: number, max: number) {
  const { Box, Text, Svg } = p.ui
  const { kind, now, walking, pacing, running, theme } = p
  // Subagents still working after the main turn ended (a background agent): the work goes on, so the bar sweeps
  // beside them, without the turn's step count and time, which have stopped.
  const sweeping = !!pacing || (!walking && running.length > 0)
  const said = walking ? labelOf(walking) : null
  const note = said && said.note.length > NOTE_MAX ? said.note.slice(0, NOTE_MAX - 1) + '…' : (said?.note ?? '')
  // The theme draws the step's name (and the idle line) itself on the desktop; the words beside the bar then leave them out.
  const inDrawing = !!Svg && theme.names
  const pulse = pacing && !(Svg && theme.info) ? ` ${pulseText(pacing, now)}` : ''
  const paceInfo = pacing ? `${pacing.steps} ${pacing.steps === 1 ? 'step' : 'steps'} · ${fmtElapsed(now - pacing.startedAt)}` : ''
  const crewWords = running.length ? ` ×${running.length} ${crewText(running)}` : ''
  // The progress row's words are measured like the compact row's: about 0.85 columns a character on the desktop.
  const charPx = COL_PX_FULL * (Svg ? COMPACT_CHAR_COLS : 1)
  const crewDrawPx = running.length && Svg ? crewSvg(Math.min(CREW_SHOWN, running.length)).w : 0
  const crewPx = running.length ? crewDrawPx + (crewWords.length + (walking || sweeping ? 2 : 0)) * charPx : 0
  // What the words need beside the bar, apart from the step's name: the count (or nothing) and the crew.
  const fixedPx = (walking ? (` ${said!.count}`.length) * charPx : 0) + crewPx
  const fitChars = (s: string, chars: number) => (s.length <= chars ? s : chars >= 2 ? s.slice(0, chars - 1) + '…' : '')
  const crewBits = !running.length
    ? []
    : [
        Svg ? (
          <Svg
            key="crew"
            source={crewSvg(Math.min(CREW_SHOWN, running.length)).source}
            alt={`${running.length} ${running.length === 1 ? 'subagent' : 'subagents'} working`}
            width={crewSvg(Math.min(CREW_SHOWN, running.length)).w}
            height={BAR_H}
            isInteractive
          />
        ) : null,
        <Text key="crew-count" color="text" bold>{` ×${running.length}`}</Text>,
        <Text key="crew-names" color="subtle">{` ${crewText(running)}`}</Text>,
      ]
  if (!walking && !sweeping) return null
  const wordsPx = (s: string) => s.length * charPx
  // The text wanted beside the bar: the step's name (with its dot) or the pulse line.
  const wanted = walking ? (note && !inDrawing ? ` · ${note}` : '') : pulse
  const room = availPx - fixedPx
  const barPx = Math.max(BAR_MIN_PX, Math.min(max, room - wordsPx(wanted)))
  const left = room - barPx
  const shown = !wanted ? '' : fitChars(wanted, Math.floor(left / charPx + 1e-6))
  const noteShown = walking ? (shown.length > 3 ? shown.slice(3) : '') : shown
  const w = Math.round(barPx)
  const drawing = !walking && !sweeping ? null : !Svg ? (
    walking ? <Text key="bar" color={ORANGE}>{barText(walking, kind === 'tight' ? TIGHT_CELLS : CELLS)}</Text> : null
  ) : walking ? (
    <Svg
      key="bar"
      source={theme.walk(walking, w)}
      alt={walking.isFinished ? `Progress: all ${walking.total} done` : `Progress: ${walking.done} of ${walking.total} done.${note ? ` Now: ${note}` : ''}`}
      width={w}
      height={BAR_H}
      isInteractive
    />
  ) : (
    <Svg key="bar" source={theme.pace(w, paceInfo)} alt="Working" width={w} height={BAR_H} isInteractive />
  )
  return (
    <Box key={key} flexDirection="row" flexShrink={0} alignItems="center" paddingX={1}>
      {drawing}
      {walking ? <Text key="count" color="text" bold>{` ${said!.count}`}</Text> : null}
      {walking && noteShown ? <Text key="note" color="subtle" wrap="truncate-end">{` · ${noteShown}`}</Text> : null}
      {pacing && shown ? <Text key="pulse" color="subtle" wrap="truncate-end">{shown}</Text> : null}
      {crewBits.length && (walking || sweeping) ? <Text key="crew-gap">{'  '}</Text> : null}
      {crewBits}
    </Box>
  )
}
