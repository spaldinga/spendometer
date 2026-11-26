// What the advisor found, kept in the store so the proof of concept can be judged after a while, and the switch and
// the warning that use it. The switch reader is a copy of band/settings' `switchOf`: a domain does not import band
// (ADR 0008).

import type { EngineInterface } from 'claude-code'

import { warning } from './advisor'
import type { Finding, Kind } from './advisor'

export const ADVISOR_KEY = 'advisor'
const LOG_KEY = 'advisorLog'
const RECENT_MAX = 50
const SHOWN = 10
const DAY_MS = 24 * 60 * 60 * 1000

type Entry = { at: number; kind: Kind; source: string; detail: string }
type AdvisorLog = { since: number; counts: Record<Kind, number>; recent: Entry[] }
const KINDS: Kind[] = ['injection', 'outbound', 'upload', 'delete']

async function nowOf($: EngineInterface): Promise<number> {
  try { return await $.clock.now() } catch { return Date.now() }
}

/** The log in the store, or null when none was kept or it is not readable. */
async function readLog($: EngineInterface): Promise<AdvisorLog | null> {
  try {
    const v = (await $.store.get(LOG_KEY)) as Partial<AdvisorLog> | undefined
    if (!v || typeof v.since !== 'number' || !v.counts || !Array.isArray(v.recent)) return null
    return { since: v.since, counts: { injection: 0, outbound: 0, upload: 0, delete: 0, ...v.counts }, recent: v.recent }
  } catch {
    return null
  }
}

/** Adds findings to the log. Never throws. */
export async function noteFindings($: EngineInterface, source: string, findings: Finding[]): Promise<void> {
  try {
    if (!findings.length) return
    const at = await nowOf($)
    const log = (await readLog($)) ?? { since: at, counts: { injection: 0, outbound: 0, upload: 0, delete: 0 }, recent: [] }
    for (const f of findings) {
      log.counts[f.kind] += 1
      log.recent.push({ at, kind: f.kind, source, detail: f.detail })
    }
    log.recent = log.recent.slice(-RECENT_MAX)
    await $.store.set(LOG_KEY, log)
  } catch { /* a missing count is only that */ }
}

const day = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** The log as markdown: the counts, the latest entries, and the question the proof of concept is judged by. */
export async function advisorReport($: EngineInterface): Promise<string> {
  const log = await readLog($)
  if (!log) return 'advisor: no warnings yet'
  const now = await nowOf($)
  const total = KINDS.reduce((n, k) => n + log.counts[k], 0)
  const days = Math.floor((now - log.since) / DAY_MS)
  const lines = log.recent.slice(-SHOWN).reverse().map(r => `- ${day(r.at)} ${r.kind} ${r.source}: ${r.detail}`)
  return (
    `${total} warnings since ${day(log.since)} (${days} days): ` + KINDS.map(k => `${k} ${log.counts[k]}`).join(', ') + '\n\n' +
    lines.join('\n') + '\n\n' +
    'Please mark which of these were real, so the advisor can be judged.'
  )
}

async function isOn($: EngineInterface): Promise<boolean> {
  try {
    const v = await $.store.get(ADVISOR_KEY)
    return typeof v === 'boolean' ? v : true
  } catch {
    return true
  }
}

/** Warns about findings in one line in the transcript (fired, never awaited) and records them. Never throws, never holds a call. */
export async function advise($: EngineInterface, source: string, findings: Finding[]): Promise<void> {
  try {
    if (!findings.length || !(await isOn($))) return
    void Promise.resolve($.ui.log(warning(source, findings))).catch(() => {})
    await noteFindings($, source, findings)
  } catch { /* the call goes on exactly as without the advisor */ }
}
