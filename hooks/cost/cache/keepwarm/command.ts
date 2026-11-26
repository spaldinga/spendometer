// What the user types and reads of keep warm: the `/keepwarm` command and its status line, the durations they
// write, and the warning before a cold send. Imports `./lifecycle`, `./pinger` and `./state`; nothing imports it but the band.

import type { EngineInterface } from 'claude-code'

import { cacheFacts, TTL_MS } from '../facts'
import { MODELS, coldCost, familyOf, usd, warmCost } from '../../prices'
import { active, seat } from './lifecycle'
import { startWindow, stop, warmNow } from './pinger'
import { COLD_WHY, KEEP_KEY, MAX_RETRIES, MIN_PING_MS, PING_AFTER_MS, WINDOW_MS, fmtTok, fmtUsd, isCold, lastAtOf, putKeepRec, switchOn } from './state'
import type { Keep } from './state'

/** A cold send is warned about from this much context up. */
const COLD_WARN_TOKENS = 50_000

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
