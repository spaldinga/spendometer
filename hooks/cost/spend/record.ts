// What the band keeps of the session's cost record in the store: the `Spent` record and the keep-warm figures
// added to it. Shared by the band (register.tsx) and the keep-warm pinger (keepwarm.ts). Written as function
// declarations: a hook's `$` is followed past an import only into those.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Spend, Spent } from '../../../types'
import { cacheFacts } from '../cache/facts'
import { familyOf, turnCost, usd } from '../prices'
import type { TurnUsage } from '../prices'
import { DAY_PREFIX, dayKey, isOldDay, lastDays } from './days'
import { isCommit, isPr, resultsSentence } from './results'

/** The cost per session lives in the store under this prefix; entries not written for this long are dropped at session start. */
export const SPEND_PREFIX = 'spend:'
/** How many of the latest main-turn costs the record keeps in `recent`. */
export const RECENT_KEEP = 10

/** This session's saved cost, or null when there is none or the id or the store cannot be read. */
export async function readSpend($: EngineInterface): Promise<Spent | null> {
  try {
    const s = (await $.store.get(SPEND_PREFIX + (await $.session.id()))) as Partial<Spent> | null | undefined
    if (!s || typeof s.main !== 'number' || typeof s.subs !== 'number') return null
    const out: Spent = { main: s.main, subs: s.subs, last: typeof s.last === 'number' ? s.last : 0, at: typeof s.at === 'number' ? s.at : 0 }
    // Records from before keep-warm savings were tracked have neither field.
    if (typeof s.pings === 'number') out.pings = s.pings
    if (typeof s.saved === 'number') out.saved = s.saved
    // The metric figures arrived later still; each is kept only when it is a number.
    for (const k of ['turns', 'paidTurns', 'readTok', 'inTok', 'ctxPrev', 'growth', 'totTok', 'subsAtMain', 'subsPaid', 'commits', 'prs', 'rereads', 'rereadTok', 'ctxFirst'] as const) if (typeof s[k] === 'number') out[k] = s[k]
    for (const k of ['byType', 'byModel', 'byTool', 'rereadFiles'] as const) {
      const src = s[k]
      if (src && typeof src === 'object') {
        const by: Record<string, number> = {}
        for (const [name, c] of Object.entries(src)) if (typeof c === 'number') by[name] = c
        out[k] = by
      }
    }
    if (Array.isArray(s.recent)) out.recent = s.recent.filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0).slice(-RECENT_KEEP)
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
export function recordOf(was: Spent | null, at: number): Spent {
  const next: Spent = { ...(was ?? { main: 0, subs: 0, last: 0 }), at }
  if (was?.byType) next.byType = { ...was.byType }
  if (was?.byModel) next.byModel = { ...was.byModel }
  if (was?.byTool) next.byTool = { ...was.byTool }
  if (was?.rereadFiles) next.rereadFiles = { ...was.rereadFiles }
  if (was?.recent) next.recent = [...was.recent]
  if (was?.spans) next.spans = was.spans.map(s => [s[0], s[1]] as [number, number])
  return next
}

/** Adds keep-warm figures (what a ping cost, what a ping saved) to this session's record. Never touches the total. */
export async function addKeepWarm($: EngineInterface, add: { pings?: number; saved?: number }): Promise<void> {
  try {
    const key = SPEND_PREFIX + (await $.session.id())
    const next = recordOf(await readSpend($), await $.clock.now())
    if (add.pings) next.pings = (next.pings ?? 0) + add.pings
    if (add.saved) next.saved = (next.saved ?? 0) + add.saved
    await $.store.set(key, next)
    $.ui.invalidate('ui.render')
  } catch { /* the card shows no savings; the ping goes on */ }
}


/** The cost per session lives in the store under this prefix; entries not written for this long are dropped at session start. */
export const SPEND_KEEP_MS = 30 * 24 * 60 * 60 * 1000
/** Pace records an older version kept per window kind; no longer used, deleted at session start. */
export const OLD_PACE_PREFIX = 'pace:'
/** Daily totals (`day:YYYY-MM-DD`) older than this are dropped at session start. */
export const DAY_KEEP_DAYS = 30

/** Subagent cost since the last main turn finished: it joins the next main turn's `last`. */
const subsSince = atom({ plugin: 'spendometer', key: 'subsSince' } as const, 0)

/** The conversation's cost as one line for the transcript. */
export function spendLine(s: Spend & { commits?: number; prs?: number }): string {
  return (
  `this conversation has cost about ${usd(s.main + s.subs)} so far (main session ${usd(s.main)}, subagents ${usd(s.subs)}). ` +
  'An estimate from token counts at list prices; not a bill.' +
  resultsSentence(s.commits ?? 0, s.prs ?? 0, (s.commits ?? 0) + (s.prs ?? 0) > 0 && s.main + s.subs > 0 ? usd((s.main + s.subs) / ((s.commits ?? 0) + (s.prs ?? 0))) : null)
  )
}

/** Adds the commits and pull requests a shell command made to this session's record. A command that made none writes nothing. */
export async function addResults($: EngineInterface, command: string): Promise<void> {
  const commit = isCommit(command)
  const pr = isPr(command)
  if (!commit && !pr) return
  try {
    const key = SPEND_PREFIX + (await $.session.id())
    const next = recordOf(await readSpend($), await $.clock.now())
    if (commit) next.commits = (next.commits ?? 0) + 1
    if (pr) next.prs = (next.prs ?? 0) + 1
    await $.store.set(key, next)
    $.ui.invalidate('ui.render')
  } catch { /* the card shows no results; the command went on */ }
}

/** The last seven days' totals, oldest first, 0 for a day with none (or an unreadable one). */
export async function readDays($: EngineInterface, now: number): Promise<number[]> {
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
export async function addSpend(
  $: EngineInterface,
  paid: number,
  isMain: boolean,
  usage?: TurnUsage | null,
  type = 'agent',
  span?: { start: number; end: number; prevEnd?: number },
): Promise<void> {
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
      next.recent = [...(next.recent ?? []), next.last].slice(-RECENT_KEEP)
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

/** How many subagent run intervals the record keeps. */
export const SPAN_KEEP = 200

/**
 * `spans` with a subagent's run interval added. A subagent's interval grows with each turn it completes: the one
 * written for its previous end (`prevEnd`, same start) is replaced; a new one is added otherwise. Keeps the last SPAN_KEEP.
 */
export const putSpan = (spans: readonly [number, number][] | undefined, start: number, end: number, prevEnd?: number): [number, number][] => {
  const list = (spans ?? []).map(s => [s[0], s[1]] as [number, number])
  let at = -1
  if (prevEnd !== undefined) for (let i = list.length - 1; i >= 0 && at < 0; i--) if (list[i][0] === start && list[i][1] === prevEnd) at = i
  if (at >= 0) list[at] = [start, Math.max(end, prevEnd!)]
  else list.push([start, Math.max(end, start)])
  return list.slice(-SPAN_KEEP)
}

/** How many re-read files the record keeps (the most recently re-read). */
export const REREAD_FILES_KEEP = 5

/** `files` with one more re-read of `file`: it moves to the newest place, and the oldest go while there are more than REREAD_FILES_KEEP. */
export const putReread = (files: Record<string, number> | undefined, file: string): Record<string, number> => {
  const next = { ...files }
  const n = (next[file] ?? 0) + 1
  delete next[file]
  next[file] = n
  const keys = Object.keys(next)
  for (const k of keys.slice(0, Math.max(0, keys.length - REREAD_FILES_KEEP))) delete next[k]
  return next
}

/** Adds a tool call's output tokens (and a re-read of an unchanged file) to this session's record. Nothing to add writes nothing. */
export async function addToolOut($: EngineInterface, tool: string, tokens: number, reread: boolean, file?: string): Promise<void> {
  if (tokens <= 0 && !reread) return
  try {
    const key = SPEND_PREFIX + (await $.session.id())
    const next = recordOf(await readSpend($), await $.clock.now())
    if (tokens > 0) next.byTool = { ...next.byTool, [tool]: (next.byTool?.[tool] ?? 0) + tokens }
    if (reread) {
      next.rereads = (next.rereads ?? 0) + 1
      next.rereadTok = (next.rereadTok ?? 0) + tokens
      if (file) next.rereadFiles = putReread(next.rereadFiles, file)
    }
    await $.store.set(key, next)
    $.ui.invalidate('ui.render')
  } catch { /* the card shows no tool output; the call went on */ }
}

/**
 * Notes the context size at the end of a main turn, and how fast it grows: the moving average of its increases.
 * `nextGrowth` is capacity's moving average, passed in by the caller: this file imports nothing from capacity.
 */
export async function addContext(
  $: EngineInterface,
  nextGrowth: (growth: number | undefined, prev: number | undefined, tokens: number) => number | undefined,
): Promise<void> {
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
    if (next.ctxFirst === undefined) next.ctxFirst = tokens
    await $.store.set(SPEND_PREFIX + (await $.session.id()), next)
  } catch { /* the runway waits for the next turn */ }
}

/** Drops the saved spend records under `keys` last written before `cutoff` (clock ms). */
export async function cleanOldSpend($: EngineInterface, keys: string[], cutoff: number): Promise<void> {
  for (const key of keys) {
    if (!key.startsWith(SPEND_PREFIX)) continue
    const s = (await $.store.get(key)) as Partial<Spent> | null | undefined
    if (s && typeof s.at === 'number' && s.at < cutoff) await $.store.delete(key)
  }
}

/** Drops the pace records an older version kept. */
export async function cleanOldPace($: EngineInterface, keys: string[]): Promise<void> {
  for (const key of keys) if (key.startsWith(OLD_PACE_PREFIX)) await $.store.delete(key)
}

/** Drops the daily totals under `keys` older than DAY_KEEP_DAYS, counted from `nowMs`. */
export async function cleanOldDays($: EngineInterface, keys: string[], nowMs: number): Promise<void> {
  for (const key of keys) if (key.startsWith(DAY_PREFIX) && isOldDay(key, nowMs, DAY_KEEP_DAYS)) await $.store.delete(key)
}
