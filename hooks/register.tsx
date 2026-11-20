import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheFacts, Ending, Fold, Progress, Spend, Spent, Turn, Window, Worker } from '../types'
import { LIST_TOOLS, REPORT_TOOL, afterListCall, afterReport, barText, fmtElapsed, labelOf, pulseText } from './progress'
import { BAR_H, crewSvg } from './progress-art'
import { DEFAULT_THEME, THEMES, THEME_IDS, THEME_NAMES, themeIdOf } from './progress-themes'
import type { ThemeId } from './progress-themes'
import { classify, measure as measureRisk, refusal } from './guard'
import type { Report, Risk } from './guard'
import {
  EMPTY, HUE, INK, ORANGE, ROBO_SIZE, TTL_MIN, TTL_MS, WORD, YELLOW,
  MODELS, bandPx, cardSvg, chipSvg, coldCost, costOf, familyOf, fmtIdle, fmtReset, mineModel, roboSvg, turnCost, usd, warmCost,
} from './cache-art'
import type { CacheView, PaceRow, TurnUsage } from './cache-art'
import { metricsOf, nextGrowth, putSpan } from './metrics'
import { DAY_PREFIX, dayKey, isOldDay, lastDays } from './days'
import { WINDOW_MS, paceOf } from './pace'
import {
  BLOCK_MARGIN, BUTTON_GAP, CACHE_MARGIN, DESKTOP_CHAR_COLS, FOLD_COLS, LABEL_COLS, ROBO_CHIP_COLS, ROW_PAD,
  CHIP_COLS, COMPACT_BUTTON_COLS, COMPACT_CHAR_COLS, COMPACT_MARGIN, COMPACT_STEPS, ROBO_COLS, TEXT_CHIP_COLS, WAITING_COLS, WAITING_ROW_COLS, WAITING_SPEND_GAP, WIDE_LABEL_MARGIN, blockCols, buttonCols, cardColsOf, DESKTOP_COL_PX, fitOpen, ROW_PX, layoutOf, rowsOf, textCols,
} from './layout'

// A band above the prompt in a warm dark look: card surface, cream text,
// dot-matrix bars. Shows how much of each usage window is LEFT, 7-day first, then
// 5-hour; 7D is orange, 5H is yellow; a window under 15% adds a bold LOW.
//
// After the first reply it also shows the prompt cache: WARM (red, Robo bobbing)
// for an hour after the last request, then COLD (blue, Robo frozen) with what the
// next message costs to re-cache. The arrow button folds the card; warm starts hasCache,
// cold starts open, and a choice holds until the cache flips. Zero token cost:
// it reads the engine's own figures and draws.
//
// With cache-tax installed it also carries that mod's keep-warm switch: one button,
// on or off for every session, off until pressed. A keep-warm ping that really read the
// cache starts the hour again here too, so the band and cache-tax agree.

const CELLS = 10
const LOW_AT = 15
const TIGHT_CELLS = 6
/** How often the band redraws, so the countdown and the warm-to-cold flip stay current. */
const TICK_MS = 30_000
/** cache-tax's command, and the key this band remembers the switch under, for every session. */
const KEEPWARM = 'keepwarm'
const KEEP_KEY = 'keep'
/** The mod's own settings command: one name, so a rename touches one line. */
const SETTINGS = 'wavebar'
const WRAP_KEY = 'wrapUp'
const HOLD_KEY = 'hold'
/** The progress row's drawing theme, saved account-wide: an id from THEME_IDS. */
const THEME_KEY = 'progressTheme'
/** The cost per session lives in the store under this prefix; entries not written for this long are dropped at session start. */
const SPEND_PREFIX = 'spend:'
const SPEND_KEEP_MS = 30 * 24 * 60 * 60 * 1000
/** The cache facts per conversation, so a resume that never reaches the band (state is cleared) still knows them. */
const CACHE_PREFIX = 'cache:'
/** Pace records an older version kept per window kind; no longer used, deleted at session start. */
const OLD_PACE_PREFIX = 'pace:'
/** Daily totals (`day:YYYY-MM-DD`) older than this are dropped at session start. */
const DAY_KEEP_DAYS = 30

const windows = atom({ plugin: 'wavebar', key: 'windows' } as const, [] as Window[])
const cache = atom({ plugin: 'wavebar', key: 'cache' } as const, null as CacheFacts | null)
const fold = atom({ plugin: 'wavebar', key: 'fold' } as const, null as Fold | null)
const progress = atom({ plugin: 'wavebar', key: 'progress' } as const, null as Progress | null)
const turn = atom({ plugin: 'wavebar', key: 'turn' } as const, null as Turn | null)
const crew = atom({ plugin: 'wavebar', key: 'crew' } as const, [] as Worker[])
const ending = atom({ plugin: 'wavebar', key: 'ending' } as const, null as Ending)
/** Subagent cost since the last main turn finished: it joins the next main turn's `last`. */
const subsSince = atom({ plugin: 'wavebar', key: 'subsSince' } as const, 0)
/** When the main thread last sent a request that was not a keep-warm ping (clock ms), or null before the first. */
const realAt = atom({ plugin: 'wavebar', key: 'realAt' } as const, null as number | null)

/** The conversation's cost as one line for the transcript, so a debrief can quote it instead of leaving cost empty. */
export const spendLine = (s: Spend): string =>
  `this conversation has cost about ${usd(s.main + s.subs)} so far (main session ${usd(s.main)}, subagents ${usd(s.subs)}). ` +
  'An estimate from token counts at list prices; not a bill.'

/** This session's saved cost, or null when there is none or the id or the store cannot be read. */
const readSpend = async ($: EngineInterface): Promise<Spent | null> => {
  try {
    const s = (await $.store.get(SPEND_PREFIX + (await $.session.id()))) as Partial<Spent> | null | undefined
    if (!s || typeof s.main !== 'number' || typeof s.subs !== 'number') return null
    const out: Spent = { main: s.main, subs: s.subs, last: typeof s.last === 'number' ? s.last : 0, at: typeof s.at === 'number' ? s.at : 0 }
    // Records from before keep-warm savings were tracked have neither field.
    if (typeof s.pings === 'number') out.pings = s.pings
    if (typeof s.saved === 'number') out.saved = s.saved
    // The metric figures arrived later still; each is kept only when it is a number.
    for (const k of ['turns', 'paidTurns', 'readTok', 'inTok', 'ctxPrev', 'growth', 'totTok', 'subsAtMain', 'subsPaid'] as const) if (typeof s[k] === 'number') out[k] = s[k]
    for (const k of ['byType', 'byModel'] as const) {
      const src = s[k]
      if (src && typeof src === 'object') {
        const by: Record<string, number> = {}
        for (const [name, c] of Object.entries(src)) if (typeof c === 'number') by[name] = c
        out[k] = by
      }
    }
    if (Array.isArray(s.spans)) {
      out.spans = s.spans
        .filter((x): x is [number, number] => Array.isArray(x) && x.length === 2 && Number.isFinite(x[0]) && Number.isFinite(x[1]))
        .map(x => [x[0], x[1]] as [number, number])
    }
    return out
  } catch {
    return null
  }
}

/** A session record from `was`, its keep-warm and metric figures carried over, stamped `at`. */
const recordOf = (was: Spent | null, at: number): Spent => {
  const next: Spent = { ...(was ?? { main: 0, subs: 0, last: 0 }), at }
  if (was?.byType) next.byType = { ...was.byType }
  if (was?.byModel) next.byModel = { ...was.byModel }
  if (was?.spans) next.spans = was.spans.map(s => [s[0], s[1]] as [number, number])
  return next
}

/** Adds keep-warm figures (what a ping cost, what a ping saved) to this session's record. Never touches the total. */
const addKeepWarm = async ($: EngineInterface, add: { pings?: number; saved?: number }): Promise<void> => {
  try {
    const key = SPEND_PREFIX + (await $.session.id())
    const next = recordOf(await readSpend($), await $.clock.now())
    if (add.pings) next.pings = (next.pings ?? 0) + add.pings
    if (add.saved) next.saved = (next.saved ?? 0) + add.saved
    await $.store.set(key, next)
    $.ui.invalidate('ui.render')
  } catch { /* the card shows no savings; the ping goes on */ }
}

/** The last seven days' totals, oldest first, 0 for a day with none (or an unreadable one). */
const readDays = async ($: EngineInterface, now: number): Promise<number[]> => {
  const out: number[] = []
  for (const key of lastDays(now)) {
    try {
      const v = await $.store.get(key)
      out.push(typeof v === 'number' && v > 0 ? v : 0)
    } catch {
      out.push(0)
    }
  }
  return out
}

/** Adds a finished turn's cost to this session's saved figures. A failing store or id loses the figure, never the turn. */
const addSpend = async (
  $: EngineInterface,
  paid: number,
  isMain: boolean,
  usage?: TurnUsage | null,
  type = 'agent',
  span?: { start: number; end: number; prevEnd?: number },
): Promise<void> => {
  try {
    const key = SPEND_PREFIX + (await $.session.id())
    const was = await readSpend($)
    const now = await $.clock.now()
    const next = recordOf(was, now)
    // Today's total across sessions. Read-modify-write: when two sessions write at the same moment one
    // of the two additions is lost, which is acceptable for a figure that is an estimate anyway.
    try {
      const dk = dayKey(now)
      const today = await $.store.get(dk)
      await $.store.set(dk, (typeof today === 'number' ? today : 0) + paid)
    } catch { /* the day's total misses this turn */ }
    // Per model family, and all tokens: the card's split by model and the effective price per million tokens.
    const family = familyOf(usage?.model)
    if (family) next.byModel = { ...next.byModel, [family]: (next.byModel?.[family] ?? 0) + paid }
    next.totTok =
      (next.totTok ?? 0) + (usage?.input_tokens || 0) + (usage?.output_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0)
    if (isMain) {
      next.main += paid
      // The metric row's figures: the priced main turns, what they cost and the input they read.
      next.turns = (next.turns ?? 0) + 1
      next.paidTurns = (next.paidTurns ?? 0) + paid
      const cached = usage?.cache_read_input_tokens || 0
      next.readTok = (next.readTok ?? 0) + cached
      next.inTok = (next.inTok ?? 0) + (usage?.input_tokens || 0) + cached + (usage?.cache_creation_input_tokens || 0)
      next.last = paid + (await read($, subsSince))
      await update($, subsSince, () => 0)
    } else {
      next.subs += paid
      next.byType = { ...next.byType, [type]: (next.byType?.[type] ?? 0) + paid }
      // The same tokens at the main session's model; never below what they cost (a same-model or dearer subagent saves 0).
      const mainModel = (await cacheFacts($))?.model ?? null
      const atMain = mainModel && usage ? (turnCost({ ...usage, model: mainModel }) ?? paid) : paid
      next.subsAtMain = (next.subsAtMain ?? 0) + Math.max(atMain, paid)
      next.subsPaid = (next.subsPaid ?? 0) + paid
      if (span) next.spans = putSpan(next.spans, span.start, span.end, span.prevEnd)
      await update($, subsSince, n => n + paid)
    }
    await $.store.set(key, next)
    $.ui.invalidate('ui.render')
  } catch { /* the band shows no cost; the turn goes on */ }
}

/** Notes the context size at the end of a main turn, and how fast it grows: the moving average of its increases. */
const addContext = async ($: EngineInterface): Promise<void> => {
  try {
    const tokens = (await cacheFacts($))?.tokens ?? 0
    if (tokens <= 0) return
    const was = await readSpend($)
    // A conversation with no priced turn yet has nothing to attach the context to.
    if (!was) return
    const next = recordOf(was, await $.clock.now())
    const growth = nextGrowth(next.growth, next.ctxPrev, tokens)
    if (growth !== undefined) next.growth = growth
    next.ctxPrev = tokens
    await $.store.set(SPEND_PREFIX + (await $.session.id()), next)
  } catch { /* the runway waits for the next turn */ }
}

/** A switch kept in the store: its saved value, or `fallback` when none was saved or the store cannot be read. */
const switchOf = async ($: EngineInterface, key: string, fallback: boolean): Promise<boolean> => {
  try {
    const v = await $.store.get(key)
    return typeof v === 'boolean' ? v : fallback
  } catch {
    return fallback
  }
}

/** The progress theme in the store: an id it knows, else the default. */
const themeOf = async ($: EngineInterface): Promise<ThemeId> => {
  try {
    const v = await $.store.get(THEME_KEY)
    return themeIdOf(v) ?? DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

const themeList = (now: ThemeId): string =>
  'progress themes:\n' + THEME_IDS.map(id => `${id === now ? '*' : ' '} ${id} - ${THEME_NAMES[id]}${id === DEFAULT_THEME ? ' (default)' : ''}`).join('\n')

/** The settings command's answer to `args`; a change is saved and the band redrawn. */
const settingsAnswer = async ($: EngineInterface, args: string): Promise<string> => {
  const [name, value, ...rest] = args.trim().split(/\s+/)
  const usage = `Usage: /${SETTINGS} [status] | cost | fold | progress [id] | wrapup on|off | hold on|off`
  const key = name === 'wrapup' ? WRAP_KEY : name === 'hold' ? HOLD_KEY : null
  if (key !== null && rest.length === 0 && (value === 'on' || value === 'off')) {
    await $.store.set(key, value === 'on')
    $.ui.invalidate('ui.render')
    return `${name}: ${value}`
  }
  // A command's answer is text the model reads, which a log line is not: this is how the cost reaches a debrief.
  if (name === 'cost' && value === undefined) {
    const s = await readSpend($)
    return s && s.main + s.subs > 0 ? spendLine(s) : 'no cost recorded for this conversation yet'
  }
  // The same toggle as the band's fold button, for the keyboard: a mod cannot catch a key typed in the prompt.
  if (name === 'fold' && value === undefined) {
    const now = await toggleFold($)
    return now === null ? 'no cache card yet: it comes with the first reply' : `cache card: ${now ? 'open' : 'closed'}`
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
  const wrap = await switchOf($, WRAP_KEY, false)
  const hold = await switchOf($, HOLD_KEY, true)
  return (
    `wrapup: ${wrap ? 'on' : 'off'} - a Wrap up button that runs the debrief skill and lets this conversation go cold\n` +
    `hold: ${hold ? 'on' : 'off'} - holds risky git commands (hard reset, clean, force push) until you answer in the band\n` +
    `progress: ${await themeOf($)}\n` +
    widthLine()
  )
}

/**
 * The width the band was last drawn at, as the engine gave it, and the layout it chose: shown by the status
 * command, so a layout that does not fit can be traced to the width the band was given.
 */
let lastWidth: { body: number | null; viewport: number | null; used: number; kind: string; need: string; fit?: string } | null = null
const widthLine = (): string =>
  lastWidth === null
    ? 'band: not drawn yet since the mod loaded'
    : `band: drawn at ${lastWidth.used} columns (bodyColumns ${lastWidth.body ?? 'none'}, viewport ${lastWidth.viewport ?? 'none'}), layout ${lastWidth.kind}; estimated need ${lastWidth.need}${lastWidth.fit ? `; open card ${lastWidth.fit}` : ''}`

/** The skill a wrap-up runs, and the window it leaves keep-warm: too short for a ping, so this conversation stops being held. */
const DEBRIEF = 'debrief'
const WRAP_WINDOW = '1m'
/** cache-tax re-arms its window when a turn completes; the wrap-up's short one goes in after that. */
const WRAP_DELAY_MS = 2000
const CREW_MAX = 40
const CREW_SHOWN = 5
/** How wide a button's hover text is, in columns. */
const TIP_COLS = 44

/** The step's name beside the bar is cut to this, so the bar keeps its room. */
const NOTE_MAX = 32
const BAR_MIN_PX = 140
/** A column is 12 px; the row's words are measured at COMPACT_CHAR_COLS of it a character. */
const COL_PX_FULL = 12

const NAMES: Record<string, string> = { seven_day: '7D', five_hour: '5H', spend_limit: 'SPEND' }
const LONG: Record<string, string> = { seven_day: '7-day limit', five_hour: '5-hour limit', spend_limit: 'Spend limit' }
const ORDER: Record<string, number> = { seven_day: 0, five_hour: 1 }
const COLORS: Record<string, string> = { seven_day: ORANGE, five_hour: YELLOW }

const clean = (list: readonly Window[]): Window[] =>
  list
    .map(w => ({ kind: w.kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt }))
    .sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9))


/** The rows the card draws: each window with a colour, its time to reset and its pace over the window so far. */
const trackPace = (list: readonly Window[], now: number): PaceRow[] => {
  const rows: PaceRow[] = []
  for (const w of list) {
    if (!COLORS[w.kind]) continue
    rows.push({
      label: NAMES[w.kind],
      color: COLORS[w.kind],
      untilResetMs: w.resetsAt ? Date.parse(w.resetsAt) - now : null,
      pace: WINDOW_MS[w.kind] ? paceOf(w, WINDOW_MS[w.kind], now) : null,
    })
  }
  return rows
}
const dots = (left: number, cells: number): { on: string; off: string } => {
  const n = Math.max(0, Math.min(cells, Math.round((left / 100) * cells)))
  return { on: '●'.repeat(n), off: '·'.repeat(cells - n) }
}


/** The cache figures of one keep-warm ping, as the model reports them. */
export type PingUsage = { cache_read_input_tokens: number; cache_creation_input_tokens: number }

/**
 * Whether a ping's usage shows the prompt cache was still alive: it read the
 * prefix from the cache and wrote next to nothing. Only then does the band start
 * its hour again; a ping that paid to write the prefix found the cache gone.
 */
export const pingKeptCacheWarm = (usage: PingUsage | null | undefined): boolean => {
  if (!usage) return false
  // The same rule cache-tax scores its own pings by: a write of a tenth of the read or more means the prefix broke.
  return usage.cache_read_input_tokens > 0 && usage.cache_creation_input_tokens < 0.1 * usage.cache_read_input_tokens
}

/** What the cache drawings read, or null until a request and its context size are known. */
export const viewOf = (c: CacheFacts | null, now: number): CacheView | null => {
  if (!c || c.lastAt <= 0 || c.tokens <= 0) return null
  const idleMs = Math.max(0, now - c.lastAt)
  return {
    mode: idleMs >= TTL_MS ? 'cold' : 'warm',
    idle: fmtIdle(idleMs),
    idleMin: Math.floor(idleMs / 60000),
    tokens: c.tokens,
    window: c.window,
    mine: familyOf(c.model),
  }
}

const pull = async ($: EngineInterface): Promise<void> => {
  const u = await $.session.usage()
  await update($, windows, () => clean(u.rateLimits))
}

/** The cache facts of this conversation as last saved, or null when none, the id or the store cannot be read. */
const readStoredCache = async ($: EngineInterface): Promise<CacheFacts | null> => {
  try {
    const c = (await $.store.get(CACHE_PREFIX + (await $.session.id()))) as Partial<CacheFacts> | null | undefined
    if (!c || typeof c.lastAt !== 'number' || typeof c.tokens !== 'number') return null
    return { lastAt: c.lastAt, tokens: c.tokens, window: typeof c.window === 'number' ? c.window : 0, model: typeof c.model === 'string' ? c.model : null }
  } catch {
    return null
  }
}

/**
 * Updates the cache facts and saves them under this conversation's id; a failing id or store only loses the
 * saving. The saved entry is never deleted here: it is what tells warm from cold after a restart, before the
 * first request. A /clear starts a conversation with a new id, so an old entry is simply not read again, and
 * entries untouched for a month are pruned at session start.
 */
const putCache = async ($: EngineInterface, f: (c: CacheFacts | null) => CacheFacts | null): Promise<void> => {
  const was = (await read($, cache)) ?? (await readStoredCache($))
  await update($, cache, () => f(was))
  try {
    const key = CACHE_PREFIX + (await $.session.id())
    const c = await read($, cache)
    if (c) await $.store.set(key, { lastAt: c.lastAt, tokens: c.tokens, window: c.window, model: c.model })
  } catch { /* the facts stay in the atom for this run */ }
}

/** The cache facts as the band holds them now: the atom, else the saved entry. */
const cacheFacts = async ($: EngineInterface): Promise<CacheFacts | null> => (await read($, cache)) ?? (await readStoredCache($))

/**
 * Opens the cache card if it is closed, closes it if open: the fold button and `/wavebar fold`.
 * The fold is kept per cache state (a cold cache opens by default), as the button has always done. Returns
 * whether the card is now open, or null while there is no card yet.
 */
const toggleFold = async ($: EngineInterface): Promise<boolean | null> => {
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

/** The usage windows straight from the engine, or none when it cannot say. */
const liveWindows = async ($: EngineInterface): Promise<Window[]> => {
  try {
    return clean((await $.session.usage()).rateLimits)
  } catch {
    return []
  }
}


/** Fresh context figures from the engine onto the cache facts, when it has them. */
const measure = async ($: EngineInterface, lastAt: number | null, model: string | null): Promise<void> => {
  const u = await $.session.usage()
  const m = model ?? (await $.session.model())
  await putCache($, c => ({
    lastAt: lastAt ?? c?.lastAt ?? 0,
    tokens: u.context.tokens && u.context.tokens > 0 ? u.context.tokens : (c?.tokens ?? 0),
    window: u.context.window || c?.window || 0,
    model: m || c?.model || null,
  }))
}

/** Whether a slash command of that name is there to run. */
const hasCommand = async ($: EngineInterface, name: string): Promise<boolean> => {
  try {
    return (await $.command.list()).some(c => c.name === name)
  } catch {
    return false
  }
}

/** The switch as saved: on, off, or null when cache-tax is not there to switch. */
const keepState = async ($: EngineInterface): Promise<boolean | null> => {
  try {
    if (!(await hasCommand($, KEEPWARM))) return null
    return (await $.store.get(KEEP_KEY)) === true
  } catch {
    return null
  }
}

/** A slash command, fired and not awaited: one run from inside a hook the turn waits on can hang. */
const fire = ($: EngineInterface, command: string, args: string): void => {
  void Promise.resolve($.command.run({ command, args })).catch(() => {})
}

/** The running subagents as the band names them: "Explore 4, sonnet-coder 12", kind and requests made. */
export const crewText = (running: Worker[]): string => {
  const s = running.map(w => `${w.type} ${w.steps}`).join(', ')
  return s.length > CREW_MAX ? s.slice(0, CREW_MAX - 1) + '…' : s
}

/** Saves the switch and tells cache-tax: always keeps every session warm, off stops it for good. */
const setKeep = async ($: EngineInterface, isOn: boolean): Promise<void> => {
  await $.store.set(KEEP_KEY, isOn)
  $.ui.invalidate('ui.render')
  fire($, KEEPWARM, isOn ? 'always' : 'off')
}

// ---------- Hold and show ----------
/** The shells whose command lines are read. */
const SHELLS = ['Bash', 'PowerShell'] as const
const HOLD_LIMIT_MS = 10 * 60 * 1000
/** A wait that came back sooner than this did not wait, so it is not used to hold. */
const WAIT_FLOOR_MS = 100
/**
 * A hook has seconds of its own time, but time inside a `$` call is free, so a hold
 * waits in a short process: `sleep` where there is one, and on Windows, where there
 * is not, one second of `ping`.
 */
const WAITS: readonly (readonly string[])[] = [['sleep', '0.5'], ['ping', '-n', '2', '127.0.0.1']]

type Held = { command: string; risk: Risk; report: Report | null; decision: 'proceed' | 'cancel' | null }
/** The call being held, or null. One at a time; a second risky call waits its turn. */
/**
 * The 30 s redraw. A reload loses this flag and the old timer with it, and a resume may skip session.start,
 * so the timer is armed from the start, the first request and the first render; the flag keeps it to one.
 */
let ticking = false
const arm = ($: EngineInterface): void => {
  if (ticking) return
  ticking = true
  try {
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
  } catch {
    ticking = false
  }
}

let held: Held | null = null
/** Which of WAITS works on this machine: unknown until tried, -1 when none does. */
let waitAt: number | null = null

/** Waits a moment inside a process. False when this machine has no way to: then nothing can be held. */
async function waitTick($: EngineInterface): Promise<boolean> {
  for (let i = waitAt ?? 0; i < WAITS.length && waitAt !== -1; i++) {
    try {
      const before = await $.clock.now()
      const r = await $.process.run([...WAITS[i]], { timeoutMs: 5000 })
      if (r.exitCode === 0 && (await $.clock.now()) - before >= WAIT_FLOOR_MS) {
        waitAt = i
        return true
      }
    } catch { /* not on this machine: try the next */ }
    if (waitAt === i) break
  }
  waitAt = -1
  return false
}

/** For tests: forget the held call and which wait works. */
export const resetHold = (): void => {
  held = null
  waitAt = null
}

export const register: Register = on => {
  // A git command that throws work away is held until the person answers in the band.
  // Cancel, no answer and an interrupted turn refuse it. A machine that cannot hold,
  // or an error while holding, lets it through with a note: this is a second look,
  // and the permission rules are still in front of it.
  for (const tool of SHELLS) {
    on('tool.call', { tool }, async ($, e, next) => {
      const command = String(e.command ?? '')
      const risk = classify(command)
      if (risk === null) return next(e)
      // The hold is on unless /wavebar hold off said otherwise.
      if (!(await switchOf($, HOLD_KEY, true))) return next(e)
      const interrupted = { deny: refusal('the turn was interrupted', risk.label) }
      // `held` is claimed with no await between the check and the claim, so two waiting calls can't both get through.
      while (held !== null) {
        if (next.signal?.aborted) return interrupted
        if (!(await waitTick($))) break
      }
      if (waitAt === -1) {
        void Promise.resolve($.ui.log(`could not hold \`${risk.label}\` to show what it changes: this machine has no way to wait. It runs as usual.`)).catch(() => {})
        return next(e)
      }
      const mine: Held = { command, risk, report: null, decision: null }
      held = mine
      let why: string | null = null
      try {
        mine.report = await measureRisk($, risk, await $.session.cwd())
        $.ui.invalidate('ui.render')
        const startedAt = await $.clock.now()
        while (mine.decision === null && why === null) {
          if (next.signal?.aborted) why = 'the turn was interrupted'
          else if ((await $.clock.now()) - startedAt > HOLD_LIMIT_MS) why = 'no answer within 10 minutes'
          else if (!(await waitTick($))) break
        }
      } catch { /* an error while holding lets the command through, below */ } finally {
        if (held === mine) held = null
        $.ui.invalidate('ui.render')
      }
      const summary = mine.report?.summary ?? risk.label
      if (mine.decision === 'cancel') return { deny: refusal('the user pressed Cancel', summary) }
      if (why !== null) return { deny: refusal(why, summary) }
      if (mine.decision !== 'proceed') {
        void Promise.resolve($.ui.log(`could not keep holding \`${risk.label}\`, so it runs as usual.`)).catch(() => {})
      }
      return next(e)
    })
  }

  on('session.start', async ($, e, next) => {
    arm($)
    try { await pull($) } catch { /* the render reads the engine itself when the atom is empty */ }
    try {
      await $.command.register({
        name: SETTINGS,
        description: "Settings for the band above the prompt: the progress row's look, the Wrap up button and the hold for risky git commands",
        argumentHint: '[status] | cost | fold | progress [id] | wrapup on|off | hold on|off',
        immediate: true,
      })
    } catch { /* without the command the settings keep their defaults */ }
    // Saved costs of sessions not touched for a month are dropped.
    try {
      const nowMs = await $.clock.now()
      const cutoff = nowMs - SPEND_KEEP_MS
      for (const key of await $.store.keys()) {
        if (key.startsWith(CACHE_PREFIX)) {
          const c = (await $.store.get(key)) as Partial<CacheFacts> | null | undefined
          if (c && typeof c.lastAt === 'number' && c.lastAt < cutoff) await $.store.delete(key)
          continue
        }
        // Pace samples are no longer kept: the pace comes from the window's own length.
        if (key.startsWith(OLD_PACE_PREFIX)) {
          await $.store.delete(key)
          continue
        }
        if (key.startsWith(DAY_PREFIX)) {
          if (isOldDay(key, nowMs, DAY_KEEP_DAYS)) await $.store.delete(key)
          continue
        }
        if (!key.startsWith(SPEND_PREFIX)) continue
        const s = (await $.store.get(key)) as Partial<Spent> | null | undefined
        if (s && typeof s.at === 'number' && s.at < cutoff) await $.store.delete(key)
      }
    } catch { /* an entry that stays is only a few bytes */ }
    // For a request the model keeps no task list for. Listed up front: nobody goes looking for a progress tool.
    try {
      await $.tool.register({
        name: 'progress',
        description:
          'Report where you are in a multi-step request to the progress bar above the prompt. ' +
          'Call it once at the start with `total` (your plan in 3-8 steps), `done: 0` and a `note` naming the step in hand; ' +
          'again as each step finishes; and with `finished: true` at the end. Fields left out keep their value. ' +
          'Skip it whenever you keep a task list: the bar reads that by itself. Cheap and silent: it only draws a bar.',
        inputSchema: {
          type: 'object',
          properties: {
            total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
            done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
            note: { type: 'string', description: 'The step in hand, a few words.' },
            finished: { type: 'boolean', description: 'True once the request is done.' },
          },
        },
        isDeferred: false,
      })
    } catch { /* without the tool the bar still follows the task list */ }
    return next(e)
  })

  // The task list the main session keeps is its own account of where it is. The call goes on untouched.
  for (const tool of LIST_TOOLS) {
    on('tool.call', { tool }, async ($, e, next) => {
      if (!e.agentId) await update($, progress, p => afterListCall(p, tool, e as unknown as Record<string, unknown>))
      return next(e)
    }).catch(($, e, next) => next(e)) // a bar that fails to read a list never holds up the tool
  }

  on('tool.call', { tool: REPORT_TOOL }, async ($, e) => {
    // A subagent's steps are not the request's: only the main session moves the bar.
    if (e.agentId) return { result: 'ignored: only the main session reports progress' }
    const p = await update($, progress, prev => afterReport(prev, e as unknown as Record<string, unknown>))
    return { result: p ? `ok: ${labelOf(p).count}` : 'ok' }
  })

  on('command.run', { command: SETTINGS }, async ($, e) => ({ text: await settingsAnswer($, String(e.args ?? '')) }))

  // A typed /keepwarm always or off moves the switch too. cache-tax answers the command beneath.
  on('command.run', { command: KEEPWARM }, async ($, e, next) => {
    const word = String(e.args ?? '').trim().split(/\s+/)[0]
    if (word === 'always' || word === 'off') {
      await $.store.set(KEEP_KEY, word === 'always')
      $.ui.invalidate('ui.render')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A keep-warm ping is a fork of the main thread's last request. One that read the cache
  // kept it alive, so the hour starts again from when it was sent.
  on('model.fork', async ($, e, next) => {
    const sentAt = await $.clock.now()
    const r = await next(e)
    const reply = r && typeof r === 'object' && 'value' in r ? r.value : r
    if (reply && reply.isAnswered !== false && pingKeptCacheWarm(reply.usage)) {
      // What the ping cost, in this session's record: priced as the model of the cache facts, as it forked that request.
      const facts = await cacheFacts($)
      const cost = turnCost(reply.usage, facts?.model)
      await putCache($, c => (c ? { ...c, lastAt: sentAt } : c))
      if (cost !== null && cost > 0) await addKeepWarm($, { pings: cost })
    }
    return r
  })

  // /clear ends the conversation whose facts these are. It does reach mods, unlike a start event after it.
  on('session.end', async ($, e, next) => {
    // A /clear ends this conversation: the band forgets it. Its saved entry stays (the next conversation has
    // another id, so it is never read again) and is pruned after a month.
    if (e.reason === 'clear') {
      try {
        await update($, cache, () => null)
        await update($, fold, () => null)
      } catch { /* the band redraws from the next turn */ }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, windows, () => clean(e.rateLimits))
    }
    if (e.changed.includes('context') && e.context.tokens && e.context.tokens > 0) {
      const tokens = e.context.tokens
      await putCache($, c => (c ? { ...c, tokens, window: e.context.window || c.window } : c))
    }
    return next(e)
  })

  // A resumed or forked session knows how long it was away and how big it is.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear' || e.source === 'compact') {
      await putCache($, () => null)
      await update($, fold, () => null)
    } else if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      const now = await $.clock.now()
      const lastAt = now - e.seconds_since_last_response * 1000
      const window = (await $.session.usage()).context.window
      const model = typeof e.model === 'string' ? e.model : await $.session.model()
      const tokens = typeof e.context_tokens === 'number' ? e.context_tokens : 0
      await putCache($, () => ({ lastAt, tokens, window, model }))
    }
    return r
  }).catch(($, e, next) => next(e)) // a band that fails to seed never holds up the session

  // Each main-thread request reads or writes the cache, so its start resets the hour.
  on('turn.step', async function* ($, e, next) {
    arm($)
    if (!e.agentId) {
      const now = await $.clock.now()
      // Read before putCache overwrites lastAt. A turn that begins after the cache's hour would have found
      // it cold, but pings kept it warm: the difference between a cold re-cache and a cache read is saved.
      const before = e.index === 0 ? await cacheFacts($) : null
      const was = await read($, realAt)
      await update($, realAt, () => now)
      if (before && was !== null && now - was >= TTL_MS && now - before.lastAt < TTL_MS) {
        const m = MODELS.find(x => x.id === familyOf(before.model))
        const saved = m ? coldCost(m, before.tokens) - warmCost(m, before.tokens) : 0
        if (saved > 0) await addKeepWarm($, { saved })
      }
      await putCache($, c => ({ lastAt: now, tokens: c?.tokens ?? 0, window: c?.window ?? 0, model: c?.model ?? null }))
      // A turn's first request starts its clock, and a list finished last turn has had its moment.
      if (e.index === 0) {
        await update($, turn, () => ({ startedAt: now, steps: 1 }))
        await update($, progress, p => (p && p.isFinished ? null : p))
        await update($, crew, list => list.filter(w => !w.isDone))
        // The turn the wrap-up asked for has begun: its end is the conversation's.
        await update($, ending, s => (s === 'asked' ? 'running' : s))
      } else {
        await update($, turn, t => (t ? { ...t, steps: t.steps + 1 } : { startedAt: now, steps: 1 }))
      }
    } else {
      // A subagent's request. One the band never saw start still gets a place.
      const id = e.agentId
      await update($, crew, list =>
        list.some(w => w.id === id)
          ? list.map(w => (w.id === id ? { ...w, steps: w.steps + 1, isDone: false } : w))
          : [...list, { id, type: 'agent', steps: 1, isDone: false }].slice(-50),
      )
    }
    yield* next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started
    const id = started.agentId ?? e.tool_use_id
    const type = String(e.subagentType || 'agent')
    const startedAt = await $.clock.now()
    await update($, crew, list => [...list.filter(w => w.id !== id), { id, type, steps: 0, isDone: false, startedAt }].slice(-50))
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // What the turn used, at list prices, onto the conversation's running cost.
    const paid = turnCost(e.usage) ?? 0
    if (e.agentId) {
      const id = e.agentId
      const worker = (await read($, crew)).find(w => w.id === id)
      const type = worker?.type ?? 'agent'
      // The run interval: from the spawn to this turn's end; a subagent the band never saw start is dated by the turn's length.
      const end = await $.clock.now()
      const start = worker?.startedAt ?? Math.max(0, end - (typeof e.durationMs === 'number' ? e.durationMs : 0))
      await update($, crew, list => list.map(w => (w.id === id ? { ...w, isDone: true, ...(paid > 0 ? { startedAt: start, endedAt: end } : {}) } : w)))
      if (paid > 0) await addSpend($, paid, false, e.usage, type, { start, end, prevEnd: worker?.endedAt })
      return r
    }
    if (paid > 0) await addSpend($, paid, true, e.usage)
    if ((await read($, ending)) === 'running') {
      await update($, ending, () => null)
      // The debrief is in: stop holding this conversation's cache. The switch stays on for the next one.
      if ((await keepState($)) === true) $.clock.after(WRAP_DELAY_MS, () => fire($, KEEPWARM, WRAP_WINDOW))
    }
    const now = await $.clock.now()
    const c = await read($, cache)
    // turn.step stamps the exact request time; when no step of this turn did, the turn's end is the floor.
    const lastAt = !c || now - c.lastAt > e.durationMs ? now : c.lastAt
    try { await pull($) } catch { /* the figures come with the next reading */ }
    await measure($, lastAt, e.usage?.model ?? null)
    await addContext($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // Svg draws on desktop, mobile and VS Code; the terminal gets the text form.
    // Ask the surface, not the table: the terminal's table still lists Svg.
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : null

    // A held command takes the band: what it would lose, and the two answers. Cancel comes first.
    const holding = held
    if (holding && holding.report) {
      const rep = holding.report
      const shown = holding.command.length > 90 ? holding.command.slice(0, 89) + '…' : holding.command
      return (
        <Box key="held" flexDirection="column" paddingX={1}>
          <Box flexDirection="row" alignItems="center">
            <Text key="held-chip" backgroundColor={ORANGE} color={INK} bold>{' HELD '}</Text>
            <Text key="held-command" color="text" bold>{` ${shown}`}</Text>
            <Box key="grow" flexGrow={1} />
            <Box key="held-no" flexShrink={0} marginLeft={1}>
              <Button key="held-cancel" label="Cancel" onPress={() => { holding.decision = 'cancel' }} />
            </Box>
            <Box key="held-yes" flexShrink={0} marginLeft={1}>
              <Button key="held-proceed" label="Proceed" onPress={() => { holding.decision = 'proceed' }} />
            </Box>
          </Box>
          <Text key="held-summary" color={YELLOW} bold>{`Would ${rep.summary}`}</Text>
          {rep.lines.map((l, i) => <Text key={`held-line-${i}`} color="text">{`  ${l}`}</Text>)}
          {rep.more > 0 ? <Text key="held-more" color="subtle">{`  and ${rep.more} more`}</Text> : null}
          {rep.note ? <Text key="held-note" color="subtle">{rep.note}</Text> : null}
        </Box>
      )
    }
    // The atom is cleared by a resume and refilled only by events that may not come: an empty one asks the engine.
    arm($)
    const kept = await read($, windows)
    const now = await $.clock.now()
    // A window whose reset time has passed is a new window: the stored share used is from the old one.
    // Shown as 100% left with no reset time until the next reply brings the real figures.
    const list = (kept.length > 0 ? kept : await liveWindows($)).map(w =>
      w.resetsAt && Date.parse(w.resetsAt) <= now ? { ...w, percentUsed: 0, resetsAt: undefined } : w,
    )
    const view = viewOf((await read($, cache)) ?? (await readStoredCache($)), now)

    const keep = await keepState($)
    // What each button does, shown on hover. A box that is hidden until hovered, drawn above the
    // button with a rounded frame: the way Claude Code's own built-in mods show hover text. Buttons
    // have no tooltip of their own. Drawing surfaces only; the terminal has no pointer to hover with.
    const tip = (_key: string, text: string, side: 'left' | 'right' = 'right') =>
      Svg ? (
        <Box
          position="absolute"
          bottom={1}
          {...(side === 'left' ? { left: 0 } : { right: 0 })}
          display="none"
          hover={{ display: 'flex' }}
          flexDirection="column"
          borderStyle="round"
          borderDimColor
          paddingX={1}
          width={TIP_COLS}
        >
          <Text wrap="wrap">{text}</Text>
        </Box>
      ) : null
    // The labels: an icon, and on the wide layout its word too.
    const keepLabel = (isWide: boolean) => `${keep ? '🔥' : '🧊'}${isWide ? ' Keep warm' : ''}`
    const keepButton = (isWide: boolean) => keep === null ? null : (
      <Box key="keep" flexShrink={0} alignItems="flex-start" marginLeft={1}>
        <Button key="keep-warm" label={keepLabel(isWide)} onPress={() => setKeep($, !keep)} />
        {tip(
          'keep',
          keep
            ? 'Keep warm is on: cache-tax pings between turns so the prompt cache stays warm (a few cents a ping). Click to turn it off.'
            : 'Keep warm is off. Click to let cache-tax keep the prompt cache warm between turns.',
        )}
      </Box>
    )
    // Ends the conversation: runs the debrief, then lets go of this conversation's cache.
    const wrapping = await read($, ending)
    const wrapLabel = (isWide: boolean) => (isWide ? (wrapping ? '🎌 Wrapping up…' : '🎌 Wrap up') : wrapping ? '🎌…' : '🎌')
    const wrapShown = (await switchOf($, WRAP_KEY, false)) && (await hasCommand($, DEBRIEF))
    const wrapButton = (isWide: boolean) => wrapShown ? (
      <Box key="wrap" flexShrink={0} alignItems="flex-start" marginLeft={1}>
        <Button
          key="wrap-up"
          label={wrapLabel(isWide)}
          onPress={async () => {
            if ((await read($, ending)) !== null) return
            await update($, ending, () => 'asked' as const)
            // The cost first, as a command's answer, so the debrief has the figure to quote.
            const s = await readSpend($)
            if (s && s.main + s.subs > 0) fire($, SETTINGS, 'cost')
            fire($, DEBRIEF, '')
          }}
        />
        {tip('wrap', "Wrap up: runs /debrief with this conversation's cost, then stops keeping this conversation's cache warm.")}
      </Box>
    ) : null
    const grow = <Box key="grow" flexGrow={1} />

    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 100

    // What the conversation has cost so far, read from the store: it survives a restart.
    const paid = await readSpend($)
    const total = paid ? paid.main + paid.subs : 0
    const lastText = paid && paid.last > 0 ? usd(paid.last) : null

    // Folding needs the card, and the card is a drawing: the terminal stays hasCache.
    const stored = await read($, fold)
    const open = view !== null && Svg !== null && (stored && stored.mode === view.mode ? stored.open : view.mode === 'cold')
    const toggle = () => toggleFold($)
    const button = Svg && view ? (
      <Box key="fold" flexShrink={0} alignItems="flex-start">
        <Button key="cache-fold" label={open ? '−' : '+'} onPress={toggle} />
        {tip('fold', open ? 'Hide the cache card (or /wavebar fold).' : 'Show the cache card (or /wavebar fold): the cache, the spend, keep warm, pace and the metrics.')}
      </Box>
    ) : null

    // The layout follows from what the row holds: each width below is counted in columns from the
    // text the row will say, and layoutOf picks the first layout whose row fits.
    // Columns a character of text takes: one in the terminal, about half on the desktop.
    const k = Svg ? DESKTOP_CHAR_COLS : 1
    const t = (s: string) => textCols(s, k)
    const lefts = list.map(w => Math.max(0, Math.round((100 - w.percentUsed) * 10) / 10))
    const resets = list.map(w => fmtReset(w.resetsAt, now))
    const lowText = (i: number) => (lefts[i] < LOW_AT ? ' LOW' : '')
    const nameOf = (w: Window) => NAMES[w.kind] ?? w.kind.toUpperCase()
    const windowCols = (isWideRow: boolean, cells: number) =>
      list.length === 0
        ? Math.ceil(WAITING_COLS * k) + BLOCK_MARGIN
        : list.reduce(
            (n, w, i) =>
              n +
              (isWideRow
                ? t(`${nameOf(w)} ${'●'.repeat(cells)} ${lefts[i]}% left${lowText(i)}${resets[i] ? ` · ${resets[i]}` : ''}`) + BLOCK_MARGIN
                : blockCols([`${nameOf(w)} ${'●'.repeat(cells)}`, `${lefts[i]}% left${lowText(i)}`, resets[i] ? `resets ${resets[i]}` : ''], BLOCK_MARGIN, k)),
            0,
          )
    const spendCols = (isWideRow: boolean) =>
      total <= 0
        ? 0
        : isWideRow
          ? t(`COST ≈${usd(total)}${lastText ? ` · last ${lastText}` : ''}`) + BLOCK_MARGIN
          : blockCols(['COST', `≈${usd(total)}`, lastText ? `last ${lastText}` : ''], BLOCK_MARGIN, k)
    const waitingOnly = list.length === 0 && !view
    const rowCols = (isWideRow: boolean, cells: number, cacheCols: number) =>
      ROW_PAD +
      (waitingOnly ? Math.ceil(WAITING_ROW_COLS * k) + (total > 0 ? WAITING_SPEND_GAP : 0) : LABEL_COLS + (isWideRow ? WIDE_LABEL_MARGIN : BLOCK_MARGIN) + windowCols(isWideRow, cells)) +
      spendCols(isWideRow) +
      cacheCols
    const badgeCols = Svg ? ROBO_CHIP_COLS : TEXT_CHIP_COLS
    const minsLeft = view ? Math.max(0, TTL_MIN - view.idleMin) : 0
    const priced = view ? mineModel(view) : undefined
    const nextCost = view && priced ? usd(costOf(priced, view.mode, view.tokens)) : null
    const summaryText = !view ? '' : view.mode === 'cold' ? ` ${view.idle}${nextCost ? ` · ${nextCost}` : ''}` : ` ${minsLeft}m left`
    // The cache state shows in the row whether the card is open or not.
    const hasCache = view !== null
    const cacheInlineCols = hasCache ? badgeCols + t(summaryText) + CACHE_MARGIN : 0
    const cacheBlockCols =
      hasCache && view
        ? Math.max(badgeCols, blockCols([view.mode === 'cold' ? `${view.idle} idle` : `${minsLeft}m left`, nextCost ? `${nextCost} next` : ''], 0, k)) + CACHE_MARGIN
        : 0
    const buttonsWideCols =
      (button ? FOLD_COLS : 0) +
      (keep !== null ? buttonCols(keepLabel(true), BUTTON_GAP, k) : 0) +
      (wrapShown ? buttonCols(wrapLabel(true), BUTTON_GAP, k) : 0)
    // Icon buttons on the compact and tight layouts: measured, 6 columns each with its gap.
    const buttonsCols = ((button ? 1 : 0) + (keep !== null ? 1 : 0) + (wrapShown ? 1 : 0)) * COMPACT_BUTTON_COLS
    // The compact row, from everything (step 0) to the least (step 4): percent left of each window, the
    // cost, the chip and the next message's cost. Steps: 1 next cost only while cold, 2 no total,
    // 3 Robo (the terminal: a letter) for the chip, 4 `26%` for `26% left`.
    const k2 = Svg ? COMPACT_CHAR_COLS : 1
    const t2 = (s: string) => textCols(s, k2)
    const nextShown = (step: number) => nextCost !== null && (step === 0 || view?.mode === 'cold')
    const compactAt = (step: number) =>
      ROW_PAD +
      list.reduce((n, w, i) => n + t2(`${lefts[i]}%${step < 4 ? ' left' : ''}${lowText(i)}`) + COMPACT_MARGIN, 0) +
      (total > 0 && step < 2 ? t2(`≈${usd(total)}`) + COMPACT_MARGIN : 0) +
      (hasCache ? (step < 3 ? (Svg ? CHIP_COLS : TEXT_CHIP_COLS) : ROBO_COLS) + (nextShown(step) ? t2(` ${nextCost} next`) : 0) + COMPACT_MARGIN : 0)
    const need = {
      wide: rowCols(true, CELLS, cacheInlineCols),
      compact: Array.from({ length: COMPACT_STEPS }, (_, s) => (waitingOnly ? rowCols(false, CELLS, 0) : compactAt(s))),
      tight: view ? ROW_PAD + badgeCols + t(summaryText) : rowCols(false, TIGHT_CELLS, 0),
      buttons: buttonsCols,
      buttonsWide: buttonsWideCols,
    }
    const { kind, buttonsRow, compactStep } = layoutOf(columns, need)
    lastWidth = {
      body: typeof e.props.bodyColumns === 'number' ? e.props.bodyColumns : null,
      viewport: typeof e.viewport?.columns === 'number' ? e.viewport.columns : null,
      used: columns,
      kind: kind === 'stacked' ? `compact step ${compactStep}` : kind,
      need: `wide ${need.wide}+${need.buttonsWide}, compact ${need.compact.join('/')}+${need.buttons}`,
    }
    const buttons = [keepButton(kind === 'wide'), wrapButton(kind === 'wide')]
    // Buttons that do not fit beside the row take a row of their own, right-aligned, under the band's main rows.
    const buttonsRowEl = buttonsRow ? (
      <Box key="buttons-row" flexDirection="row" paddingX={1}>
        {grow}
        {button}
        {buttons}
      </Box>
    ) : null
    const inlineButtons = buttonsRow ? [] : [button, ...buttons]

    const running = (await read($, crew)).filter(w => !w.isDone)
    const crewWords = running.length ? ` ×${running.length} ${crewText(running)}` : ''

    // Where the request is: a segment per step when there is a list or a report to measure
    // against, one segment sweeping while a turn works with neither, nothing when idle.
    const prog = await read($, progress)
    const walking = prog && prog.total > 0 ? prog : null
    const pacing = !walking && e.props.isWorking ? await read($, turn) : null
    // Subagents still working after the main turn ended (a background agent): the work goes on, so the bar sweeps
    // beside them, without the turn's step count and time, which have stopped.
    const sweeping = !!pacing || (!walking && running.length > 0)
    const said = walking ? labelOf(walking) : null
    const note = said && said.note.length > NOTE_MAX ? said.note.slice(0, NOTE_MAX - 1) + '…' : (said?.note ?? '')
    // The theme draws the step's name (and the idle line) itself on the desktop; the words beside the bar then leave them out.
    const theme = THEMES[await themeOf($)]
    const inDrawing = !!Svg && theme.names
    const pulse = pacing && !(Svg && theme.info) ? ` ${pulseText(pacing, now)}` : ''
    const paceInfo = pacing ? `${pacing.steps} ${pacing.steps === 1 ? 'step' : 'steps'} · ${fmtElapsed(now - pacing.startedAt)}` : ''
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
    /**
     * The bar, its words and the crew in `availPx` of room, the bar's drawing at most `max` wide; null when
     * there is nothing to show. The bar keeps at least BAR_MIN_PX; the step's name is cut to what is left
     * and dropped when nothing is, so the row never wraps past the band.
     */
    const progressOf = (key: string, availPx: number, max: number) => {
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
    // On a row of its own the bar takes the width the words leave: the band less its padding and a column of safety.
    const rowPx = (columns - 3) * COL_PX_FULL
    const progressRow = progressOf('progress-row', rowPx, rowPx)

    const isWide = kind === 'wide'
    const isCompact = kind === 'stacked'
    const spendBox = total <= 0 || (isCompact && compactStep >= 2) ? null : isCompact ? (
      <Box key="spend" flexShrink={0} marginRight={COMPACT_MARGIN}>
        <Text key="spend-total" color="text" bold>{`≈${usd(total)}`}</Text>
      </Box>
    ) : (
      <Box key="spend" flexDirection={isWide ? 'row' : 'column'} flexShrink={0} marginRight={3}>
        <Text color="subtle" bold>{isWide ? 'COST ' : 'COST'}</Text>
        <Text key="spend-total" color="text" bold>{`≈${usd(total)}`}</Text>
        {lastText ? <Text key="spend-last" color="subtle">{isWide ? ` · last ${lastText}` : `last ${lastText}`}</Text> : null}
      </Box>
    )

    if (list.length === 0 && !view) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" paddingX={1}>
            <Text color="subtle">USAGE · waiting for the first reply</Text>
            {spendBox ? <Box key="wait-spend" marginLeft={2}>{spendBox}</Box> : null}
            {grow}
            {inlineButtons}
          </Box>
          {buttonsRowEl}
          {progressRow}
        </Box>
      )
    }

    const cells = kind === 'tight' ? TIGHT_CELLS : CELLS

    const parts = (w: Window) => {
      const left = Math.max(0, Math.round((100 - w.percentUsed) * 10) / 10)
      return {
        left,
        col: COLORS[w.kind] ?? 'text',
        name: NAMES[w.kind] ?? w.kind.toUpperCase(),
        d: dots(left, cells),
        reset: fmtReset(w.resetsAt, now),
        tip: (() => {
          const r = fmtReset(w.resetsAt, now)
          return `${LONG[w.kind] ?? w.kind.replace(/_/g, ' ') + ' limit'} · ${left}% left${r ? ` · ${r === 'resetting' ? 'resetting now' : `resets in ${r}`}` : ''}`
        })(),
      }
    }

    // Wide: every window on one row. Narrow: each window is a block of three
    // lines (name and dots, percent left, reset time) so nothing wraps or clips.
    const wide = (w: Window, i: number) => {
      const p = parts(w)
      return (
        <Box key={`w-${i}`} flexDirection="row" flexShrink={0} marginRight={3}>
          <Text color="subtle" bold>{p.name} </Text>
          <Text color={p.col}>{p.d.on}</Text>
          <Text color={EMPTY}>{p.d.off}</Text>
          <Text color={p.col} bold> {p.left}% left</Text>
          {p.left < LOW_AT ? <Text color="text" bold> LOW</Text> : null}
          {p.reset ? <Text color="subtle"> · {p.reset}</Text> : null}
          {tip(`w-tip-${i}`, p.tip, 'left')}
        </Box>
      )
    }

    const stacked = (w: Window, i: number) => {
      const p = parts(w)
      return (
        <Box key={`w-${i}`} flexDirection="column" flexShrink={0} marginRight={3}>
          <Box flexDirection="row">
            <Text color="subtle" bold>{p.name} </Text>
            <Text color={p.col}>{p.d.on}</Text>
            <Text color={EMPTY}>{p.d.off}</Text>
          </Box>
          <Box flexDirection="row">
            <Text color={p.col} bold>{p.left}% left</Text>
            {p.left < LOW_AT ? <Text color="text" bold> LOW</Text> : null}
          </Box>
          {p.reset ? <Text color="subtle">resets {p.reset}</Text> : null}
          {tip(`w-tip-${i}`, p.tip, 'left')}
        </Box>
      )
    }

    // Compact: only what is left of each window, in its colour.
    const compact = (w: Window, i: number) => {
      const p = parts(w)
      return (
        <Box key={`w-${i}`} flexDirection="row" flexShrink={0} marginRight={COMPACT_MARGIN}>
          <Text color={p.col} bold>{`${p.left}%${compactStep < 4 ? " left" : ""}`}</Text>
          {p.left < LOW_AT ? <Text color="text" bold> LOW</Text> : null}
          {tip(`w-tip-${i}`, p.tip, 'left')}
        </Box>
      )
    }

    const label = isCompact ? null : (
      <Box key="label" flexShrink={0} marginRight={isWide ? 2 : 3}>
        <Text color="text" bold>USAGE</Text>
      </Box>
    )
    const usage = [
      ...(list.length > 0
        ? list.map(isWide ? wide : isCompact ? compact : stacked)
        : isCompact ? [] : [<Box key="wait" flexShrink={0} marginRight={3}><Text color="subtle">waiting for the first reply</Text></Box>]),
      spendBox,
    ]

    // Before the first reply there is no cache to show.
    if (!view) {
      return (
        <Box flexDirection="column">
          <Box key="row" flexDirection="row" paddingX={1}>
            {label}
            {usage}
            {grow}
            {inlineButtons}
          </Box>
          {buttonsRowEl}
          {progressRow}
        </Box>
      )
    }

    const mode = view.mode
    const cold = mode === 'cold'
    const hue = HUE[mode]
    const mine = mineModel(view)

    const chip = Svg
      ? (() => {
          const c = chipSvg(mode)
          return <Svg key="chip" source={c.source} alt={WORD[mode]} width={c.w} height={c.h} />
        })()
      : <Text key="chip" backgroundColor={hue} color={INK} bold>{` ${WORD[mode]} `}</Text>
    // Compact step 3 and up: Robo alone (the terminal: a one-letter chip) in place of the chip.
    const compactChip =
      compactStep < 3
        ? chip
        : Svg
          ? <Svg key="robo" source={roboSvg(mode)} alt={cold ? 'Robo, frozen' : 'Robo, bobbing'} width={ROBO_SIZE} height={ROBO_SIZE} isInteractive />
          : <Text key="chip" backgroundColor={hue} color={INK} bold>{` ${WORD[mode][0]} `}</Text>
    // The next message's cost: always at step 0, after that only while cold.
    const showNext = mine !== undefined && (compactStep === 0 || cold)
    const badge = Svg
      ? [
          <Svg key="robo" source={roboSvg(mode)} alt={cold ? 'Robo, frozen' : 'Robo, bobbing'} width={ROBO_SIZE} height={ROBO_SIZE} isInteractive />,
          <Text key="gap"> </Text>,
          chip,
        ]
      : [chip]

    const summary = cold
      ? [
          <Text key="idle" color={hue} bold>{` ${view.idle}`}</Text>,
          mine ? <Text key="dot" color="subtle"> · </Text> : null,
          mine ? <Text key="cost" color="text" bold>{usd(costOf(mine, mode, view.tokens))}</Text> : null,
        ]
      : [<Text key="left" color={hue} bold>{` ${Math.max(0, TTL_MIN - view.idleMin)}m left`}</Text>]


    let rows
    if (kind === 'wide') {
      rows = (
        <Box key="row" flexDirection="row" paddingX={1} alignItems="center">
          {label}
          {usage}
          {/* WARM or COLD stays in the row whether the card is open or not. */}
          {(
            <Box key="inline" flexDirection="row" flexShrink={0} marginRight={2} alignItems="center">
              {badge}
              {summary}
            </Box>
          )}
          {grow}
          {inlineButtons}
        </Box>
      )
    } else if (kind === 'stacked') {
      // Compact: one line, the chip and the next message's cost standing in for the cache block.
      rows = (
        <Box key="row" flexDirection="row" paddingX={1} alignItems="center">
          {usage}
          {(
            <Box key="block" flexDirection="row" flexShrink={0} marginRight={COMPACT_MARGIN} alignItems="center">
              {compactChip}
              {showNext ? <Text key="next-gap"> </Text> : null}
              {showNext && mine ? <Text key="next-cost" color="text" bold>{usd(costOf(mine, mode, view.tokens))}</Text> : null}
              {showNext ? <Text key="next" color="subtle"> next</Text> : null}
              {tip('chip', cold ? `Cold, idle ${view.idle}` : `Warm, cold in ${Math.max(0, TTL_MIN - view.idleMin)}m`)}
            </Box>
          )}
          {grow}
          {inlineButtons}
        </Box>
      )
    } else {
      // Narrow: the cache gets its own row under the usage blocks.
      rows = [
        <Box key="row" flexDirection="row" paddingX={1}>
          {label}
          {usage}
        </Box>,
        <Box key="cache" flexDirection="row" paddingX={1} alignItems="center">
          {badge}
          {summary}
          {grow}
          {inlineButtons}
        </Box>,
      ]
    }

    let card = null
    let showProgress = true
    if (open && Svg) {
      const paceRows = trackPace(list, now)
      const days = await readDays($, now)
      // The card is drawn at W, 12 px a column, but the band is narrower on screen (DESKTOP_COL_PX). Its
      // element gets the width it is shown at and the height that goes with it: given the drawn height, the
      // shrunk drawing sat centred in a box too tall for it, with empty bands above and below.
      // The band may be at most maxRows tall, else the host scrolls it: fitOpen drops the progress row
      // when the open band would not fit with it.
      const W = bandPx(columns)
      const scale = Math.min(1, Math.floor(columns * DESKTOP_COL_PX) / W)
      const shownH = (h: number) => Math.round(h * scale)
      const rowsAbove = (kind === 'tight' ? 2 : 1) + (buttonsRowEl ? 1 : 0)
      const maxRows = typeof e.props.maxRows === 'number' ? e.props.maxRows : Infinity
      // The rows left under the band's own rows, as drawn px: the card drops its metric row to stay within them.
      const cardMaxH = Math.floor(((maxRows - rowsAbove) * ROW_PX) / scale)
      const c = cardSvg(view, W, { main: paid?.main ?? 0, subs: paid?.subs ?? 0, days, saved: paid?.saved, pings: paid?.pings }, paceRows, metricsOf(paid, Math.max(0, view.window - view.tokens)), cardMaxH)
      const fit = fitOpen(maxRows, rowsAbove, progressRow ? BAR_H : 0, shownH(c.h))
      showProgress = fit.progress
      if (lastWidth) lastWidth.fit = `${rowsAbove}+${progressRow && fit.progress ? rowsOf(BAR_H) : 0}+${rowsOf(shownH(c.h))} of ${maxRows} rows${fit.progress ? '' : ', progress dropped'}, card ${cardColsOf(W)} cols`
      card = (
        <Box key="card" flexDirection="row">
          <Svg source={c.source} alt={c.alt} width={Math.round(c.w * scale)} height={shownH(c.h)} isInteractive={kind !== 'tight'} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {rows}
        {buttonsRowEl}
        {showProgress ? progressRow : null}
        {card}
      </Box>
    )
  })
}
