#!/usr/bin/env bash
# Writes keep-emoji.svg beside this script: the keep-warm box as a green emoji instead of the plain ✓. Hand-drawn.
set -eu
export LC_ALL=C.UTF-8
cd "$(dirname "$0")"
EMO="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif"
# row y label on-glyph off-glyph : the band strip from the screenshot, then the box on and off
row() {
  local y=$1
  printf '<text x="20" y="%s" font-size="13" font-weight="700" fill="#e8e2d2" font-family="sans-serif">%s</text>' $(( y - 8 )) "$2"
  for st in on off; do
    local g=$3 op=1; [ $st = off ] && g=$4 && op=.85
    printf '<rect x="20" y="%s" width="620" height="40" rx="8" fill="#2b2b2b"/>' $y
    printf '<text x="38" y="%s" font-size="13" fill="#8d8775" font-family="sans-serif">5h</text><text x="72" y="%s" font-size="14" font-weight="700" fill="#f5a623" font-family="sans-serif">5%%</text>' $(( y + 25 )) $(( y + 25 ))
    printf '<rect x="112" y="%s" width="70" height="5" rx="2.5" fill="#4a463b"/><text x="196" y="%s" font-size="13" fill="#1d9e75" font-family="sans-serif">✓</text>' $(( y + 19 )) $(( y + 25 ))
    printf '<text x="230" y="%s" font-size="13" fill="#8d8775" font-family="sans-serif">week</text><text x="272" y="%s" font-size="14" font-weight="700" fill="#ff6b1a" font-family="sans-serif">55%%</text>' $(( y + 25 )) $(( y + 25 ))
    printf '<text x="340" y="%s" font-size="14" font-weight="700" fill="#e8e2d2" font-family="sans-serif">≈$1.71</text>' $(( y + 25 ))
    printf '<rect x="410" y="%s" width="56" height="20" rx="5" fill="#cc6363"/><text x="438" y="%s" font-size="12" font-weight="700" fill="#1c1a16" text-anchor="middle" font-family="sans-serif">WARM</text>' $(( y + 10 )) $(( y + 25 ))
    printf '<text x="474" y="%s" font-size="13" fill="#e8e2d2" font-family="sans-serif">$0.03 next</text>' $(( y + 25 ))
    printf '<text x="560" y="%s" font-size="16" opacity="%s" font-family="%s">%s</text>' $(( y + 26 )) $op "$EMO" "$g"
    [ $st = on ] && { y=$(( y + 0 )); break; }
  done
}
{
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 380" width="660" height="380"><rect width="660" height="380" fill="#1c1a16"/>'
row 36  'Now: plain ✓ (on), dim ✗ (off)' '✓' '✗'
row 106 'P. ✅ green box with a white tick (on); ❌ red cross when off' '✅' '❌'
row 176 'Q. ✔️ heavy tick (on); ✖️ when off (colour depends on the font)' '✔️' '✖️'
row 246 'R. 🟢 green dot (on); ⚪ when off' '🟢' '⚪'
printf '<text x="20" y="330" font-size="11" fill="#a8a28f" font-family="sans-serif">Only the box at the right end changes. Emoji are colour only in the app, and take two cells in a terminal. Off states shown in the caption.</text>'
printf '</svg>\n'
} > keep-emoji.svg
echo ok
