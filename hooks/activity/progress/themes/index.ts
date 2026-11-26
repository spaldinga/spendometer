import { calmPace, calmWalk } from './calm'
import { vitalsPace, vitalsWalk } from './vitals'
import { bridgePace, bridgeWalk } from './bridge'
import { wakePace, wakeWalk } from './wake'
import { dialPace, dialWalk } from './dial'
import { cometPace, cometWalk } from './comet'
import type { Theme } from './kit'

// The progress row's themes. Each is a pair of pure functions: `walk` draws a request with a step list
// (or a report) at `W` pixels, `pace` draws a request that is working with no list. Colours are only the
// band's own constants and the console's, so svgDoc's light style covers every drawing. Text is
// measured by estimate (0.6 em a character, 0.7 for bold capitals), as band/card.ts does; the step names
// are cut with … to what the width leaves. A colour that changes in an animation would escape the light
// style (it swaps attributes, not animated values), so a changing colour is two shapes and an
// animated opacity.

// ---------- The themes ----------

export const THEME_IDS = ['calm', 'vitals', 'bridge', 'wake', 'dial', 'comet'] as const
export type ThemeId = (typeof THEME_IDS)[number]
export const DEFAULT_THEME: ThemeId = 'comet'
/** What `/spendometer progress` lists for each theme: its name and what it does. */
export const THEME_NAMES: Record<ThemeId, string> = {
  calm: 'Calm: one quiet segment per step, the current one breathing. The least motion',
  vitals: 'Vitals: a monitor pen writes each finished step as a heartbeat; a heart beats at the step in progress',
  bridge: "Bridge: a starship console, every step a labelled panel, the active one blinking",
  wake: 'Wake: the step names as breadcrumbs, riding a wave that swells under the current step',
  dial: 'Dial: every step a dial that fills like a clock hand; full dials are done',
  comet: 'Comet: a comet streaks to the current step and sets it ringing',
}

export const THEMES: Record<ThemeId, Theme> = {
  calm: {
    walk: calmWalk,
    pace: calmPace,
    names: false,
    info: false,
  },
  vitals: { walk: vitalsWalk, pace: vitalsPace, names: true, info: false },
  bridge: { walk: bridgeWalk, pace: bridgePace, names: true, info: true },
  wake: { walk: wakeWalk, pace: wakePace, names: true, info: false },
  dial: { walk: dialWalk, pace: dialPace, names: true, info: false },
  comet: { walk: cometWalk, pace: cometPace, names: true, info: false },
}

/** The ids the first version used, still accepted: a saved choice or a typed one keeps working. */
const OLD_IDS: Record<string, ThemeId> = { segments: 'calm', heartbeat: 'vitals', console: 'bridge', wave: 'wake', pie: 'dial' }

export const isThemeId = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v)

/** A theme id from what was saved or typed, old ids included; null for anything else. */
export const themeIdOf = (v: unknown): ThemeId | null =>
  isThemeId(v) ? v : typeof v === 'string' && Object.prototype.hasOwnProperty.call(OLD_IDS, v) ? OLD_IDS[v] : null
