#!/usr/bin/env bash
# Writes tab-icons-svg.svg beside this script: drawn SVG tab icons (backlog 120). The desktop app can draw an <Svg>
# (isInteractive makes it clickable); the terminal cannot, so it would keep a text glyph. Hand-drawn mockups.
set -eu
export LC_ALL=C.UTF-8
cd "$(dirname "$0")"
FONT="Cascadia Mono, Consolas, Menlo, monospace"

# icon kind x y color: a 20x20 outline icon at x,y
icon() {
  local x=$2 y=$3 c=$4
  printf '<g transform="translate(%s %s)" fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' $x $y "$c"
  case $1 in
    overview) printf '<path d="M2.5 15 A7.5 7.5 0 0 1 17.5 15"/><path d="M10 15 L13.5 8.5"/><circle cx="10" cy="15" r="1" fill="%s"/>' "$c";;
    context)  printf '<rect x="3" y="3" width="14" height="14" rx="2.5"/><rect x="3" y="10" width="14" height="7" rx="2" fill="%s" stroke="none" opacity=".85"/>' "$c";;
    cost)     printf '<circle cx="10" cy="10" r="7.5"/><path d="M12.4 7.6 C11.7 6.8 8.2 6.7 8 8.5 C7.8 10.6 12.3 9.3 12 11.6 C11.8 13.4 8.3 13.3 7.5 12.3 M10 5.6 V14.4" stroke-width="1.4"/>';;
  esac
  printf '</g>'
}
word() { printf '<text x="%s" y="%s" font-size="13" font-family="%s" fill="%s">%s</text>' $1 $2 "$FONT" "$4" "$3"; }

# group style x y bg txt accent wide|narrow ; Context is selected
group() {
  local st=$1 x=$2 y=$3 bg=$4 txt=$5 acc=$6 mode=$7 id name w c f
  for id in overview context cost; do
    case $id in overview) name=Overview;; context) name=Context;; cost) name=Cost;; esac
    if [ $mode = wide ]; then w=$(( ${#name} * 15 / 2 + 40 )); else w=34; fi
    c=$txt; f=none
    if [ $id = context ]; then
      case $st in
        H) f=$acc; c='#1c1a16';;      # filled pill, dark icon
        I) c=$acc;;                   # accent colour + underline
        J) c=$acc; f=none;;           # accent colour only
      esac
    fi
    printf '<rect x="%s" y="%s" width="%s" height="30" rx="8" fill="%s"/>' $x $y $w "$bg"
    [ $f != none ] && printf '<rect x="%s" y="%s" width="%s" height="30" rx="8" fill="%s"/>' $x $y $w "$f"
    [ $st = I ] && [ $id = context ] && printf '<rect x="%s" y="%s" width="%s" height="3" rx="1.5" fill="%s"/>' $(( x + 6 )) $(( y + 27 )) $(( w - 12 )) "$acc"
    if [ $mode = wide ]; then icon $id $(( x + 9 )) $(( y + 5 )) "$c"; word $(( x + 34 )) $(( y + 20 )) $name "$c"
    else icon $id $(( x + 7 )) $(( y + 5 )) "$c"; fi
    x=$(( x + w + 8 ))
  done
}

block() { # y style title
  local y=$1 st=$2
  printf '<text x="20" y="%s" font-size="14" font-weight="700" fill="#e8e2d2" font-family="sans-serif">%s</text>' $(( y + 16 )) "$3"
  printf '<rect x="20" y="%s" width="560" height="96" rx="8" fill="#f4f1e8"/><rect x="600" y="%s" width="560" height="96" rx="8" fill="#1c1a16"/>' $(( y + 28 )) $(( y + 28 ))
  group $st  36 $(( y + 38 )) '#e3dfd2' '#3a372f' '#d4501a' wide
  group $st  36 $(( y + 78 )) '#e3dfd2' '#3a372f' '#d4501a' narrow
  group $st 616 $(( y + 38 )) '#3a3832' '#c9c3b2' '#ff8a3d' wide
  group $st 616 $(( y + 78 )) '#3a3832' '#c9c3b2' '#ff8a3d' narrow
}
# egroup x y bg txt accent mode e1 e2 e3: emoji tabs, selected = accent pill
egroup() {
  local x=$1 y=$2 bg=$3 txt=$4 acc=$5 mode=$6 i=0 e name w
  for e in "$7" "$8" "$9"; do
    case $i in 0) name=Overview;; 1) name=Context;; 2) name=Cost;; esac
    if [ $mode = wide ]; then w=$(( ${#name} * 15 / 2 + 40 )); else w=34; fi
    printf '<rect x="%s" y="%s" width="%s" height="30" rx="8" fill="%s"/>' $x $y $w "$bg"
    [ $i = 1 ] && printf '<rect x="%s" y="%s" width="%s" height="30" rx="8" fill="%s" opacity=".55"/>' $x $y $w "$acc"
    printf '<text x="%s" y="%s" font-size="16" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">%s</text>' $(( x + 8 )) $(( y + 21 )) "$e"
    [ $mode = wide ] && word $(( x + 34 )) $(( y + 20 )) $name "$txt"
    i=$(( i + 1 )); x=$(( x + w + 8 ))
  done
}
eblock() { # y title e1 e2 e3
  local y=$1
  printf '<text x="20" y="%s" font-size="14" font-weight="700" fill="#e8e2d2" font-family="sans-serif">%s</text>' $(( y + 16 )) "$2"
  printf '<rect x="20" y="%s" width="560" height="96" rx="8" fill="#f4f1e8"/><rect x="600" y="%s" width="560" height="96" rx="8" fill="#1c1a16"/>' $(( y + 28 )) $(( y + 28 ))
  egroup  36 $(( y + 38 )) '#e3dfd2' '#3a372f' '#d4501a' wide "$3" "$4" "$5"
  egroup  36 $(( y + 78 )) '#e3dfd2' '#3a372f' '#d4501a' narrow "$3" "$4" "$5"
  egroup 616 $(( y + 38 )) '#3a3832' '#c9c3b2' '#ff8a3d' wide "$3" "$4" "$5"
  egroup 616 $(( y + 78 )) '#3a3832' '#c9c3b2' '#ff8a3d' narrow "$3" "$4" "$5"
}
{
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 740" width="1180" height="740"><rect width="1180" height="740" fill="#2a2925"/>'
block 10  H 'H. Drawn icons, selected tab = filled accent pill'
block 150 I 'I. Drawn icons, selected tab = accent colour and underline bar'
block 290 J 'J. Drawn icons, selected tab = accent colour only'
eblock 430 'K. Emoji: 📊 🧠 💰, selected tab = accent pill' '📊' '🧠' '💰'
eblock 570 'L. Emoji: 🕒 📦 💵, selected tab = accent pill' '🕒' '📦' '💵'
printf '<text x="20" y="720" font-size="12" fill="#a8a28f" font-family="sans-serif">Gauge = overview (pace), filled square = context (how full), coin = cost. Context selected. Terminal cannot draw SVG: it keeps a text glyph (one of A to G, or the current set). Emoji: colour in the app; in the terminal each is 2 cells wide and its look depends on the font.</text>'
printf '</svg>\n'
} > tab-icons-svg.svg
echo wrote tab-icons-svg.svg
