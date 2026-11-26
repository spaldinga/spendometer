/** One usage window: which one, how much is used (0 to 100), when it resets. */
export type Window = { kind: string; percentUsed: number; resetsAt?: string }

/**
 * The prompt cache as the band last saw it: when the main thread last sent a
 * request (clock milliseconds), how much context the next request re-sends,
 * the model's context window, and the model.
 */
export type CacheFacts = { lastAt: number; tokens: number; window: number; model: string | null }

/** Whether the cache card is open, remembered only for the state it was set in. */
export type Fold = { mode: 'warm' | 'cold'; open: boolean }

export type StepStatus = 'pending' | 'in_progress' | 'completed'

/** One step of the request, as the task list names it. */
export type Step = { title: string; status: StepStatus }

/**
 * Where the main session is in the request: the steps of its task list (empty
 * when it reported counts through the mod's tool instead), how many are done of
 * how many, the step in progress, and whether one is.
 */
export type Progress = { steps: Step[]; done: number; total: number; note: string; hasCurrent: boolean; isFinished: boolean }

/** The turn in flight: when its first request went out and how many requests it has made. */
export type Turn = { startedAt: number; steps: number }

/** One subagent of the main session: what kind it is, how many requests it has made, whether it is finished. */
export type Worker = { id: string; type: string; steps: number; isDone: boolean; startedAt?: number; endedAt?: number }

/** What this conversation has cost so far at list prices, in dollars: the main session's turns and its subagents'. */
export type Spend = { main: number; subs: number }

/**
 * What the store keeps per session under `spend:<session id>`: the totals, the latest turn's cost, and when it was written (clock ms).
 * `pings` is what keep-warm pings that kept the cache alive cost, `saved` what they saved against a cold re-cache; both are
 * left out of older records and of the conversation's total.
 *
 * The rest feed the card's metric row and are all left out of older records: `turns` counts the priced main turns
 * since they were first tracked and `paidTurns` is what those cost (so the average is not skewed by earlier
 * spend); `readTok` is the cache-read input over those turns and `inTok` all their input (fresh, read and written);
 * `ctxPrev` the context size at the last main turn's end and `growth` the moving average of its increases;
 * `byType` the subagents' cost per type.
 *
 * Also optional: `byModel` the cost per model family (main and subagent turns, priced ones only) and `totTok` all their
 * tokens (input, output, cache read and write), so cost over tokens is the effective price; `subsAtMain` what the
 * subagent turns would have cost at the main session's model, each turn counted at no less than it really cost, so
 * `subsAtMain - subs` is what delegating saved; `spans` the subagents' run intervals [start, end] in clock ms (the last 200).
 */
export type Spent = Spend & {
  last: number
  at: number
  pings?: number
  /** Git commits and pull requests the conversation's shell commands made (counted from the command text). */
  commits?: number
  prs?: number
  saved?: number
  turns?: number
  paidTurns?: number
  readTok?: number
  inTok?: number
  ctxPrev?: number
  growth?: number
  byType?: Record<string, number>
  byModel?: Record<string, number>
  /** Tokens of tool output that entered the main conversation's context, per tool (about 4 characters a token). */
  byTool?: Record<string, number>
  /** Files the main thread read again unchanged, and the tokens those re-reads cost. */
  rereads?: number
  rereadTok?: number
  /** The context size after the first priced main turn: an estimate of the setup (system prompt, tools, memory). */
  ctxFirst?: number
  /** Re-reads per file basename, the 5 most recently re-read files, oldest first. */
  rereadFiles?: Record<string, number>
  totTok?: number
  subsAtMain?: number
  /** Subagent cost counted from the same moment as subsAtMain, so a record from before that does not skew the saving. */
  subsPaid?: number
  spans?: [number, number][]
}

declare module 'claude-code' {
  interface PluginState {
    'spendometer': {
      windows: Window[]
      cache: CacheFacts | null
      fold: Fold | null
      progress: Progress | null
      turn: Turn | null
      crew: Worker[]
      subsSince: number
      realAt: number | null
      seen: string[]
    }
  }
}
