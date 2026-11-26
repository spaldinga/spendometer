// The brief coach (backlog 150, a proof of concept): on the first prompt of a conversation, one small Haiku call scores
// which parts of a brief it covers and one transcript line says so. A hint only: it never holds, changes or delays the
// prompt, and any failure shows nothing. Its own tally (`coachHistory`, `coachFails`) is not part of the session's spend.

import type { EngineInterface } from 'claude-code'

import { turnCost } from '../prices'
import { KEEP_BRIEFS, RUBRIC, appliedOf, coveredOf, fence, hintLine, parseScore, statusText } from './rubric'
import type { Entry } from './rubric'

export const COACH_KEY = 'coach'
const LAST_KEY = 'coachLast'
const HISTORY_KEY = 'coachHistory'
const FAILS_KEY = 'coachFails'
/** Shorter prompts are go-aheads ("kör", "ok go"), not briefs. */
const MIN_CHARS = 40

/** Set by /clear and by a compaction: the next prompt is a first prompt again. Lost on a reload, which is harmless. */
let nextFirst = false
export const markNextFirst = (): void => { nextFirst = true }

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

async function bumpFails($: EngineInterface): Promise<void> {
  try { await $.store.set(FAILS_KEY, (await failsOf($)) + 1) } catch { /* a counter only */ }
}

type Prompt = { text?: unknown; origin?: { kind?: string } | null; command?: unknown; agentId?: unknown }
type Completion = { isAnswered: boolean; text?: string; usage?: object }

/** The whole prompt.submit work. Safe to fire and forget: it never throws. */
export async function coachFirst($: EngineInterface, e: Prompt): Promise<void> {
  try {
    if (!(await coachOn($))) return
    if (e.origin?.kind === 'plugin' || e.command || e.agentId) return
    const text = typeof e.text === 'string' ? e.text.trim() : ''
    if (text.startsWith('/') || text.length < MIN_CHARS) return
    const id = await $.session.id()
    const last = await $.store.get(LAST_KEY)
    if (last === id && !nextFirst) return
    // Claimed before the call, so a second prompt sent while it is out is not scored too.
    nextFirst = false
    await $.store.set(LAST_KEY, id)
    const r = await ($.model as unknown as { complete(a: object): Promise<Completion> }).complete({
      model: 'haiku', system: RUBRIC, prompt: fence(text), maxTokens: 300, timeoutMs: 20000,
    })
    const score = r && r.isAnswered && typeof r.text === 'string' ? parseScore(r.text) : null
    if (!score) { await bumpFails($); return }
    const applicable = appliedOf(score)
    if (applicable === 0) return
    const cost = turnCost({ ...(r.usage as object), model: 'haiku' })
    const history = [...(await listOf($)), { at: await $.clock.now(), applicable, covered: coveredOf(score), usd: cost }].slice(-KEEP_BRIEFS)
    await $.store.set(HISTORY_KEY, history)
    const line = hintLine(score, history, cost)
    if (line) { try { await $.ui.log(line) } catch { /* the hint is only a hint */ } }
  } catch {
    await bumpFails($)
  }
}

export async function coachStatus($: EngineInterface): Promise<string> {
  return statusText(await coachOn($), await listOf($), await failsOf($))
}

/** `coach on|off|status`: the answer text. */
export async function coachCommand($: EngineInterface, value: string | undefined): Promise<string> {
  if (value === 'on' || value === 'off') {
    await $.store.set(COACH_KEY, value === 'on')
    return `coach: ${value}`
  }
  return coachStatus($)
}
