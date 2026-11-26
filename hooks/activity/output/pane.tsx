// The output pane (`ui.render` for `{ component: 'Pane' }`): the watched subagent's name and state, a row to switch
// between the recent agents, and the tail of its output that fits.

import type { EngineInterface } from 'claude-code'

import { runningCrew } from '../crew'
import { openOutput, outputView } from './state'

/** What the render reads of the event: the room the pane has. */
type PaneEvent = { props?: { scroll?: { bodyRows?: number } }; viewport?: { rows?: number } }

/** The pane's body for `e`. */
export async function outputPane<E extends PaneEvent>($: EngineInterface, e: E) {
  const { Box, Text, Button } = $.ui.resolve(e as never)
  const { w, out, recent } = await outputView($)
  if (!w) return <Text dimColor>Click a subagent in the band to see its output.</Text>

  const rec = recent.find(r => r.id === w.id)
  const isRunning = (rec && !rec.isDone) || (await runningCrew($)).some(c => c.id === w.id)
  const mine = out && out.id === w.id ? out : null
  const rows = e.props?.scroll?.bodyRows ?? e.viewport?.rows ?? 20
  const switching = recent.length > 1
  const room = Math.max(1, rows - 1 - (switching ? 1 : 0))
  const lines = mine?.lines ?? []

  return (
    <Box flexDirection="column">
      <Text bold>{`${w.type} · ${isRunning ? 'running' : 'done'}`}</Text>
      {switching ? (
        <Box flexDirection="row">
          {recent.map(r => (
            <Box key={`out-box-${r.id}`} marginRight={1}>
              <Button key={`out-${r.id}`} label={r.type} plain dimColor={r.id !== w.id} onPress={() => openOutput($, r.id, r.type)} />
            </Box>
          ))}
        </Box>
      ) : null}
      {mine?.denied !== undefined ? <Text dimColor>{`This agent's output can't be read here: ${mine.denied}`}</Text> : null}
      {mine?.denied === undefined && lines.length === 0 ? <Text dimColor>No output yet.</Text> : null}
      {lines.slice(-room).map((l, i) => (
        <Text key={`l${i}`} wrap="truncate-end">{l}</Text>
      ))}
    </Box>
  )
}
