// The keep-warm conversation's lifecycle: seating it, looking for cache-tax, restoring its window after a reload,
// the hooks the band calls (session start and end, each request, compaction, each finished turn) and the state the
// checkbox shows. It drives the pinger. Imports `./pinger` and `./state`; nothing imports it but the command and the band.

import type { EngineInterface } from 'claude-code'

import { TTL_MS } from '../facts'
import { arm, clearWindow, disarm, markCompacted, startWindow, stop } from './pinger'
import { MIN_PING_MS, PING_AFTER_MS, WINDOW_MS, isCold, lastAtOf, putKeepRec, readKeepRec, switchOn } from './state'
import type { Keep } from './state'

const CACHE_TAX = 'cache-tax'
const CACHE_TAX_NOTE =
  'cache-tax is installed and would ping too. Uninstall it with `claude plugin uninstall cache-tax@claude-code-mods` so spendometer keeps the cache warm.'

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
export async function seat($: EngineInterface, s: Keep): Promise<boolean> {
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
export async function active($: EngineInterface, s: Keep, request = false): Promise<boolean> {
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
