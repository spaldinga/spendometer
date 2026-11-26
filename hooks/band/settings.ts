// The `/spendometer` command: the band's settings. It reads and writes them in the store, asks the owning feature for
// its own keywords (`keepwarm`), and redraws the band after a change.

import type { EngineInterface } from 'claude-code'

import { DEFAULT_THEME, THEME_IDS, THEME_NAMES, themeIdOf } from '../activity/progress/themes'
import type { ThemeId } from '../activity/progress/themes'
import { keepOf } from '../cost/cache/keepwarm/lifecycle'
import { keepwarmCommand, keepwarmStatus } from '../cost/cache/keepwarm/command'
import type { Keep } from '../cost/cache/keepwarm/state'
import { readSpend, spendLine } from '../cost/spend/record'
import { TAB_KEY, tabOf, toggleFold } from './buttons'
import { TABS } from './card'
import type { Tab } from './card'
import { widthLine } from './width-note'

/** The mod's own settings command: one name, so a rename touches one line. */
export const SETTINGS = 'spendometer'
export const HOLD_KEY = 'hold'
/** The progress row's drawing theme, saved account-wide: an id from THEME_IDS. */
export const THEME_KEY = 'progressTheme'

/** A switch kept in the store: its saved value, or `fallback` when none was saved or the store cannot be read. */
export async function switchOf($: EngineInterface, key: string, fallback: boolean): Promise<boolean> {
  try {
    const v = await $.store.get(key)
    return typeof v === 'boolean' ? v : fallback
  } catch {
    return fallback
  }
}

/** The progress theme in the store: an id it knows, else the default. */
export async function themeOf($: EngineInterface): Promise<ThemeId> {
  try {
    const v = await $.store.get(THEME_KEY)
    return themeIdOf(v) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

const TAB_WHAT: Record<Tab, string> = { overview: 'pace, delegation and spend', context: 'conversation size and tool output', cost: 'cache discount, cost per message and by model' }
const tabList = (now: Tab): string =>
  `Card tabs, pick one with /${SETTINGS} tab <name>:\n` + TABS.map(id => `- ${id === now ? `**${id}**` : id}${id === now ? ' (in use)' : ''}: ${TAB_WHAT[id]}`).join('\n')

// The answer is shown as markdown: a plain list, the theme in use in bold. A leading * marked it before, and
// markdown read that one line as a bullet with the lines after it folded into it.
const themeList = (now: ThemeId): string =>
  `Progress themes, pick one with /${SETTINGS} progress <id>:\n` +
  THEME_IDS.map(id => {
    const tags = [id === now ? 'in use' : '', id === DEFAULT_THEME ? 'default' : ''].filter(Boolean).join(', ')
    return `- ${id === now ? `**${id}**` : id}${tags ? ` (${tags})` : ''}: ${THEME_NAMES[id].replace(/^[^:]+: /, '')}`
  }).join('\n')

/** The settings command's answer to `args`; a change is saved and the band redrawn. */
export async function settingsAnswer($: EngineInterface, kw: Keep, args: string): Promise<string> {
  const [name, value, ...rest] = args.trim().split(/\s+/)
  const usage = `Usage: /${SETTINGS} fold | cost | tab [name] | progress [id] | hold on|off | keepwarm [on|off|status|90m|always]. With no argument it shows the settings.`
  // The same answer as the typed /keepwarm, for people who drive everything from this command. Beside cache-tax it is its own.
  if (name === 'keepwarm') {
    if ((await keepOf($, kw)) === null) return 'keepwarm: cache-tax is installed and in charge; use its own /keepwarm'
    return keepwarmCommand($, kw, args.trim().slice('keepwarm'.length))
  }
  const key = name === 'hold' ? HOLD_KEY : null
  if (key !== null && rest.length === 0 && (value === 'on' || value === 'off')) {
    await $.store.set(key, value === 'on')
    $.ui.invalidate('ui.render')
    return `${name}: ${value}`
  }
  // A command's answer is text the model reads, which a log line is not.
  if (name === 'cost' && value === undefined) {
    const s = await readSpend($)
    return s && s.main + s.subs > 0 ? spendLine(s) : 'no cost recorded for this conversation yet'
  }
  // The same toggle as the band's fold button, for the keyboard: a mod cannot catch a key typed in the prompt.
  if (name === 'fold' && value === undefined) {
    const now = await toggleFold($)
    return now === null ? 'no cache card yet: it comes with the first reply' : `cache card: ${now ? 'open' : 'closed'}`
  }
  if (name === 'tab' && rest.length === 0) {
    const picked = TABS.find(id => id === value)
    if (picked) {
      await $.store.set(TAB_KEY, picked)
      $.ui.invalidate('ui.render')
      return `tab: ${picked}`
    }
    return tabList(await tabOf($))
  }
  if (name === 'progress' && rest.length === 0) {
    const picked = value === undefined ? null : themeIdOf(value)
    if (picked) {
      await $.store.set(THEME_KEY, picked)
      $.ui.invalidate('ui.render')
      return `progress: ${picked}`
    }
    return themeList(await themeOf($))
  }
  if (name !== '' && name !== 'status') return usage
  const hold = await switchOf($, HOLD_KEY, true)
  return (
    `hold: ${hold ? 'on' : 'off'} - holds risky git commands (hard reset, clean, force push) until you answer in the band\n` +
    `keepwarm: ${(await keepOf($, kw)) === null ? 'cache-tax is in charge' : (await keepwarmStatus($, kw)).replace(/^keepwarm (is )?/, '')}\n` +
    `tab: ${await tabOf($)} - the card shows one tab at a time: overview, context or cost\n` +
    `progress: ${await themeOf($)}\n` +
    widthLine()
  )
}
