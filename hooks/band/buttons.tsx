// The band's buttons: the fold button, the tabs and the keep-warm mark, the hover box that says what each one does,
// and the state they keep (the `fold` atom and the card's tab in the store). Written as function declarations: a
// hook's `$` is followed past an import only into those.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Fold } from '../../types'
import { cacheFacts, viewOf } from '../cost/cache/facts'
import { keepTip } from '../cost/cache/keepwarm/lifecycle'
import type { KeepView } from '../cost/cache/keepwarm/lifecycle'
import { BUTTON_GAP, TIP_LIFT } from '../layout'
import { TABS, TAB_NAMES } from './card'
import type { Tab } from './card'
import { OK } from './look'

const fold = atom({ plugin: 'spendometer', key: 'fold' } as const, null as Fold | null)

/** The card's tab in the store: overview, context or cost. */
export const TAB_KEY = 'cardTab'

/** How wide a button's hover text is, in columns. */
const TIP_COLS = 44

type Resolved = ReturnType<EngineInterface['ui']['resolve']>
/** What the band draws with: the components, and Svg only where the surface draws (null in the terminal). */
export type BandUi = Pick<Resolved, 'Box' | 'Button' | 'Text'> & { Svg: Extract<Resolved, { Svg: unknown }>['Svg'] | null }
/** What a hover box needs: the components, and the band's width, which caps how far a tip may grow to the left. */
export type TipCtx = { ui: BandUi; columns: number }

/** The card's tab in the store: one it knows, else Overview. */
export async function tabOf($: EngineInterface): Promise<Tab> {
  try {
    const v = await $.store.get(TAB_KEY)
    return TABS.find(id => id === v) ?? 'overview'
  } catch {
    return 'overview'
  }
}

/** A new conversation: the fold is forgotten, so the card opens by the cache state again. */
export async function resetFold($: EngineInterface): Promise<void> {
  await update($, fold, () => null)
}

/** The fold as kept, or null before the card has been opened or closed. */
export async function readFold($: EngineInterface): Promise<Fold | null> {
  return read($, fold)
}

/**
 * Opens the cache card if it is closed, closes it if open: the fold button and `/spendometer fold`.
 * The fold is kept per cache state (a cold cache opens by default), as the button has always done. Returns
 * whether the card is now open, or null while there is no card yet.
 */
export async function toggleFold($: EngineInterface): Promise<boolean | null> {
  const view = viewOf(await cacheFacts($), await $.clock.now())
  if (!view) return null
  let open = false
  await update($, fold, f => {
    open = !(f && f.mode === view.mode ? f.open : view.mode === 'cold')
    return { mode: view.mode, open }
  })
  $.ui.invalidate('ui.render')
  return open
}

/**
 * A tab button: card closed, the tab is stored and the card opens; card open, another tab is stored, and the one
 * in use closes the card. The fold is the one `toggleFold` keeps, so the fold button and `/spendometer fold` agree.
 */
export async function pressTab($: EngineInterface, id: Tab): Promise<void> {
  const view = viewOf(await cacheFacts($), await $.clock.now())
  const stored = await read($, fold)
  const open = view !== null && (stored && stored.mode === view.mode ? stored.open : view.mode === 'cold')
  const same = id === (await tabOf($))
  if (!open || !same) await $.store.set(TAB_KEY, id)
  if (!open || same) await toggleFold($)
  else $.ui.invalidate('ui.render')
}

/**
 * What each button does, shown on hover. A box that is hidden until hovered, drawn above the
 * button with a rounded frame: the way Claude Code's own built-in mods show hover text. Buttons
 * have no tooltip of their own. Drawing surfaces only; the terminal has no pointer to hover with.
 * A tip anchored at a button's right edge grows to the left: on a narrow band TIP_COLS ran past the band's left
 * edge and cut the text off (2026-11-26), so it takes at most what the band leaves left of the buttons.
 */
export function tip(c: TipCtx, text: string, side: 'left' | 'right' = 'right') {
  const { Box, Text, Svg } = c.ui
  const rightTipCols = Math.max(16, Math.min(TIP_COLS, c.columns - 16))
  return Svg ? (
    <Box
      position="absolute"
      bottom={TIP_LIFT}
      {...(side === 'left' ? { left: 0 } : { right: 0 })}
      display="none"
      hover={{ display: 'flex' }}
      flexDirection="column"
      borderStyle="round"
      borderDimColor
      paddingX={1}
      width={side === 'left' ? TIP_COLS : rightTipCols}
    >
      <Text wrap="wrap">{text}</Text>
    </Box>
  ) : null
}

/**
 * Keep warm is a status mark, not a button: the pace's green bold ✓ (the same OK colour and meaning) while it is on,
 * nothing while it is off. /keepwarm turns it on and off. The hover says what the mark means.
 */
export function keepMarkOf(c: TipCtx, keepView: KeepView | null) {
  const { Box, Text } = c.ui
  return keepView === null || !keepView.on ? null : (
    <Box key="keep" flexShrink={0} alignItems="flex-start" marginLeft={BUTTON_GAP}>
      <Text key="keep-warm" color={OK} bold>✓</Text>
      {tip(c, keepTip())}
    </Box>
  )
}

/** The fold button, with the hover that says what it does now. */
export function foldButtonOf($: EngineInterface, c: TipCtx, open: boolean) {
  const { Box, Button } = c.ui
  const toggle = () => toggleFold($)
  return (
    <Box key="fold" flexShrink={0} alignItems="flex-start" marginLeft={BUTTON_GAP}>
      <Button key="cache-fold" label={open ? '−' : '+'} onPress={toggle} />
      {tip(c, open ? 'Hide the cache card (or /spendometer fold).' : 'Show the cache card (or /spendometer fold): the cache, the spend, pace and the tabs.')}
    </Box>
  )
}

const TAB_GLYPH: Record<Tab, string> = { overview: '📊', context: '🧠', cost: '💰' }
const TAB_TIPS: Record<Tab, string> = {
  overview: 'Overview: the pace of each usage window against its reset, what delegating to subagents saved, and what this thread has cost.',
  context: 'Context: how big the conversation is, how many turns are left, and what tool output filled it.',
  cost: 'Cost: the cache discount, the cost of a message and what each model cost.',
}
/** Wide row: the emoji and the word; elsewhere the emoji alone. The tab in use is marked by dimming the others (dimColor). */
export const tabLabel = (id: Tab, isWide: boolean) => (isWide ? `${TAB_GLYPH[id]} ${TAB_NAMES[id]}` : TAB_GLYPH[id])

/** The card's tabs, whenever the fold button shows (open or closed): an emoji each, with its word on the wide row. */
export function tabButtons($: EngineInterface, c: TipCtx, tab: Tab, isWide: boolean) {
  const { Box, Button } = c.ui
  return TABS.map(id => (
    <Box key={`tab-${id}`} flexShrink={0} alignItems="flex-start" marginLeft={BUTTON_GAP}>
      <Button
        key={`tab-${id}-button`}
        label={tabLabel(id, isWide)}
        dimColor={id !== tab}
        onPress={() => pressTab($, id)}
      />
      {tip(c, TAB_TIPS[id])}
    </Box>
  ))
}
