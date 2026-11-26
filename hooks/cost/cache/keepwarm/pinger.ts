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
// Imports `./state` only. Pure of the band: everything the band owns (the cache facts, the session record) is read and written through cost/cache/facts.ts and cost/spend/record.ts.

import type { EngineInterface } from 'claude-code'

import { cacheFacts, putCache, TTL_MS } from '../facts'
import { addKeepWarm } from '../../spend/record'
import { turnCost } from '../../prices'
import { COLD_WHY, MAX_RETRIES, MIN_PING_MS, PING_AFTER_MS, WINDOW_MS, fmtTok, fmtUsd, isCold, lastAtOf, putKeepRec, readKeepRec } from './state'
import type { Keep } from './state'

const PING_PROMPT = 'Reply with the single word: warm'

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

const afterRetries = (n: number): string => (n ? ` after ${n} ${n === 1 ? 'retry' : 'retries'}` : '')

// ---------- State ----------

/** Cancels the timer. Every new timer is set right after this, so the tick also says the schedule changed. */
export function disarm(s: Keep) {
  if (s.pending) s.pending.cancel()
  s.pending = null
  s.tick++
}

/** Outdates any ping in flight: a stop, /clear, a resume or a compaction replaced the state it was sent for. */
function outdate(s: Keep) {
  s.gen++
}

/** The window and what hangs on it, forgotten (not the store). */
export function clearWindow(s: Keep) {
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
export function markCompacted(s: Keep) {
  s.compacted = true
  s.transcript = 0
  outdate(s)
}
/** Stops the window. `off` is a person's off: it also wins over a window a turn in flight was about to open. */
export async function stop($: EngineInterface, s: Keep, why: string | null, off = false) {
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
export async function startWindow($: EngineInterface, s: Keep, windowMs: number, every: number, offs = s.offs) {
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

export async function arm($: EngineInterface, s: Keep) {
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
export async function warmNow($: EngineInterface, s: Keep, gen: number, offs: number) {
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
