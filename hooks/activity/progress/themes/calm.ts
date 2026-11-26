import { paceSvg, walkSvg } from '../art'
import type { Progress } from '../../../../types'

export const calmWalk = (p: Progress, W: number): string => walkSvg(p.done, p.total, W, p.hasCurrent, p.isFinished)
export const calmPace = (W: number): string => paceSvg(W)
