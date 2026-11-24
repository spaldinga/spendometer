// What the band keeps per conversation in the atoms and the store: the cache facts (when the main thread last sent
// a request, how much context) and the session's cost record. Shared by the band (register.tsx) and the keep-warm
// pinger (keepwarm.ts). Written as function declarations: a hook's `$` is followed past an import only into those.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CacheFacts, Spent } from '../types'

/** The cost per session lives in the store under this prefix; entries not written for this long are dropped at session start. */
export const SPEND_PREFIX = 'spend:'
/** The cache facts per conversation, so a resume that never reaches the band (state is cleared) still knows them. */
export const CACHE_PREFIX = 'cache:'

export const cache = atom({ plugin: 'spendometer', key: 'cache' } as const, null as CacheFacts | null)


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
    for (const k of ['turns', 'paidTurns', 'readTok', 'inTok', 'ctxPrev', 'growth', 'totTok', 'subsAtMain', 'subsPaid', 'commits', 'prs', 'rereads', 'rereadTok'] as const) if (typeof s[k] === 'number') out[k] = s[k]
    for (const k of ['byType', 'byModel', 'byTool'] as const) {
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
export function recordOf(was: Spent | null, at: number): Spent {
  const next: Spent = { ...(was ?? { main: 0, subs: 0, last: 0 }), at }
  if (was?.byType) next.byType = { ...was.byType }
  if (was?.byModel) next.byModel = { ...was.byModel }
  if (was?.byTool) next.byTool = { ...was.byTool }
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

/** The cache facts of this conversation as last saved, or null when none, the id or the store cannot be read. */
export async function readStoredCache($: EngineInterface): Promise<CacheFacts | null> {
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
export async function putCache($: EngineInterface, f: (c: CacheFacts | null) => CacheFacts | null): Promise<void> {
  const was = (await read($, cache)) ?? (await readStoredCache($))
  await update($, cache, () => f(was))
  try {
    const key = CACHE_PREFIX + (await $.session.id())
    const c = await read($, cache)
    if (c) await $.store.set(key, { lastAt: c.lastAt, tokens: c.tokens, window: c.window, model: c.model })
  } catch { /* the facts stay in the atom for this run */ }
}

/** The cache facts as the band holds them now: the atom, else the saved entry. */
export async function cacheFacts($: EngineInterface): Promise<CacheFacts | null> {
  return (await read($, cache)) ?? (await readStoredCache($))
}
