import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { LIST_TOOLS, REPORT_TOOL, labelOf } from './activity/progress/progress'
import { countStep, dropFinished, noteListCall, noteReport, startTurn } from './activity/progress/state'
import { addCrew, dropDoneCrew, finishCrew, noteCrewStep } from './activity/crew'
import { OUTPUT_PANE, closedOutput, noteRecent, refreshOutput, resetOutput } from './activity/output/state'
import { outputPane } from './activity/output/pane'
import { SHELLS, holdCommand } from './safety/guard/hold'
import { checkCommand, checkText, textOf } from './safety/advisor/advisor'
import { advise } from './safety/advisor/log'
import { clearSeen, forgetPath, isDeny, measureCall } from './capacity/context/size'
import { MODELS, coldCost, familyOf, turnCost, warmCost } from './cost/prices'
import { TTL_MS, cacheFacts, cleanOldCache, putCache, resetCache } from './cost/cache/facts'
import { SPEND_KEEP_MS, addKeepWarm, addResults, addSpend, addToolOut, addContext, cleanOldDays, cleanOldPace, cleanOldSpend } from './cost/spend/record'
import type { Keep } from './cost/cache/keepwarm/state'
import { cleanOldKeep, freshKeep } from './cost/cache/keepwarm/state'
import { coachFirst, markNextFirst } from './cost/coach/coach'
import { pingKeptCacheWarm } from './cost/cache/keepwarm/pinger'
import { afterTurn, endConversation, keepOf, noteCompact, noteRequest, noteSeeded, startKeep } from './cost/cache/keepwarm/lifecycle'
import { keepwarmCommand, warnCold } from './cost/cache/keepwarm/command'
export { pingKeptCacheWarm }
export type { PingUsage } from './cost/cache/keepwarm/pinger'
import { arm, renderBand } from './band/render'
import { resetFold } from './band/buttons'
import { HOLD_KEY, SETTINGS, settingsAnswer, switchOf } from './band/settings'
import { nextGrowth } from './capacity/context/runway'
import { pull, setWindows } from './capacity/usage/windows'

// A band above the prompt in a warm dark look: card surface, cream text,
// dot-matrix bars. Shows how much of each usage window is LEFT, 7-day first, then
// 5-hour; 7D is orange, 5H is yellow; a window under 15% adds a bold LOW.
//
// After the first reply it also shows the prompt cache: WARM (red, Robo bobbing)
// for an hour after the last request, then COLD (blue, Robo frozen) with what the
// next message costs to re-cache. The arrow button folds the card; warm starts hasCache,
// cold starts open, and a choice holds until the cache flips. Zero token cost:
// it reads the engine's own figures and draws.
//
// It keeps the cache warm itself (hooks/keepwarm.ts): one switch per conversation, on until unticked,
// that the button, the typed /keepwarm and the ping timer all read. A ping that really read the cache
// starts the hour again. With cache-tax installed it stays passive: two pingers would ping twice.


/** Milliseconds in a second: the host reports the idle time of a resumed session in seconds. */
const MS_PER_SECOND = 1000

/** When the main thread last sent a request that was not a keep-warm ping (clock ms), or null before the first. */
const realAt = atom({ plugin: 'spendometer', key: 'realAt' } as const, null as number | null)

/** Measures a finished call (capacity/context) and adds what it found to the Spent record (cost/spend). */
const countCall = async ($: EngineInterface, tool: string, e: unknown, r: unknown): Promise<void> => {
  const m = await measureCall($, tool, e, r)
  if (m) await addToolOut($, m.tool, m.tokens, m.reread, m.file)
}


/** Fresh context figures from the engine onto the cache facts, when it has them. */
const measure = async ($: EngineInterface, lastAt: number | null, model: string | null): Promise<void> => {
  const u = await $.session.usage()
  const m = model ?? (await $.session.model())
  await putCache($, c => ({
    lastAt: lastAt ?? c?.lastAt ?? 0,
    tokens: u.context.tokens && u.context.tokens > 0 ? u.context.tokens : (c?.tokens ?? 0),
    window: u.context.window || c?.window || 0,
    model: m || c?.model || null,
  }))
}


/** Counts what a shell command that ran left behind: its commits and pull requests, and its output in the context. */
const afterShell = async ($: EngineInterface, tool: string, e: unknown, command: string, r: unknown): Promise<void> => {
  if (!isDeny(r)) await addResults($, command)
  await countCall($, tool, e, r)
}

export const register: Register = on => {
  /** The keep-warm pinger's state for this process: one conversation at a time. */
  const kw = freshKeep()

  for (const tool of SHELLS) {
    on('tool.call', { tool }, async ($, e, next) => {
      const command = String(e.command ?? '')
      // Warn only: the advisor never changes the call, and an error in it is swallowed.
      try { await advise($, tool, checkCommand(command)) } catch { /* the call goes on */ }
      return holdCommand($, e, next, command, () => switchOf($, HOLD_KEY, true), r => afterShell($, tool, e, command, r))
    })
  }

  // Tool output that enters the main context, by tool. Only these tools are hooked: a hook on a tool turns off its
  // move to the background and its live output. The call is awaited and returned as it is; the measuring never throws.
  for (const tool of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      const r = await next(e)
      if (tool === 'WebFetch') {
        try {
          const host = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s]*@)?([^/:?#\s]+)/i.exec(String(e.url ?? ''))?.[1] ?? 'page'
          await advise($, `WebFetch ${host}`, checkText(textOf(r)))
        } catch { /* the result goes on */ }
      }
      await countCall($, tool, e, r)
      return r
    })
  }
  // Skill text enters the context like a fetched page. Skill has no background move or live output to lose (ADR 0002).
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const r = await next(e)
    try {
      const args = (e as unknown as { args?: unknown }).args
      const skill = String((e as unknown as { skill?: unknown }).skill ?? 'skill')
      await advise($, `Skill ${skill}`, checkText(textOf(r) + (args ? '\n' + textOf(args) : '')))
    } catch { /* the result goes on */ }
    return r
  }).catch(($, e, next) => next(e))
  // An edit makes the file new: reading it again is not a re-read. Its own output counts like any tool's.
  for (const tool of ['Edit', 'Write', 'NotebookEdit'] as const) {
    on('tool.call', { tool }, async ($, e, next) => {
      const r = await next(e)
      await forgetPath($, e, r)
      await countCall($, tool, e, r)
      return r
    })
  }

  on('session.start', async ($, e, next) => {
    arm($)
    try { await pull($) } catch { /* the render reads the engine itself when the atom is empty */ }
    try {
      await $.command.register({
        name: SETTINGS,
        description: "Settings for the band above the prompt: the progress row's look and the hold for risky git commands",
        argumentHint: 'fold | cost | progress [id] | hold on|off | advisor on|off|status | coach on|off|status',
        immediate: true,
      })
    } catch { /* without the command the settings keep their defaults */ }
    // Saved costs of sessions not touched for a month are dropped.
    try {
      const nowMs = await $.clock.now()
      const cutoff = nowMs - SPEND_KEEP_MS
      const keys = await $.store.keys()
      await cleanOldCache($, keys, cutoff)
      await cleanOldPace($, keys) // pace samples are no longer kept: the pace comes from the window's own length
      await cleanOldKeep($, keys, cutoff)
      await cleanOldDays($, keys, nowMs)
      await cleanOldSpend($, keys, cutoff)
    } catch { /* an entry that stays is only a few bytes */ }
    // The conversation's window comes back from the store (a restart lost its timer); /keepwarm is registered unless cache-tax is there.
    try { await startKeep($, kw) } catch { /* the band goes on without keep-warm */ }
    // For a request the model keeps no task list for. Listed up front: nobody goes looking for a progress tool.
    try {
      await $.tool.register({
        name: 'progress',
        description:
          'Report where you are in a multi-step request to the progress bar above the prompt. ' +
          'Call it once at the start with `total` (your plan in 3-8 steps), `done: 0` and a `note` naming the step in hand; ' +
          'again as each step finishes; and with `finished: true` at the end. Fields left out keep their value. ' +
          'Skip it whenever you keep a task list: the bar reads that by itself. Cheap and silent: it only draws a bar.',
        inputSchema: {
          type: 'object',
          properties: {
            total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
            done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
            note: { type: 'string', description: 'The step in hand, a few words.' },
            finished: { type: 'boolean', description: 'True once the request is done.' },
          },
        },
        isDeferred: false,
      })
    } catch { /* without the tool the bar still follows the task list */ }
    return next(e)
  })

  // The task list the main session keeps is its own account of where it is. The call goes on untouched.
  for (const tool of LIST_TOOLS) {
    on('tool.call', { tool }, async ($, e, next) => {
      if (!e.agentId) await noteListCall($, tool, e as unknown as Record<string, unknown>)
      return next(e)
    }).catch(($, e, next) => next(e)) // a bar that fails to read a list never holds up the tool
  }

  on('tool.call', { tool: REPORT_TOOL }, async ($, e) => {
    // A subagent's steps are not the request's: only the main session moves the bar.
    if (e.agentId) return { result: 'ignored: only the main session reports progress' }
    const p = await noteReport($, e as unknown as Record<string, unknown>)
    return { result: p ? `ok: ${labelOf(p).count}` : 'ok' }
  })

  on('command.run', { command: SETTINGS }, async ($, e) => ({ text: await settingsAnswer($, kw, String(e.args ?? '')) }))

  // The typed /keepwarm: one answer, and the switch, the window and the store move together. With cache-tax
  // installed the command is its own: this mod stays passive and lets it answer.
  on('command.run', { command: 'keepwarm' }, async ($, e, next) => {
    if ((await keepOf($, kw)) === null) return next(e)
    return { text: await keepwarmCommand($, kw, String(e.args ?? '')) }
  }).catch(($, e, next) => next(e))

  // A prompt that would re-write a cold cache: one line with the price, then it goes on. Never dropped.
  on('prompt.submit', async ($, e, next) => {
    try { await warnCold($, kw, e as never) } catch { /* a missing warning is only that */ }
    // The brief coach is a hint: fired, never awaited, so the prompt goes on at once.
    void coachFirst($, e as never).catch(() => {})
    return next(e)
  })

  // After a compaction nothing pings until the next turn.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) {
      markNextFirst()
      try { await noteCompact($, kw) } catch { /* the next turn re-arms */ }
    }
    return r
  })


  // /clear ends the conversation whose facts these are. It does reach mods, unlike a start event after it.
  on('session.end', async ($, e, next) => {
    // A /clear ends this conversation: the band forgets it. Its saved entry stays (the next conversation has
    // another id, so it is never read again) and is pruned after a month.
    // The keep-warm window belongs to the conversation that ends, under /clear and an in-process resume alike.
    if (e.reason === 'clear' || e.reason === 'resume') {
      try { await endConversation($, kw, e.sessionId) } catch { /* the next turn seats the new conversation */ }
    }
    if (e.reason === 'clear') {
      markNextFirst()
      try {
        await resetCache($)
        await resetFold($)
        await clearSeen($)
        await resetOutput($)
      } catch { /* the band redraws from the next turn */ }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await setWindows($, e.rateLimits)
    }
    if (e.changed.includes('context') && e.context.tokens && e.context.tokens > 0) {
      const tokens = e.context.tokens
      // The context fell below half of what it was: a compaction, after which reading a file again is legitimate.
      try {
        const was = (await cacheFacts($))?.tokens ?? 0
        if (was > 0 && tokens < was / 2) await clearSeen($)
      } catch { /* the seen-set stays */ }
      await putCache($, c => (c ? { ...c, tokens, window: e.context.window || c.window } : c))
    }
    return next(e)
  })

  // A resumed or forked session knows how long it was away and how big it is.
  on('classic.SessionStart', async ($, e, next) => {
    const r = await next(e)
    if (e.source === 'clear' || e.source === 'compact') {
      await putCache($, () => null)
      await resetFold($)
      await clearSeen($)
      await resetOutput($)
    } else if ((e.source === 'resume' || e.source === 'fork') && typeof e.seconds_since_last_response === 'number') {
      const now = await $.clock.now()
      const lastAt = now - e.seconds_since_last_response * MS_PER_SECOND
      const window = (await $.session.usage()).context.window
      const model = typeof e.model === 'string' ? e.model : await $.session.model()
      const tokens = typeof e.context_tokens === 'number' ? e.context_tokens : 0
      await putCache($, () => ({ lastAt, tokens, window, model }))
      // A window restored before this reading was scheduled without a cache clock.
      try { await noteSeeded($, kw) } catch { /* the next turn re-arms */ }
    }
    return r
  }).catch(($, e, next) => next(e)) // a band that fails to seed never holds up the session

  // Each main-thread request reads or writes the cache, so its start resets the hour.
  on('turn.step', async function* ($, e, next) {
    arm($)
    if (!e.agentId) {
      try { await noteRequest($, kw, e) } catch { /* the pinger reads the next request */ }
      const now = await $.clock.now()
      // Read before putCache overwrites lastAt. A turn that begins after the cache's hour would have found
      // it cold, but pings kept it warm: the difference between a cold re-cache and a cache read is saved.
      const before = e.index === 0 ? await cacheFacts($) : null
      const lastReal = await read($, realAt)
      // A warm-now ping re-wrote a cold cache since that request: the next message did not avoid a re-write, the ping
      // paid it, so the gap counts from the ping.
      const was = lastReal !== null && kw.rewroteAt > lastReal ? kw.rewroteAt : lastReal
      await update($, realAt, () => now)
      if (before && was !== null && now - was >= TTL_MS && now - before.lastAt < TTL_MS) {
        const m = MODELS.find(x => x.id === familyOf(before.model))
        const saved = m ? coldCost(m, before.tokens) - warmCost(m, before.tokens) : 0
        if (saved > 0) await addKeepWarm($, { saved })
      }
      await putCache($, c => ({ lastAt: now, tokens: c?.tokens ?? 0, window: c?.window ?? 0, model: c?.model ?? null }))
      // A turn's first request starts its clock, and a list finished last turn has had its moment.
      if (e.index === 0) {
        await startTurn($, now)
        await dropFinished($)
        await dropDoneCrew($)
      } else {
        await countStep($, now)
      }
    } else {
      // A subagent's request. One the band never saw start still gets a place.
      await noteCrewStep($, e.agentId)
    }
    yield* next(e)
    // After the step, so its messages exist: the watched subagent's pane takes what is new.
    if (e.agentId) await refreshOutput($, e.agentId)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started
    const id = started.agentId ?? e.tool_use_id
    const type = String(e.subagentType || 'agent')
    const startedAt = await $.clock.now()
    await addCrew($, id, type, startedAt)
    await noteRecent($, id, type, false)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // What the turn used, at list prices, onto the conversation's running cost.
    const paid = turnCost(e.usage) ?? 0
    if (e.agentId) {
      const id = e.agentId
      const { type, start, end, prevEnd } = await finishCrew($, id, paid, e.durationMs)
      if (paid > 0) await addSpend($, paid, false, e.usage, type, { start, end, prevEnd })
      await noteRecent($, id, type, true)
      await refreshOutput($, id)
      return r
    }
    if (paid > 0) await addSpend($, paid, true, e.usage)
    const now = await $.clock.now()
    const c = await read($, { plugin: 'spendometer', key: 'cache' } as const)
    // turn.step stamps the exact request time; when no step of this turn did, the turn's end is the floor.
    const lastAt = !c || now - c.lastAt > e.durationMs ? now : c.lastAt
    try { await pull($) } catch { /* the figures come with the next reading */ }
    await measure($, lastAt, e.usage?.model ?? null)
    await addContext($, nextGrowth)
    // After the cache clock is stamped: the next ping counts from it.
    try { await afterTurn($, kw, { hasUsage: !!e.usage }) } catch { /* the next turn tries again */ }
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => renderBand($, e, next, kw))

  // The subagent output pane: drawn by outputPane; closing it (by the person or by us) stops the refreshing.
  on('ui.render', { component: 'Pane', requestId: OUTPUT_PANE }, ($, e) => outputPane($, e))
  on('ui.close', { id: OUTPUT_PANE }, async ($, e, next) => {
    await closedOutput($)
    return next(e)
  }).catch(($, e, next) => next(e)) // a pane that fails to note its closing is still closed
}
