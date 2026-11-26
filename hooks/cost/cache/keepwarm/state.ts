// The keep-warm switch's state: the `Keep` record every other keepwarm file shares, the per-conversation
// records in the store, and the constants and small helpers they read. A leaf: it imports no sibling.

import type { EngineInterface } from 'claude-code'

import { cacheFacts, TTL_MS } from '../facts'
import { usd } from '../../prices'

/**
 * The default for conversations with no switch of their own: on unless it is exactly false. Its own key, so a stale
 * false under the old 'keep' key (when the default was off) does not turn it off.
 */
export const KEEP_KEY = 'keepDefault'
/** Each conversation's record: its switch, and its window's deadline and period. Pruned after a month. */
export const KEEP_PREFIX = 'keep:'
export const PING_AFTER_MS = 50 * 60 * 1000
export const MIN_PING_MS = 60 * 1000
export const MAX_RETRIES = 3
/** What a switch that is on holds the cache for after every turn that reached it: every message starts the 24 hours again. */
export const WINDOW_MS = 24 * 60 * 60 * 1000
/** The stopped reason when keep warm found the cache cold with its window open: the box turns off, the switch does not. */
export const COLD_WHY = 'the cache went cold'

type PingRecord = { at: number; read: number; write: number; usd: number | null; warm: boolean }

export type Keep = {
  /** The conversation the state sits in; empty between a conversation's end and the host reporting the next. */
  sid: string
  endingSid: string
  /** Whether cache-tax is installed: then nothing here pings. Null until looked for. */
  passive: boolean | null
  told: boolean
  rechecked: boolean
  deadline: number
  every: number
  compacted: boolean
  transcript: number
  waitForTurn: boolean
  retries: number
  retryReason: string
  last: PingRecord | null
  stopped: string | null
  pending: { cancel: () => void } | null
  gen: number
  tick: number
  offs: number
  turnOffs: number | null
  inFlight: boolean
  /** The cache clock a cold-send warning was shown for, so one cold stretch warns once. */
  warnedAt: number
  /** A "warm now" ping (a click on a cold cache's box) is out: the box reads as ticked meanwhile. */
  warming: boolean
  /** Counts warm-now pings, so a late one does not clear the flag of a newer one. */
  warmId: number
  /** When a warm-now ping last re-wrote a cold cache (clock ms): the savings count reads it, see register.tsx. */
  rewroteAt: number
}

export function freshKeep(): Keep {
  return {
    sid: '', endingSid: '', passive: null, told: false, rechecked: false, deadline: 0, every: PING_AFTER_MS, compacted: false,
    transcript: 0, waitForTurn: false, retries: 0, retryReason: '', last: null, stopped: null, pending: null, gen: 0, tick: 0,
    offs: 0, turnOffs: null, inFlight: false, warnedAt: 0, warming: false, warmId: 0, rewroteAt: 0,
  }
}

export const fmtTok = (n: number): string => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n))
export const fmtUsd = (n: number | null): string => (n === null ? 'n/a' : usd(n))
export const isCold = (lastAt: number, now: number): boolean => lastAt > 0 && now - lastAt >= TTL_MS

// ---------- Store ----------

type KeepRec = { on?: boolean; deadline?: number; every?: number; at: number }

/** This conversation's record, or null when there is none or it cannot be read. */
export async function readKeepRec($: EngineInterface, sid: string): Promise<KeepRec | null> {
  if (!sid) return null
  try {
    const r = (await $.store.get(KEEP_PREFIX + sid)) as Partial<KeepRec> | null | undefined
    if (!r || typeof r !== 'object') return null
    return {
      ...(typeof r.on === 'boolean' ? { on: r.on } : {}),
      ...(typeof r.deadline === 'number' ? { deadline: r.deadline } : {}),
      ...(typeof r.every === 'number' ? { every: r.every } : {}),
      at: typeof r.at === 'number' ? r.at : 0,
    }
  } catch {
    return null
  }
}

/** Merges into a conversation's record and stamps `at`, which the month's pruning reads. A `null` removes a field. */
export async function putKeepRec($: EngineInterface, sid: string, patch: { on?: boolean; deadline?: number | null; every?: number | null }): Promise<void> {
  if (!sid) return
  const was = await readKeepRec($, sid)
  const next: Record<string, unknown> = { ...was, at: await $.clock.now() }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k]
    else if (v !== undefined) next[k] = v
  }
  await $.store.set(KEEP_PREFIX + sid, next)
}

/** Whether this conversation's switch is on: its own, else the default for new conversations. */
export async function switchOn($: EngineInterface, sid: string): Promise<boolean> {
  try {
    const rec = await readKeepRec($, sid)
    if (rec && typeof rec.on === 'boolean') return rec.on
    return (await $.store.get(KEEP_KEY)) !== false
  } catch {
    return false
  }
}

export async function lastAtOf($: EngineInterface): Promise<number> {
  try {
    return (await cacheFacts($))?.lastAt ?? 0
  } catch {
    return 0
  }
}
