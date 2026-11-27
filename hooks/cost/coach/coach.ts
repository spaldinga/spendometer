// The brief coach (backlog 150, a proof of concept): on the first prompt of a conversation, one small Haiku call scores
// which parts of a brief it covers and one transcript line says so. A hint only: it never holds, changes or delays the
// prompt, and any failure shows nothing. Its own tally (`coachHistory`, `coachFails`) is not part of the session's spend.

import type { EngineInterface } from 'claude-code'

import { turnCost } from '../prices'
import { KEEP_BRIEFS, RUBRIC, appliedOf, coveredOf, fence, hintLine, parseScore, statusText } from './rubric'
import type { Entry } from './rubric'

export const COACH_KEY = 'coach'
const SCORED_KEY = 'coachScored'
const HISTORY_KEY = 'coachHistory'
const FAILS_KEY = 'coachFails'
const FAIL_USD_KEY = 'coachFailUsd'
/** Shorter prompts are go-aheads ("kör", "ok go"), not briefs. */
const MIN_CHARS = 40
/** How many conversations are remembered as scored; the oldest are forgotten first. */
const KEEP_SCORED = 50

/** Sessions that /clear or a compaction made a first prompt again. Lost on a reload, which is harmless. */
const again = new Set<string>()
/** Sessions whose first-prompt claim is being read and written right now, so two quick prompts do not both claim it. */
const inflight = new Set<string>()

/** /clear and a compaction: the next prompt of that session (the given id, else the current one) is a first prompt. */
export async function markNextFirst($: EngineInterface, sessionId?: string): Promise<void> {
  try { again.add(sessionId || (await $.session.id())) } catch { /* the coach only misses one score */ }
}

export async function coachOn($: EngineInterface): Promise<boolean> {
  try { return (await $.store.get(COACH_KEY)) === true } catch { return false }
}

async function listOf($: EngineInterface): Promise<Entry[]> {
  try {
    const v = await $.store.get(HISTORY_KEY)
    return Array.isArray(v) ? (v as Entry[]) : []
  } catch { return [] }
}

async function failsOf($: EngineInterface): Promise<number> {
  try {
    const v = await $.store.get(FAILS_KEY)
    return typeof v === 'number' ? v : 0
  } catch { return 0 }
}

async function failUsdOf($: EngineInterface): Promise<number> {
  try {
    const v = await $.store.get(FAIL_USD_KEY)
    return typeof v === 'number' ? v : 0
  } catch { return 0 }
}

/** One more call with no score, and what it cost when the usage is known. */
async function bumpFails($: EngineInterface, usd: number | null = null): Promise<void> {
  try { await $.store.set(FAILS_KEY, (await failsOf($)) + 1) } catch { /* a counter only */ }
  if (usd && usd > 0) { try { await $.store.set(FAIL_USD_KEY, (await failUsdOf($)) + usd) } catch { /* a tally only */ } }
}

type Prompt = { text?: unknown; origin?: { kind?: string } | null; command?: unknown; agentId?: unknown }
type Completion = { isAnswered: boolean; text?: string; usage?: object }

/** The whole prompt.submit work. Safe to fire and forget: it never throws. */
export async function coachFirst($: EngineInterface, e: Prompt): Promise<void> {
  let id = ''
  let cost: number | null = null
  let owned = false
  try {
    if (!(await coachOn($))) return
    if (e.origin?.kind === 'plugin' || e.command || e.agentId) return
    const text = typeof e.text === 'string' ? e.text.trim() : ''
    if (text.startsWith('/') || text.length < MIN_CHARS) return
    id = await $.session.id()
    if (inflight.has(id)) return
    inflight.add(id)
    owned = true
    const raw = await $.store.get(SCORED_KEY)
    const scored = Array.isArray(raw) ? (raw as unknown[]).filter((x): x is string => typeof x === 'string') : []
    if (scored.includes(id) && !again.has(id)) return
    // Claimed before the call, so a second prompt sent while it is out is not scored too.
    again.delete(id)
    await $.store.set(SCORED_KEY, [...scored.filter(x => x !== id), id].slice(-KEEP_SCORED))
    inflight.delete(id)
    owned = false
    const r = await ($.model as unknown as { complete(a: object): Promise<Completion> }).complete({
      model: 'haiku', system: RUBRIC, prompt: fence(text), maxTokens: 300, timeoutMs: 20000,
    })
    cost = r && r.usage ? turnCost({ ...(r.usage as object), model: 'haiku' }) : null
    const score = r && r.isAnswered && typeof r.text === 'string' ? parseScore(r.text) : null
    if (!score) { await bumpFails($, cost); return }
    const applicable = appliedOf(score)
    if (applicable === 0) return
    const history = [...(await listOf($)), { at: await $.clock.now(), applicable, covered: coveredOf(score), usd: cost }].slice(-KEEP_BRIEFS)
    await $.store.set(HISTORY_KEY, history)
    const line = hintLine(score, history, cost)
    if (line) { try { await $.ui.log(line) } catch { /* the hint is only a hint */ } }
  } catch {
    await bumpFails($, cost)
  } finally {
    if (owned) inflight.delete(id)
  }
}

export async function coachStatus($: EngineInterface): Promise<string> {
  return statusText(await coachOn($), await listOf($), await failsOf($), await failUsdOf($))
}

/** `coach on|off|status`: the answer text. */
export async function coachCommand($: EngineInterface, value: string | undefined): Promise<string> {
  if (value === 'on' || value === 'off') {
    await $.store.set(COACH_KEY, value === 'on')
    return `coach: ${value}`
  }
  return coachStatus($)
}
