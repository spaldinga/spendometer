// A subagent's messages as the lines the output pane shows. Pure: the pane and the state take what it returns.

import type { SessionMessage } from 'claude-code'

/** How many lines the pane keeps: the newest. */
export const OUT_KEEP = 200
const LINE_MAX = 300
const PROMPT_MAX = 100
const ARG_MAX = 60
/** The inputs that say what a tool use is about, in the order they are tried. */
const ARG_KEYS = ['description', 'command', 'file_path', 'pattern', 'prompt']

const cut = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1) + '…' : s)

/** The first string input that says what the call is about, its first line, cut short; '' when there is none. */
function argOf(input: Record<string, unknown>): string {
  for (const k of ARG_KEYS) {
    const v = input[k]
    if (typeof v === 'string' && v.trim()) return cut(v.trim().split(/\r?\n/)[0], ARG_MAX)
  }
  return ''
}

/**
 * The output as lines: an assistant message's text a line per line (blanks dropped) then `→ tool arg` for each tool use;
 * a user message's own text (the subagent's prompt) as `▸ first line`; tool results are left out. The last OUT_KEEP lines.
 */
export function outputLines(messages: SessionMessage[]): string[] {
  const out: string[] = []
  for (const m of messages) {
    if (m.role === 'assistant') {
      for (const l of m.text.split(/\r?\n/)) if (l.trim()) out.push(l)
      for (const u of m.toolUses) {
        const a = argOf(u.input ?? {})
        out.push(a ? `→ ${u.tool} ${a}` : `→ ${u.tool}`)
      }
    } else if (m.text.trim()) {
      out.push('▸ ' + cut(m.text.trim().split(/\r?\n/)[0], PROMPT_MAX))
    }
  }
  return out.slice(-OUT_KEEP).map(l => cut(l, LINE_MAX))
}
