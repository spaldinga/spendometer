// The text a node shows now: hover boxes (display none until hovered) are left out.
type Node = { props?: { display?: string }; children?: (Node | string)[] }

export const shown = (n: Node | string | undefined): string => {
  if (n === undefined) return ''
  if (typeof n === 'string') return n
  if (n.props?.display === 'none') return ''
  return (n.children ?? []).map(shown).join('')
}
