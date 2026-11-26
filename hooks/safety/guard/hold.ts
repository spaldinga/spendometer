// The hold: a risky git command waits until the person answers in the band. The call that is held, and which way of
// waiting works on this machine, are module variables that stay private behind functions. Written as function
// declarations: a hook's `$` is followed past an import only into those. What happens after a call that ran (counting
// its commits and tool output) is cost's and capacity's job, so register.tsx passes it in as `after`.

import type { EngineInterface } from 'claude-code'

import { classify, measure as measureRisk, refusal } from './guard'
import type { Report, Risk } from './guard'

/** The shells whose command lines are read. */
export const SHELLS = ['Bash', 'PowerShell'] as const
const HOLD_LIMIT_MS = 10 * 60 * 1000
/** A wait that came back sooner than this did not wait, so it is not used to hold. */
const WAIT_FLOOR_MS = 100
/** How long one try of a wait command may run (ms). */
const WAIT_TIMEOUT_MS = 5000
/**
 * A hook has seconds of its own time, but time inside a `$` call is free, so a hold
 * waits in a short process: `sleep` where there is one, and on Windows, where there
 * is not, one second of `ping`.
 */
const WAITS: readonly (readonly string[])[] = [['sleep', '0.5'], ['ping', '-n', '2', '127.0.0.1']]

export type Held = { command: string; risk: Risk; report: Report | null; decision: 'proceed' | 'cancel' | null }
/** The call being held, or null. One at a time; a second risky call waits its turn. */
let held: Held | null = null
/** Which of WAITS works on this machine: unknown until tried, -1 when none does. */
let waitAt: number | null = null

/** The call being held, or null: what the band shows while the person decides. */
export function heldNow(): Held | null {
  return held
}

/** Waits a moment inside a process. False when this machine has no way to: then nothing can be held. */
async function waitTick($: EngineInterface): Promise<boolean> {
  for (let i = waitAt ?? 0; i < WAITS.length && waitAt !== -1; i++) {
    try {
      const before = await $.clock.now()
      const r = await $.process.run([...WAITS[i]], { timeoutMs: WAIT_TIMEOUT_MS })
      if (r.exitCode === 0 && (await $.clock.now()) - before >= WAIT_FLOOR_MS) {
        waitAt = i
        return true
      }
    } catch { /* not on this machine: try the next */ }
    if (waitAt === i) break
  }
  waitAt = -1
  return false
}

/** For tests: forget the held call and which wait works. */
export const resetHold = (): void => {
  held = null
  waitAt = null
}

/** Lets a shell command run, then hands its result to `after` (the counting of its commits and output). */
async function pass<E, R>(e: E, next: (e: E) => Promise<R> | R, after: (r: R) => Promise<void>): Promise<R> {
  const r = await next(e)
  await after(r)
  return r
}

/**
 * A git command that throws work away is held until the person answers in the band.
 * Cancel, no answer and an interrupted turn refuse it. A machine that cannot hold,
 * or an error while holding, lets it through with a note: this is a second look,
 * and the permission rules are still in front of it.
 * `isOn` says whether the hold is switched on; `after` gets the result of a call that was let through.
 */
export async function holdCommand<E, R>(
  $: EngineInterface,
  e: E,
  next: ((e: E) => Promise<R> | R) & { signal?: AbortSignal },
  command: string,
  isOn: () => Promise<boolean>,
  after: (r: R) => Promise<void>,
): Promise<R | { deny: ReturnType<typeof refusal> }> {
  const risk = classify(command)
  if (risk === null) return pass(e, next, after)
  // The hold is on unless /spendometer hold off said otherwise.
  if (!(await isOn())) return pass(e, next, after)
  const interrupted = { deny: refusal('the turn was interrupted', risk.label) }
  // `held` is claimed with no await between the check and the claim, so two waiting calls can't both get through.
  while (held !== null) {
    if (next.signal?.aborted) return interrupted
    if (!(await waitTick($))) break
  }
  if (waitAt === -1) {
    void Promise.resolve($.ui.log(`could not hold \`${risk.label}\` to show what it changes: this machine has no way to wait. It runs as usual.`)).catch(() => {})
    return pass(e, next, after)
  }
  const mine: Held = { command, risk, report: null, decision: null }
  held = mine
  let why: string | null = null
  try {
    mine.report = await measureRisk($, risk, await $.session.cwd())
    $.ui.invalidate('ui.render')
    const startedAt = await $.clock.now()
    while (mine.decision === null && why === null) {
      if (next.signal?.aborted) why = 'the turn was interrupted'
      else if ((await $.clock.now()) - startedAt > HOLD_LIMIT_MS) why = 'no answer within 10 minutes'
      else if (!(await waitTick($))) break
    }
  } catch { /* an error while holding lets the command through, below */ } finally {
    if (held === mine) held = null
    $.ui.invalidate('ui.render')
  }
  const summary = mine.report?.summary ?? risk.label
  if (mine.decision === 'cancel') return { deny: refusal('the user pressed Cancel', summary) }
  if (why !== null) return { deny: refusal(why, summary) }
  if (mine.decision !== 'proceed') {
    void Promise.resolve($.ui.log(`could not keep holding \`${risk.label}\`, so it runs as usual.`)).catch(() => {})
  }
  return pass(e, next, after)
}
