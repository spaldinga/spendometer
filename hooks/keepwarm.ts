// The keep-warm pinger: while a window is open, a short fork of the main thread's last request is sent
// 50 idle minutes after that request, so the prompt cache is read, not re-written, when you come back.
//
// The timing logic is ported from cache-tax 2.3.1 (https://github.com/karanb192/cache-tax),
// MIT, Copyright (c) 2026 Karan Bansal: its window and deadline, one ping at a time, the retries with
// backoff while a ping can still land a minute before the cache goes cold, the wait on `nothing-to-fork`,
// the gen / tick / offs / inFlight counters that settle the races, the stop when a ping found the cache
// gone, and the quiet after a compaction. What differs: the state is spendometer's (one switch per
// conversation, one record `keep:<id>` in the store), and the cache clock is the band's own cache facts.
//
// Pure of the band: everything the band owns (the cache facts, the session record) is read and written through cache-store.ts.

import type { EngineInterface } from 'claude-code'

import { addKeepWarm, cacheFacts, putCache } from './cache-store'
import { MODELS, TTL_MS, coldCost, familyOf, turnCost, usd, warmCost } from './cache-art'

/**
 * The default for conversations with no switch of their own: on unless it is exactly false. Its own key, so a stale
 * false under the old 'keep' key (when the default was off) does not turn it off.
 */
export const KEEP_KEY = 'keepDefault'
/** Each conversation's record: its switch, and its window's deadline and period. Pruned after a month. */
export const KEEP_PREFIX = 'keep:'
const PING_AFTER_MS = 50 * 60 * 1000
const MIN_PING_MS = 60 * 1000
const MAX_RETRIES = 3
/** What a switch that is on holds the cache for after every turn that reached it: every message starts the 24 hours again. */
const WINDOW_MS = 24 * 60 * 60 * 1000
/** A cold send is warned about from this much context up. */
const COLD_WARN_TOKENS = 50_000
const PING_PROMPT = 'Reply with the single word: warm'
/** The stopped reason when keep warm found the cache cold with its window open: the box turns off, the switch does not. */
export const COLD_WHY = 'the cache went cold'
const CACHE_TAX = 'cache-tax'
const CACHE_TAX_NOTE =
  'cache-tax is installed and would ping too. Uninstall it with `claude plugin uninstall cache-tax@claude-code-mods` so spendometer keeps the cache warm.'

/** The cache figures of one ping, as the model reports them. */
export type PingUsage = { cache_read_input_tokens: number; cache_creation_input_tokens: number }

/**
 * Whether a ping's usage shows the prompt cache was still alive: it read the prefix from the cache and
 * wrote next to nothing. A ping that paid to write the prefix found the cache gone.
 */
export const pingKeptCacheWarm = (usage: PingUsage | null | undefined): boolean => {
  if (!usage) return false
  // The same rule cache-tax scores its own pings by: a write of a tenth of the read or more means the prefix broke.
  return usage.cache_read_input_tokens > 0 && usage.cache_creation_input_tokens < 0.1 * usage.cache_read_input_tokens
}

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

export function parseDuration(text: string): number | null {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(text.trim())
  if (!m || (m[1] === undefined && m[2] === undefined)) return null
  const ms = (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 * 1000
  return ms > 0 ? ms : null
}

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m` : `${m}m`
}

const fmtTok = (n: number): string => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n))
const fmtUsd = (n: number | null): string => (n === null ? 'n/a' : usd(n))
const afterRetries = (n: number): string => (n ? ` after ${n} ${n === 1 ? 'retry' : 'retries'}` : '')
const isCold = (lastAt: number, now: number): boolean => lastAt > 0 && now - lastAt >= TTL_MS

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
async function switchOn($: EngineInterface, sid: string): Promise<boolean> {
  try {
    const rec = await readKeepRec($, sid)
    if (rec && typeof rec.on === 'boolean') return rec.on
    return (await $.store.get(KEEP_KEY)) !== false
  } catch {
    return false
  }
}

async function lastAtOf($: EngineInterface): Promise<number> {
  try {
    return (await cacheFacts($))?.lastAt ?? 0
  } catch {
    return 0
  }
}

// ---------- State ----------

/** Cancels the timer. Every new timer is set right after this, so the tick also says the schedule changed. */
function disarm(s: Keep) {
  if (s.pending) s.pending.cancel()
  s.pending = null
  s.tick++
}

/** Outdates any ping in flight: a stop, /clear, a resume or a compaction replaced the state it was sent for. */
function outdate(s: Keep) {
  s.gen++
}

/** The window and what hangs on it, forgotten (not the store). */
function clearWindow(s: Keep) {
  s.deadline = 0
  s.every = PING_AFTER_MS
  s.stopped = null
  s.retries = 0
  s.waitForTurn = false
  s.compacted = false
  s.transcript = 0
  s.warming = false
  s.rewroteAt = 0
  outdate(s)
  disarm(s)
}

/** The conversation was summarized: the next request is the first over the new prefix, and a ping out for the old one is dropped. */
function markCompacted(s: Keep) {
  s.compacted = true
  s.transcript = 0
  outdate(s)
}

function statusText(s: Keep, now: number, lastAt: number): string {
  if (s.stopped) return `keepwarm stopped, ${s.stopped}`
  if (!s.deadline || now >= s.deadline) return 'keepwarm is off'
  const pingText = s.last ? ` · last ping read ${fmtTok(s.last.read)} ${fmtUsd(s.last.usd)}` : ''
  const nextText = !lastAt ? ' · waiting for the first turn'
    : s.compacted ? ' · waiting for the first turn after compaction'
    : s.waitForTurn ? ' · nothing to fork yet, first ping after the next turn'
    : s.retries ? ` · API busy, ping retry ${s.retries} of ${MAX_RETRIES}`
    : ` · ping in ${fmtDuration(lastAt + s.every - now)}`
  return `keepwarm ${fmtDuration(s.deadline - now)} left${nextText}${pingText}`
}

/** Stops the window. `off` is a person's off: it also wins over a window a turn in flight was about to open. */
async function stop($: EngineInterface, s: Keep, why: string | null, off = false) {
  // Set before any await, so a window being opened at the same moment sees the off and does not write itself back.
  if (off) {
    s.offs++
    // A warm-now ping out is dropped on its return; the box must not keep reading ticked until then.
    s.warming = false
  }
  s.deadline = 0
  s.every = PING_AFTER_MS
  s.stopped = why
  s.retries = 0
  outdate(s)
  disarm(s)
  $.ui.invalidate('ui.render')
  await putKeepRec($, s.sid, { deadline: null, every: null })
}

// A stop after `offs` was read wins: the window it cancelled is not written back. A caller that awaited before
// deciding to open a window passes the count it read first.
async function startWindow($: EngineInterface, s: Keep, windowMs: number, every: number, offs = s.offs) {
  if (s.offs !== offs) return
  const now = await $.clock.now()
  if (s.offs !== offs) return
  const deadline = now + windowMs
  s.every = every
  s.deadline = deadline
  s.stopped = null
  // Unseated, between a conversation's end and the host reporting the next, the window has no id to be written under.
  if (!s.sid) return arm($, s)
  await putKeepRec($, s.sid, { deadline, every: every === PING_AFTER_MS ? null : every })
  if (s.offs !== offs) {
    // Remove only what this call wrote; a window armed after the stop is left alone.
    if ((await readKeepRec($, s.sid))?.deadline === deadline) await putKeepRec($, s.sid, { deadline: null, every: null })
    return
  }
  await arm($, s)
}

async function arm($: EngineInterface, s: Keep) {
  disarm(s)
  s.retries = 0
  if (!s.deadline) return
  const now = await $.clock.now()
  const lastAt = await lastAtOf($)
  // A timer set while the clock was read, such as a retry, is replaced here, never left running beside this one;
  // from this line to the assignment below nothing awaits.
  disarm(s)
  s.retries = 0
  if (now >= s.deadline) return stop($, s, null)
  // A cold cache with the window open ends the window (the box turns off), whatever state it waits in: nothing
  // here may send a model request for it. The switch is untouched, so the next message opens 24 hours again.
  if (isCold(lastAt, now)) return stop($, s, COLD_WHY)
  if (lastAt && !s.compacted) {
    const untilCold = lastAt + TTL_MS - now
    // Waiting for a turn sends nothing, but wakes when the cache goes cold so the window ends then.
    if (s.waitForTurn) s.pending = $.clock.after(Math.min(s.deadline - now, untilCold), () => { void arm($, s) })
    else {
      const delay = Math.min(s.deadline - now, untilCold, Math.max(1000, lastAt + s.every - now))
      s.pending = $.clock.after(delay, () => { void ping($, s) })
    }
  } else if (lastAt) {
    // After a compaction nothing pings, but the window still wakes when the cache goes cold.
    s.pending = $.clock.after(Math.min(s.deadline - now, lastAt + TTL_MS - now), () => { void arm($, s) })
  } else {
    s.pending = $.clock.after(s.deadline - now, () => { void arm($, s) })
  }
  $.ui.invalidate('ui.render')
}

/** Why a fork that was not answered failed, in words. */
const failedWhy = (reply: { reason?: string; status?: number | null }): string =>
  reply.reason === 'api-error' ? `the API call failed${reply.status === null || reply.status === undefined ? '' : ` (${reply.status})`}`
    : reply.reason === 'aborted' ? 'the ping was interrupted'
    : 'the ping returned no text'

/**
 * A click on the unticked box while the cache is cold: one ping now, sent even though the cache is cold (the cold guard
 * is for the timer's pings). It re-writes the cache, so on a reply the cache clock restarts from the send, the cost is
 * recorded and the 24 hours open. `gen` and `offs` are what the click started with: an untick, /clear or compaction
 * while the ping is out wins and its reply is dropped. A failure only logs; the box stays unticked, the switch on.
 */
async function warmNow($: EngineInterface, s: Keep, gen: number, offs: number) {
  const id = ++s.warmId
  s.warming = true
  $.ui.invalidate('ui.render')
  const settle = () => { if (s.warmId === id) { s.warming = false; s.inFlight = false } }
  const sentAt = await $.clock.now()
  if (gen !== s.gen || s.offs !== offs || s.inFlight) return settle()
  const before = await lastAtOf($)
  s.inFlight = true
  const sent = await Promise.resolve($.model.fork({ prompt: PING_PROMPT })).then(reply => ({ reply }), (err: unknown) => ({ err }))
  const reply = 'reply' in sent ? sent.reply : null
  const used = reply && reply.isAnswered !== false ? reply.usage : null
  const cost = used ? turnCost(used, (await cacheFacts($))?.model) : null
  const after = await lastAtOf($)
  settle()
  $.ui.invalidate('ui.render')
  if (gen !== s.gen || s.offs !== offs) return
  if (!used) {
    const why = 'err' in sent ? `the ping failed, ${sent.err instanceof Error ? sent.err.message : String(sent.err)}`
      : !reply ? 'the engine did not send the ping'
      : reply.isAnswered === false && reply.reason === 'nothing-to-fork' ? 'there is nothing to fork until your next message, which warms it'
      : reply.isAnswered === false ? failedWhy(reply)
      : 'the ping returned no text'
    try { await $.ui.log(`could not warm the cache now: ${why}. Your next message re-writes it.`) } catch { /* the box says it */ }
    return
  }
  // A request of the main thread while the ping was out replaced the cache: only the ping's cost is left to record.
  const moved = after !== before
  try {
    if (!moved) await putCache($, c => (c ? { ...c, lastAt: Math.max(c.lastAt, sentAt) } : c))
    if (cost !== null && cost > 0) await addKeepWarm($, { pings: cost })
  } catch { /* the card shows no cost; the ping counted */ }
  if (moved || gen !== s.gen || s.offs !== offs) return
  s.rewroteAt = sentAt
  s.last = { at: sentAt, read: used.cache_read_input_tokens, write: used.cache_creation_input_tokens, usd: cost, warm: false }
  await startWindow($, s, WINDOW_MS, PING_AFTER_MS, offs)
  $.ui.invalidate('ui.render')
}

async function ping($: EngineInterface, s: Keep) {
  s.pending = null
  if (!s.deadline) return
  const tick = s.tick
  const now = await $.clock.now()
  const lastAt = await lastAtOf($)
  // A timer set or cancelled while the clock was read (an extension, a retry, a turn) owns the window now;
  // if that left no timer, a window still open is armed again rather than left without one.
  if (s.tick !== tick) return s.pending || s.inFlight ? undefined : arm($, s)
  // One fork at a time: the one already out re-arms when it settles. Checked after the awaits, and set
  // below with no await in between, so two timers can never both send.
  if (s.inFlight) return
  if (now >= s.deadline) return arm($, s)
  if (isCold(lastAt, now)) return arm($, s)
  if (s.compacted || s.waitForTurn || !lastAt) return arm($, s)
  // A request since this timer was set moved the clock; schedule from it.
  if (now - lastAt < s.every - 1000) return arm($, s)
  // A host that slept past a retry's slot must not send it inside the last minute.
  if (s.retries && now >= lastAt + TTL_MS - MIN_PING_MS) return stop($, s, s.retryReason + afterRetries(s.retries))
  const gen = s.gen
  s.inFlight = true
  const sent = await Promise.resolve($.model.fork({ prompt: PING_PROMPT })).then(reply => ({ reply }), (err: unknown) => ({ err }))
  const at = await $.clock.now()
  const lastNow = await lastAtOf($)
  const reply = 'reply' in sent ? sent.reply : null
  const used = reply && reply.isAnswered !== false ? reply.usage : null
  const cost = used ? turnCost(used, (await cacheFacts($))?.model) : null
  s.inFlight = false
  // Checked after the last await. A stop, /clear, resume or compaction replaced what this fork was sent for: its
  // reply is dropped and the window armed afresh.
  if (gen !== s.gen) return s.pending ? undefined : arm($, s)
  const warm = pingKeptCacheWarm(used)
  // A ping that read the cache kept it alive and cost something, whatever a main request did meanwhile.
  if (used && warm) {
    try {
      // The hour starts again from when the ping was sent, never from before a newer request.
      await putCache($, c => (c ? { ...c, lastAt: Math.max(c.lastAt, now) } : c))
      if (cost !== null && cost > 0) await addKeepWarm($, { pings: cost })
    } catch { /* the card shows no cost; the ping counted */ }
    if (gen !== s.gen) return s.pending ? undefined : arm($, s)
  }
  // A main request while the ping was out moved the cache clock: its reply, a failure or a cold read, is about a cache
  // that request has since replaced.
  if (lastNow !== lastAt) return s.pending ? undefined : arm($, s)
  if ('err' in sent) return stop($, s, `the ping failed, ${sent.err instanceof Error ? sent.err.message : String(sent.err)}`)
  if (!reply) return stop($, s, 'the engine did not send the ping, either the snapshot was cold or the API call failed')
  if (reply.isAnswered === false) {
    // A restarted process has no conversation to fork until its first turn; the window waits for one instead of ending.
    if (reply.reason === 'nothing-to-fork') {
      s.waitForTurn = true
      return arm($, s)
    }
    const reason = failedWhy(reply)
    // A busy or failing API is usually brief; retry while a ping can still land a minute before the cache goes cold.
    if (reply.reason === 'api-error' && (reply.status === null || reply.status === undefined || reply.status === 429 || reply.status >= 500)) {
      const wait = MIN_PING_MS * 2 ** s.retries
      if (s.retries < MAX_RETRIES && at + wait < Math.min(s.deadline, lastAt + TTL_MS - MIN_PING_MS)) {
        s.retries++
        s.retryReason = reason
        // Replaces any timer set while the fork was out, such as a window extension's, so only the retry fires.
        disarm(s)
        s.pending = $.clock.after(wait, () => { void ping($, s) })
        $.ui.invalidate('ui.render')
        return
      }
    }
    return stop($, s, reason + afterRetries(s.retries))
  }
  const u = reply.usage
  s.last = { at: now, read: u.cache_read_input_tokens, write: u.cache_creation_input_tokens, usd: cost, warm }
  if (!warm) return stop($, s, `the ping read ${fmtTok(u.cache_read_input_tokens)} and wrote ${fmtTok(u.cache_creation_input_tokens)} tokens (${fmtUsd(cost)}), the cache was already gone`)
  await arm($, s)
}

// ---------- Conversations ----------

/** Looks for cache-tax once: installed, it would ping too, so nothing here does. */
async function detect($: EngineInterface, s: Keep) {
  let installed = false
  try {
    installed = (await $.command.list()).some(c => c.name === CACHE_TAX)
  } catch { /* not installed, as far as can be told */ }
  if (installed && !s.passive) {
    // Anything armed so far stops: cache-tax pings.
    clearWindow(s)
    if (!s.told) {
      s.told = true
      try { await $.ui.log(CACHE_TAX_NOTE) } catch { /* the note is only a note */ }
    }
  }
  s.passive = installed
}

/** Restores this conversation's window from the store, as a reload or a restart lost its timer. */
async function restore($: EngineInterface, s: Keep) {
  const now = await $.clock.now()
  const rec = await readKeepRec($, s.sid)
  if (!rec || rec.deadline === undefined || rec.deadline <= now) return
  s.deadline = rec.deadline
  s.every = rec.every !== undefined && rec.every >= MIN_PING_MS && rec.every < TTL_MS ? rec.every : PING_AFTER_MS
  s.stopped = null
  await arm($, s)
}

/**
 * Seats the state in the conversation the process runs now, once: its window comes back from the store, and an id that
 * differs from the seated one means /clear or a resume reached no session.end, so the old window goes. False between a
 * conversation's end and the host reporting the next id, and when the id cannot be read.
 */
async function seat($: EngineInterface, s: Keep): Promise<boolean> {
  let id: string
  try {
    id = await $.session.id()
  } catch {
    return false
  }
  if (id === s.sid) return true
  if (id === s.endingSid) return false
  if (s.passive === null) await detect($, s)
  if (s.sid) {
    const old = s.sid
    clearWindow(s)
    try { await putKeepRec($, old, { deadline: null, every: null }) } catch { /* the old record only lingers */ }
  }
  s.sid = id
  s.endingSid = ''
  if (!s.passive) await restore($, s)
  return true
}

/** Seated, and not passive beside cache-tax. The first main request looks for cache-tax once more: it may register after this mod starts. */
async function active($: EngineInterface, s: Keep, request = false): Promise<boolean> {
  if (!(await seat($, s))) return false
  if (request && !s.passive && !s.rechecked) {
    s.rechecked = true
    await detect($, s)
  }
  return !s.passive
}

/** session.start: looks for cache-tax, seats the conversation (restoring its window), and registers `/keepwarm` unless cache-tax answers it. */
export async function startKeep($: EngineInterface, s: Keep) {
  clearWindow(s)
  s.sid = ''
  s.endingSid = ''
  s.passive = null
  s.told = false
  s.rechecked = false
  s.warnedAt = 0
  await seat($, s)
  if (s.passive === null) await detect($, s)
  if (s.passive) return
  try {
    await $.command.register({
      name: 'keepwarm',
      description: 'Keep the prompt cache warm: on (bare) for 24h after each message, a window such as 90m, always, off, or status',
      argumentHint: '[on | 90m | always | off | status]',
      immediate: true,
    })
  } catch { /* without the command the button still works */ }
}

/** /clear or an in-process resume ended the conversation: its window goes, and the next conversation arms from its own switch. */
export async function endConversation($: EngineInterface, s: Keep, sessionId?: string) {
  if (!s.sid || (sessionId !== undefined && sessionId !== s.sid)) return
  const old = s.sid
  // Claimed before any await: a second end finds it already gone.
  s.endingSid = old
  s.sid = ''
  clearWindow(s)
  $.ui.invalidate('ui.render')
  await putKeepRec($, old, { deadline: null, every: null })
}

/** The first request of a turn, and the ones after: the offs count the turn started with, and a compaction read off a shorter transcript. */
export async function noteRequest($: EngineInterface, s: Keep, e: { index: number; messageCount: number }) {
  if (!(await active($, s, true))) return
  if (e.index === 0) s.turnOffs = s.offs
  // A compaction leaves a summary where tens of messages were; a rewind takes a few off. A request over fewer than half the
  // last one's messages is read as a compaction, whether or not session.compact arrived.
  if (e.messageCount * 2 < s.transcript) markCompacted(s)
  s.transcript = e.messageCount
}

/** After a compaction nothing pings until the next turn: the summary is the first request over a new prefix. */
export async function noteCompact($: EngineInterface, s: Keep) {
  if (!(await active($, s))) return
  markCompacted(s)
  disarm(s)
  await arm($, s)
}

/** The cache clock was seeded (a resume told how long the conversation was away): a window armed before that is scheduled from it. */
export async function noteSeeded($: EngineInterface, s: Keep) {
  if (!(await active($, s))) return
  await arm($, s)
}

/**
 * The main thread's turn finished. With the switch on and a response that reached the cache, the window becomes
 * at least 24 hours from now.
 */
export async function afterTurn($: EngineInterface, s: Keep, t: { hasUsage: boolean }) {
  if (!(await active($, s))) return
  // An off at any point in this turn wins over the window the turn would open.
  const offs = s.turnOffs ?? s.offs
  s.turnOffs = null
  const now = await $.clock.now()
  // A sleeping host may deliver this turn before the expired window's timer.
  if (s.deadline && now >= s.deadline) await stop($, s, null)
  s.compacted = false
  s.waitForTurn = false
  // A turn that failed before any response touched nothing, and its cache may be cold: it opens no window.
  if (t.hasUsage && s.offs === offs && (await switchOn($, s.sid))) {
    await startWindow($, s, Math.max(WINDOW_MS, s.deadline - now), PING_AFTER_MS, offs)
  }
  await arm($, s)
}

// ---------- The switch, the button and the command ----------

/**
 * What the button shows. The box follows the cache: it is ticked while a window is open or the switch is on and nothing
 * stopped keep warm, and never while the cache is cold (unless a warm-now ping is out), so it cannot disagree with the chip.
 */
export type KeepView = {
  on: boolean
  /** This conversation's switch is on (its own, else the default). It says an unticked box was not the user's untick. */
  switch: boolean
  /** The cache is cold now: nothing is keeping it warm, whatever the switch says. */
  cold: boolean
  /** The reason the window stopped, such as a ping that found the cache gone; null while ticked or never stopped. */
  stopped: string | null
}

/** The button's state; null when cache-tax is installed, so there is no button. Only reads: a draw changes nothing. */
export async function keepOf($: EngineInterface, s: Keep): Promise<KeepView | null> {
  try {
    if (!(await seat($, s)) && s.passive === null) return null
    if (s.passive) return null
    const now = await $.clock.now()
    const sw = await switchOn($, s.sid)
    // Before the first reply there is no cache clock (lastAt 0) and so no cold.
    const cold = isCold(await lastAtOf($), now)
    const on = s.warming || (!cold && (s.deadline > now || (sw && !s.stopped)))
    return { on, switch: sw, cold: cold && !s.warming, stopped: on ? null : s.stopped }
  } catch {
    return null
  }
}

/** The mark's hover: it shows only while keep-warm is on. */
export const keepTip = (): string =>
  'Keep warm is on until 24h after your last message. A short ping every 50 idle minutes keeps the cache warm (a few cents a ping). /keepwarm off stops it.'

/** The answer to `/keepwarm status`, for `/spendometer status` too. */
export async function keepwarmStatus($: EngineInterface, s: Keep): Promise<string> {
  await seat($, s)
  const now = await $.clock.now()
  const open = s.deadline > 0 && now < s.deadline
  // Cold with the window still open: the timer has not fired yet (a sleep), but the answer is the same as after it.
  if (open && isCold(await lastAtOf($), now)) return `keepwarm stopped, ${COLD_WHY}`
  if (!s.stopped && !open && (await switchOn($, s.sid))) return 'keepwarm is on, no window open: the next turn opens one'
  return statusText(s, now, await lastAtOf($))
}

async function switchOff($: EngineInterface, s: Keep, alsoDefault: boolean) {
  // stop() counts the off before it awaits anything; its store writes finish before the switch is written, or they would overwrite each other.
  await stop($, s, null, true)
  if (alsoDefault) await $.store.set(KEEP_KEY, false)
  await putKeepRec($, s.sid, { on: false })
  // stop() redrew before the switch was saved, when the box still read as ticked (on is the default): redraw now it reads off.
  $.ui.invalidate('ui.render')
}

async function switchOnWithWindow($: EngineInterface, s: Keep, alsoDefault: boolean) {
  if (alsoDefault) await $.store.set(KEEP_KEY, true)
  await putKeepRec($, s.sid, { on: true })
  await startWindow($, s, WINDOW_MS, PING_AFTER_MS)
  $.ui.invalidate('ui.render')
}


const USAGE = 'keepwarm takes on, a window such as 90m or 6h, or always, off, or status'

/** The answer to a typed `/keepwarm`; the effect is on the switch, the window and the store. */
export async function keepwarmCommand($: EngineInterface, s: Keep, args: string): Promise<string> {
  await seat($, s)
  const words = args.trim().split(/\s+/).filter(Boolean)
  const now = await $.clock.now()
  const lastAt = await lastAtOf($)
  const cold = isCold(lastAt, now) ? '. The cache is cold now, so it starts with your next message (/keepwarm on warms it now)' : ''
  const armed = (every: number) => `a ping ${fmtDuration(every)} after each idle stretch keeps the cache read, not re-written${cold}`
  if (words[0] === 'off') {
    await switchOff($, s, true)
    return 'keepwarm is off: this conversation and new ones start without it, and the window is closed'
  }
  if (words[0] === 'always') {
    await switchOnWithWindow($, s, true)
    return `keepwarm is on for this conversation and for new ones: each turn keeps a window of ${fmtDuration(WINDOW_MS)}, ${armed(PING_AFTER_MS)}; /keepwarm off turns it off`
  }
  if (!words.length || (words[0] === 'on' && words.length === 1)) {
    // On a cold cache, the same as a click on the box: one ping now re-writes it, then the 24 hours open.
    if (lastAt > 0 && isCold(lastAt, now) && (await active($, s))) {
      await putKeepRec($, s.sid, { on: true })
      void warmNow($, s, s.gen, s.offs)
      return 'keepwarm is on for this conversation: the cache is cold, so one ping re-writes it now; then each turn keeps a window of 24h'
    }
    await switchOnWithWindow($, s, false)
    return `keepwarm is on for this conversation: window ${fmtDuration(WINDOW_MS)}, renewed by each turn; ${armed(PING_AFTER_MS)}`
  }
  if (words[0] === 'status') return keepwarmStatus($, s)
  const window = parseDuration(words[0])
  if (!window) return USAGE
  // "every 2m" is a testing knob and lasts only for the window it was given with.
  let every = PING_AFTER_MS
  if (words[1] === 'every') {
    const period = parseDuration(words[2] ?? '')
    // A period of the cache's whole hour or more would fire only once the cache is already cold.
    if (period === null || period < MIN_PING_MS || period >= TTL_MS) return 'every takes a period from 1m to 59m'
    every = period
  } else if (words.length > 1) return USAGE
  await startWindow($, s, window, every)
  $.ui.invalidate('ui.render')
  const rolls = (await switchOn($, s.sid)) && (window < WINDOW_MS || every !== PING_AFTER_MS)
  return `keepwarm window of ${fmtDuration(window)} open, ${armed(every)}` +
    (rolls ? `. The switch is on, so your next turn makes it at least ${fmtDuration(WINDOW_MS)} at one ping per ${fmtDuration(PING_AFTER_MS)}` : '')
}

// ---------- Cold send ----------

/**
 * A prompt that is about to re-write a cold cache: one line with the price, once per cold stretch. Only warns; the prompt
 * always goes on. Not for slash commands, nor for prompts a plugin sent.
 */
export async function warnCold($: EngineInterface, s: Keep, e: { text?: unknown; command?: unknown; origin?: { kind?: string } }) {
  if (e.origin?.kind === 'plugin') return
  if (typeof e.text !== 'string' || e.text.trimStart().startsWith('/') || e.command) return
  if (!(await active($, s))) return
  const f = await cacheFacts($)
  if (!f || f.lastAt <= 0 || f.tokens < COLD_WARN_TOKENS || s.compacted) return
  const now = await $.clock.now()
  if (!isCold(f.lastAt, now) || s.warnedAt === f.lastAt) return
  s.warnedAt = f.lastAt
  const m = MODELS.find(x => x.id === familyOf(f.model))
  const tokens = f.tokens.toLocaleString('en-US')
  const idle = fmtDuration(now - f.lastAt)
  await $.ui.log(
    m
      ? `the prompt cache went cold, idle ${idle}. This message re-writes about ${tokens} tokens: ${usd(coldCost(m, f.tokens))}, where a warm turn would have cost ${usd(warmCost(m, f.tokens))}. /keepwarm keeps it warm between turns.`
      : `the prompt cache went cold, idle ${idle}. This message re-writes about ${tokens} tokens at an unknown price for this model. /keepwarm keeps it warm between turns.`,
  )
}
