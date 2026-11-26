// What the band keeps of the prompt cache per conversation in the atoms and the store: the cache facts (when the
// main thread last sent a request, how much context) and what the drawings read of them. Shared by the band
// (register.tsx) and the keep-warm pinger (keepwarm.ts). Written as function declarations: a hook's `$` is followed
// past an import only into those.

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { CacheFacts } from '../../../types'
import { MODELS, familyOf } from '../prices'
import type { Model } from '../prices'
import type { Mode } from '../../band/look'

/** The cache facts per conversation, so a resume that never reaches the band (state is cleared) still knows them. */
export const CACHE_PREFIX = 'cache:'

export const cache = atom({ plugin: 'spendometer', key: 'cache' } as const, null as CacheFacts | null)

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

/** The prompt cache lives an hour after the last request that read or wrote it. */
export const TTL_MIN = 60
export const TTL_MS = TTL_MIN * 60 * 1000

/** Idle time the way the card writes it: 18m, 2h 5m, 3d 9h. */
export const fmtIdle = (ms: number): string => {
  const mins = Math.max(0, Math.floor(ms / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** What every drawing of the cache reads. */
export type CacheView = {
  mode: Mode
  /** How long since the last request, written out: 3d 9h, 18m. */
  idle: string
  /** The same in whole minutes, for the warm countdown. */
  idleMin: number
  /** Context the next request re-sends. */
  tokens: number
  /** The model's context window. */
  window: number
  /** This session's MODELS id, or null when the model isn't priced. */
  mine: string | null
}

export const mineModel = (v: CacheView): Model | undefined => MODELS.find(m => m.id === v.mine)


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

