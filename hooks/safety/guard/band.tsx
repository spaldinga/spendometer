// The band drawn while a command is held: what it would lose, and the two answers. Cancel comes first.

import type { EngineInterface } from 'claude-code'

import { INK, ORANGE, YELLOW } from '../../band/look'
import type { Held } from './hold'

type Ui = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Button' | 'Text'>

/** The longest command the held band shows, in characters; a longer one is cut with an ellipsis. */
const SHOWN_MAX = 90

/** The held band for a held call, once it has its report; null before that. */
export function heldBand(holding: Held, ui: Ui) {
  const { Box, Button, Text } = ui
  const rep = holding.report
  if (!rep) return null
  const shown = holding.command.length > SHOWN_MAX ? holding.command.slice(0, SHOWN_MAX - 1) + '…' : holding.command
  return (
    <Box key="held" flexDirection="column" paddingX={1}>
      <Box flexDirection="row" alignItems="center">
        <Text key="held-chip" backgroundColor={ORANGE} color={INK} bold>{' HELD '}</Text>
        <Text key="held-command" color="text" bold>{` ${shown}`}</Text>
        <Box key="grow" flexGrow={1} />
        <Box key="held-no" flexShrink={0} marginLeft={1}>
          <Button key="held-cancel" label="Cancel" onPress={() => { holding.decision = 'cancel' }} />
        </Box>
        <Box key="held-yes" flexShrink={0} marginLeft={1}>
          <Button key="held-proceed" label="Proceed" onPress={() => { holding.decision = 'proceed' }} />
        </Box>
      </Box>
      <Text key="held-summary" color={YELLOW} bold>{`Would ${rep.summary}`}</Text>
      {rep.lines.map((l, i) => <Text key={`held-line-${i}`} color="text">{`  ${l}`}</Text>)}
      {rep.more > 0 ? <Text key="held-more" color="subtle">{`  and ${rep.more} more`}</Text> : null}
      {rep.note ? <Text key="held-note" color="subtle">{rep.note}</Text> : null}
    </Box>
  )
}
