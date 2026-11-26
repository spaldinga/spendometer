// The band's settings in the store: what the render reads and `/spendometer` writes.

import type { EngineInterface } from 'claude-code'

import { DEFAULT_THEME, themeIdOf } from '../activity/progress/themes'
import type { ThemeId } from '../activity/progress/themes'

/** The progress row's drawing theme, saved account-wide: an id from THEME_IDS. */
export const THEME_KEY = 'progressTheme'

/** The progress theme in the store: an id it knows, else the default. */
export async function themeOf($: EngineInterface): Promise<ThemeId> {
  try {
    const v = await $.store.get(THEME_KEY)
    return themeIdOf(v) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}
