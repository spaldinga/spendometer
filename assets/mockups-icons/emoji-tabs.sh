#!/usr/bin/env bash
# Writes emoji-tabs.svg beside this script: emoji tab sets and ways to mark the selected one (backlog 120).
# Hand-drawn mockups. Emoji are 2 cells wide in a terminal, so a narrow tab button is 2 cells + padding.
set -eu
export LC_ALL=C.UTF-8
cd "$(dirname "$0")"
FONT="Cascadia Mono, Consolas, Menlo, monospace"
EMO="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif"

# group x y bg txt acc mode marker(pill|brackets|underline|dim) e1 e2 e3 ; Context is selected
group() {
  local x=$1 y=$2 bg=$3 txt=$4 acc=$5 mode=$6 mk=$7 i=0 e name w sel lab ex
  shift 7
  for e in "$1" "$2" "$3"; do
    case $i in 0) name=Overview;; 1) name=Context;; 2) name=Cost;; esac
    sel=0; [ $i = 1 ] && sel=1
    lab=$name; [ $mode = narrow ] && lab=''
    ex=0; [ $sel = 1 ] && [ $mk = brackets ] && ex=2
    if [ $mode = wide ]; then w=$(( (${#name} + ex) * 15 / 2 + 40 )); else w=$(( 34 + ex * 8 )); fi
    printf '<rect x="%s" y="%s" width="%s" height="30" rx="8" fill="%s"/>' $x $y $w "$bg"
    [ $sel = 1 ] && [ $mk = pill ] && printf '<rect x="%s" y="%s" width="%s" height="30" rx="8" fill="%s" opacity=".55"/>' $x $y $w "$acc"
    [ $sel = 1 ] && [ $mk = underline ] && printf '<rect x="%s" y="%s" width="%s" height="3" rx="1.5" fill="%s"/>' $(( x + 6 )) $(( y + 27 )) $(( w - 12 )) "$acc"
    local op=1; [ $mk = dim ] && [ $sel = 0 ] && op=.4
    local px=$(( x + 8 )); [ $ex = 2 ] && px=$(( x + 8 + 8 ))
    [ $ex = 2 ] && { printf '<text x="%s" y="%s" font-size="13" font-family="%s" fill="%s">[</text>' $(( x + 6 )) $(( y + 20 )) "$FONT" "$acc"
                     printf '<text x="%s" y="%s" font-size="13" font-family="%s" fill="%s">]</text>' $(( x + w - 14 )) $(( y + 20 )) "$FONT" "$acc"; }
    printf '<text x="%s" y="%s" font-size="16" font-family="%s" opacity="%s">%s</text>' $px $(( y + 21 )) "$EMO" $op "$e"
    [ $mode = wide ] && printf '<text x="%s" y="%s" font-size="13" font-family="%s" fill="%s" opacity="%s">%s</text>' $(( px + 26 )) $(( y + 20 )) "$FONT" "$txt" $op "$lab$name" | sed "s/>$name$name</>$name</"
    i=$(( i + 1 )); x=$(( x + w + 8 ))
  done
}
block() { # y marker title e1 e2 e3
  local y=$1 mk=$2
  printf '<text x="20" y="%s" font-size="14" font-weight="700" fill="#e8e2d2" font-family="sans-serif">%s</text>' $(( y + 16 )) "$3"
  printf '<rect x="20" y="%s" width="560" height="96" rx="8" fill="#f4f1e8"/><rect x="600" y="%s" width="560" height="96" rx="8" fill="#1c1a16"/>' $(( y + 28 )) $(( y + 28 ))
  group  36 $(( y + 38 )) '#e3dfd2' '#3a372f' '#d4501a' wide   $mk "$4" "$5" "$6"
  group  36 $(( y + 78 )) '#e3dfd2' '#3a372f' '#d4501a' narrow $mk "$4" "$5" "$6"
  group 616 $(( y + 38 )) '#3a3832' '#c9c3b2' '#ff8a3d' wide   $mk "$4" "$5" "$6"
  group 616 $(( y + 78 )) '#3a3832' '#c9c3b2' '#ff8a3d' narrow $mk "$4" "$5" "$6"
}
{
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1180 800" width="1180" height="800"><rect width="1180" height="800" fill="#2a2925"/>'
printf '<text x="20" y="22" font-size="12" fill="#a8a28f" font-family="sans-serif">Same emoji set K (📊 🧠 💰), four ways to mark the selected tab, then three more sets with the pill. Context selected.</text>'
block 30  pill      'K1. 📊 🧠 💰 with an accent pill'                 '📊' '🧠' '💰'
block 170 brackets  'K2. 📊 🧠 💰 with brackets (as today, two extra cells)' '📊' '🧠' '💰'
block 310 underline 'K3. 📊 🧠 💰 with an accent underline'            '📊' '🧠' '💰'
block 450 dim       'K4. 📊 🧠 💰 with the others dimmed'              '📊' '🧠' '💰'
block 590 pill      'M. ⏱️ 🧮 💲 (stopwatch, abacus, dollar) with a pill' '⏱️' '🧮' '💲'
printf '<text x="20" y="780" font-size="12" fill="#a8a28f" font-family="sans-serif">Dim and underline are app-only ideas: a terminal Button takes a plain label, so there the marker stays brackets (K2). Emoji look depends on the font; Segoe UI Emoji shown as on Windows.</text>'
printf '</svg>\n'
} > emoji-tabs.svg
echo wrote emoji-tabs.svg
