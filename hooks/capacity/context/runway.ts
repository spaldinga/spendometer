// The context's growth and how long it lasts. Pure: figures in, figures out.

/** The weight of the newest context increase in the running growth figure. */
export const GROWTH_ALPHA = 0.3
/** Runways longer than this are shown as `>99`. */
export const RUNWAY_CAP = 99

/**
 * The running growth of the context per turn: an exponential moving average of the increases between
 * successive main turn completions. A drop (compaction) or no change leaves it as it was; the first increase
 * starts it.
 */
export const nextGrowth = (growth: number | undefined, ctxPrev: number | undefined, ctxNow: number): number | undefined => {
  if (ctxPrev === undefined || ctxNow <= ctxPrev) return growth
  const d = ctxNow - ctxPrev
  return growth === undefined ? d : GROWTH_ALPHA * d + (1 - GROWTH_ALPHA) * growth
}

/** Turns until the context is full at the current growth; null until two turns are known or while there is no growth. */
export const runwayTurns = (free: number, growth: number | undefined, turns: number | undefined): number | null =>
  (turns ?? 0) >= 2 && growth !== undefined && growth > 0 ? Math.max(0, free) / growth : null

