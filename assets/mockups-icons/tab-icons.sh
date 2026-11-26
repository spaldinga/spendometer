#!/usr/bin/env bash
# Writes tab-icons.svg beside this script: mockups of the tab buttons' glyphs and selected marker (backlog 120).
# Hand-drawn, not the mod's own drawing. Each option is shown wide (words) and narrow (one glyph), light and dark,
# with Context selected. Text is assumed 7.5 px a character. Glyphs a font may lack are listed in the caption.
set -eu
export LC_ALL=C.UTF-8
cd "$(dirname "$0")"
FONT="Cascadia Mono, Consolas, Menlo, monospace"

# --- one button group. args: x y bg btn text sel-fill labels... (three labels: overview context cost)
group() {
  local x=$1 y=$2 btn=$3 txt=$4 sel=$5 a=$6 b=$7 c=$8 l w
  for l in "$a" "$b" "$c"; do
    w=$(( ${#l} * 15 / 2 + 18 ))
    printf '<rect x="%s" y="%s" width="%s" height="24" rx="6" fill="%s"/>' $x $y $w "$btn"
    local f=$txt; [ "$l" = "$b" ] && f=$sel
    printf '<text x="%s" y="%s" font-size="13" font-family="%s" fill="%s" text-anchor="middle" xml:space="preserve">%s</text>' $(( x + w / 2 )) $(( y + 16 )) "$FONT" "$f" "$l"
    x=$(( x + w + 8 ))
  done
}

# --- option block. args: y title wide-o wide-c wide-k narrow-o narrow-c narrow-k  (labels of Context selected)
block() {
  local y=$1 title=$2
  printf '<text x="20" y="%s" font-size="14" font-weight="700" fill="#e8e2d2" font-family="sans-serif">%s</text>' $(( y + 16 )) "$title"
  # light panel left, dark panel right
  printf '<rect x="20" y="%s" width="560" height="84" rx="8" fill="#f4f1e8"/>' $(( y + 28 ))
  printf '<rect x="600" y="%s" width="560" height="84" rx="8" fill="#1c1a16"/>' $(( y + 28 ))
  group  36 $(( y + 38 )) '#e3dfd2' '#3a372f' '#d4501a' "$3" "$4" "$5"
  group  36 $(( y + 74 )) '#e3dfd2' '#3a372f' '#d4501a' "$6" "$7" "$8"
  group 616 $(( y + 38 )) '#3a3832' '#c9c3b2' '#ff8a3d' "$3" "$4" "$5"
  group 616 $(( y + 74 )) '#3a3832' '#c9c3b2' '#ff8a3d' "$6" "$7" "$8"
}
cap() { printf '<text x="20" y="%s" font-size="12" fill="#a8a28f" font-family="sans-serif">%s</text>' "$1" "$2"; }

{
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 580" width="1180" height="580"><rect width="1180" height="580" fill="#2a2925"/>'
block 10  'Now: ◷ ◧ $, selected in brackets (◷ falls back to another font; shown as [G] in the dark narrow screenshot)' \
  'Overview' '[Context]' 'Cost' '◷' '[◧]' '$'
cap 138 'Falls back: ◷ ◧ (not in Consolas, Cascadia or Menlo).'
block 140 'A. Hollow / filled: ○ □ ◊ become ● ■ ♦ when selected, same width' \
  '○ Overview' '■ Context' '◊ Cost' '○' '■' '◊'
cap 268 'Falls back: none expected; ○ ● □ ■ ◊ ♦ are all in the WGL4 set. Cost: shapes carry no meaning.'
block 270 'B. Meaningful: ≡ ▒ $, selected gets a ► in front' \
  'Overview' '► Context' 'Cost' '≡' '►▒' '$'
cap 398 'Falls back: none expected (≡ ▒ ► are WGL4). Cost: the marker adds a column; narrow row grows by about 1 character.'
block 400 'C. ASCII only: = # $, selected gets a > in front' \
  'Overview' '>Context' 'Cost' '=' '>#' '$'
cap 528 'Falls back: nothing, ever. Cost: plainest look, marker adds a column.'
printf '<text x="20" y="556" font-size="12" fill="#a8a28f" font-family="sans-serif">Context selected in every row. Wide = words, narrow = one glyph. Light and dark panels are drawn by hand; the app draws its own button background.</text>'
printf '</svg>\n'
} > tab-icons.svg
echo wrote tab-icons.svg
