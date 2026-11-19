#!/usr/bin/env bash
# Heartbeat reimagined (A1 monitor, A2 beating heart) and round shapes for E (spaced rings, pie, dot ring).
set -u
out="$1"
here="$(dirname "$0")"
sed '/^draw2 heart4/,$d' "$here/progress7.sh" > "$here/theme3helpers.sh"
. "$here/theme3helpers.sh"

# A trace from a to b at y with an ECG complex every `every` px.
trace() { local a=$1 y=$2 b=$3 ev=$4 d="M$1 $2" p=$(( $1 + $4 / 2 - ECGW / 2 ))
  while [ $(( p + ECGW )) -le "$b" ]; do d="$d L$p $y $(ecg 8)"; p=$(( p + ev )); done; echo "$d L$b $y"; }

# ---- A1 Monitor: a pen writes the trace; ahead of it the screen is erased, like a ward monitor ----
pen() { # a b y every dur : the sweep over a..b, trace drawn behind the pen, erased just ahead
  local a=$1 b=$2 y=$3 ev=$4 dur=$5 id; nextid
  printf '<clipPath id="%s"><rect x="%s" y="%s" width="0" height="30"><animate attributeName="width" values="0;%s" dur="%s" repeatCount="indefinite"/></rect></clipPath>' "$id" "$a" $(( y - 15 )) $(( b - a )) "$dur"
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="1.6" opacity=".35"/>' "$(trace $a $y $b $ev)" "$ORANGE"
  printf '<rect x="%s" y="%s" width="14" height="30" fill="%s"><animate attributeName="x" values="%s;%s" dur="%s" repeatCount="indefinite"/></rect>' "$a" $(( y - 15 )) "$BG" "$a" "$b" "$dur"
  printf '<g clip-path="url(#%s)"><path d="%s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"/></g>' "$id" "$(trace $a $y $b $ev)" "$ORANGE"
  printf '<circle cx="%s" cy="%s" r="3.5" fill="%s"><animate attributeName="cx" values="%s;%s" dur="%s" repeatCount="indefinite"/></circle>' "$a" "$y" "$ORANGE" "$a" "$b" "$dur"; }
track_monitor() { local x=$1 y=$2 w=$3 mode=$4 step=$(( $3 / N ))
  if [ "$mode" = idle ]; then pen "$x" $(( x + w )) "$y" 90 3.6s; return; fi
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"/>' "$(trace $x $y $(( x + D * step )) $step)" "$ORANGE"
  pen $(( x + D * step )) $(( x + (D + 1) * step )) "$y" 46 1.4s
  rect $(( x + (D + 1) * step + 4 )) $(( y - 1 )) $(( w - (D + 1) * step - 4 )) 2 1 "$EMPTY"; }

# ---- A2 Beating heart: a heart at the current step beats lub-dub; done steps leave a blip each ----
HEART='M0 3 C-6 -1 -6 -7 -2.5 -7 C-1 -7 0 -5.5 0 -4.5 C0 -5.5 1 -7 2.5 -7 C6 -7 6 -1 0 3 Z'
heart() { # cx cy [extra]
  printf '<g transform="translate(%s %s)"><g><animateTransform attributeName="transform" type="scale" values="1;1.35;1;1.2;1;1" keyTimes="0;.1;.2;.3;.42;1" dur="1s" repeatCount="indefinite"/><path d="%s" fill="%s" transform="scale(1.3) translate(0 2)"/></g></g>' "$1" "$2" "$HEART" "$ORANGE"; }
track_heartbeat() { local x=$1 y=$2 w=$3 mode=$4 step=$(( $3 / N )) i
  if [ "$mode" = idle ]; then
    heart $(( x + 10 )) "$y"; rect $(( x + 22 )) $(( y - 1 )) $(( w - 22 )) 2 1 "$EMPTY"
    for i in 0 1 2; do printf '<g opacity="0"><animateTransform attributeName="transform" type="translate" values="0 0;%s 0" dur="3s" begin="%ss" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.05;.7;1" dur="3s" begin="%ss" repeatCount="indefinite"/><path d="M%s %s %s" fill="none" stroke="%s" stroke-width="2" stroke-linejoin="round"/></g>' $(( w - 60 )) "$i" "$i" $(( x + 24 )) "$y" "$(ecg 8)" "$ORANGE"; done
    return; fi
  local d="M$x $y"
  for i in $(seq 0 $(( D - 1 ))); do d="$d L$(( x + i * step + step / 2 - ECGW / 2 )) $y $(ecg 7) L$(( x + (i + 1) * step )) $y"; done
  local hx=$(( x + D * step + step / 2 ))
  printf '<path d="%s L%s %s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"/>' "$d" $(( hx - 10 )) "$y" "$ORANGE"
  heart "$hx" "$y"
  printf '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="2" stroke-dasharray="2 5"/>' $(( hx + 12 )) "$y" $(( x + w )) "$y" "$EMPTY"; }

# ---- E round shapes; working rows use half as many, spaced out ----
IDLE_SP=52
# E1 rings
ring_run() { track_stepring2 "$@"; }
track_e1() { local x=$1 y=$2 w=$3 mode=$4 i
  [ "$mode" = run ] && { track_stepring2 "$@"; return; }
  local n=$(( (w - 16) / IDLE_SP + 1 )) DUR=4.2
  for i in $(seq 0 $(( n - 1 ))); do local cx=$(( x + 8 + i * IDLE_SP )) at=$(( i * 70 / n ))
    printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5"/>' $cx "$y" "$EMPTY"
    printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0 44" transform="rotate(-90 %s %s)"><animate attributeName="stroke-dasharray" values="0 44;0 44;44 0;44 0;0 44" keyTimes="0;0.%02d;0.%02d;0.90;1" dur="%ss" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.88;.96;1" dur="%ss" repeatCount="indefinite"/></circle>' \
      $cx "$y" "$ORANGE" $cx "$y" $(( at + 1 )) $(( at + 10 )) $DUR $DUR; done; }

# E2 pie: a disc filling like a clock hand sweeping
pie() { # cx y state(done|cur|todo|idle) [at]
  printf '<circle cx="%s" cy="%s" r="7.5" fill="none" stroke="%s" stroke-width="1.5"/>' "$1" "$2" "$( [ "$3" = todo ] || [ "$3" = idle ] && echo "$EMPTY" || echo "$ORANGE")"
  case "$3" in
    done) printf '<circle cx="%s" cy="%s" r="5.5" fill="%s"/>' "$1" "$2" "$ORANGE";;
    cur)  printf '<circle cx="%s" cy="%s" r="2.75" fill="none" stroke="%s" stroke-width="5.5" stroke-dasharray="0 17.3" transform="rotate(-90 %s %s)"><animate attributeName="stroke-dasharray" values="0 17.3;17.3 0" dur="1.8s" repeatCount="indefinite"/></circle>' "$1" "$2" "$ORANGE" "$1" "$2";;
    idle) printf '<circle cx="%s" cy="%s" r="2.75" fill="none" stroke="%s" stroke-width="5.5" stroke-dasharray="0 17.3" transform="rotate(-90 %s %s)"><animate attributeName="stroke-dasharray" values="0 17.3;0 17.3;17.3 0;17.3 0;0 17.3" keyTimes="0;0.%02d;0.%02d;0.90;1" dur="4.2s" repeatCount="indefinite"/></circle>' "$1" "$2" "$ORANGE" "$1" "$2" $(( $4 + 1 )) $(( $4 + 10 ));;
  esac; }
track_e2() { local x=$1 y=$2 w=$3 mode=$4 i
  if [ "$mode" = idle ]; then local n=$(( (w - 16) / IDLE_SP + 1 ))
    for i in $(seq 0 $(( n - 1 ))); do pie $(( x + 8 + i * IDLE_SP )) "$y" idle $(( i * 70 / n )); done; return; fi
  for i in 0 1 2 3 4 5; do local a b c=$EMPTY; a=$(nodeX $x $w $i); b=$(nodeX $x $w $((i+1))); [ $i -lt $D ] && c=$ORANGE
    [ $i -eq $D ] && a=$(( a + LABW - 4 )); rect $(( a + 10 )) $(( y - 1 )) $(( b - a - 20 )) 2 1 "$c"; done
  for i in 0 1 2 3 4 5 6; do local cx; cx=$(nodeX $x $w $i)
    if [ $i -lt $D ]; then pie $cx "$y" done; elif [ $i -eq $D ]; then pie $cx "$y" cur; t $(( cx + 13 )) $(( y + 4 )) 12 700 "$TEXT" 'Run tests'; else pie $cx "$y" todo; fi; done; }

# E3 dot ring: eight dots round a circle, lit in turn like a loading spinner
dotring() { # cx y state [at]
  local k; for k in 0 1 2 3 4 5 6 7; do
    local dx dy; case $k in 0) dx=0 dy=-6;; 1) dx=4 dy=-4;; 2) dx=6 dy=0;; 3) dx=4 dy=4;; 4) dx=0 dy=6;; 5) dx=-4 dy=4;; 6) dx=-6 dy=0;; 7) dx=-4 dy=-4;; esac
    case "$3" in
      done) printf '<circle cx="%s" cy="%s" r="1.8" fill="%s"/>' $(( $1 + dx )) $(( $2 + dy )) "$ORANGE";;
      todo) printf '<circle cx="%s" cy="%s" r="1.6" fill="%s"/>' $(( $1 + dx )) $(( $2 + dy )) "$EMPTY";;
      cur)  printf '<circle cx="%s" cy="%s" r="1.8" fill="%s" opacity=".2"><animate attributeName="opacity" values="1;.2" dur="0.8s" begin="0.%ss" repeatCount="indefinite"/></circle>' $(( $1 + dx )) $(( $2 + dy )) "$ORANGE" "$k";;
      idle) printf '<circle cx="%s" cy="%s" r="1.7" fill="%s"><animate attributeName="fill" values="%s;%s;%s;%s" keyTimes="0;0.%02d;0.%02d;1" dur="4.2s" repeatCount="indefinite"/></circle>' $(( $1 + dx )) $(( $2 + dy )) "$EMPTY" "$EMPTY" "$EMPTY" "$ORANGE" "$ORANGE" $(( $4 + k )) $(( $4 + k + 1 ));;
    esac; done; }
track_e3() { local x=$1 y=$2 w=$3 mode=$4 i
  if [ "$mode" = idle ]; then local n=$(( (w - 16) / IDLE_SP + 1 ))
    for i in $(seq 0 $(( n - 1 ))); do dotring $(( x + 8 + i * IDLE_SP )) "$y" idle $(( i * 75 / n )); done; return; fi
  for i in 0 1 2 3 4 5; do local a b c=$EMPTY; a=$(nodeX $x $w $i); b=$(nodeX $x $w $((i+1))); [ $i -lt $D ] && c=$ORANGE
    [ $i -eq $D ] && a=$(( a + LABW - 4 )); rect $(( a + 11 )) $(( y - 1 )) $(( b - a - 22 )) 2 1 "$c"; done
  for i in 0 1 2 3 4 5 6; do local cx; cx=$(nodeX $x $w $i)
    if [ $i -lt $D ]; then dotring $cx "$y" done; elif [ $i -eq $D ]; then dotring $cx "$y" cur; t $(( cx + 13 )) $(( y + 4 )) 12 700 "$TEXT" 'Run tests'; else dotring $cx "$y" todo; fi; done; }

draw2 monitor   'A1 · Heartbeat: monitor (a pen writes the trace)' band > "$out/theme4-a1-monitor.svg"
draw2 heartbeat 'A2 · Heartbeat: beating heart' band > "$out/theme4-a2-heart.svg"
draw2 e1        'E1 · Rings, spaced' band2 > "$out/theme4-e1-rings.svg"
draw2 e2        'E2 · Pie (clock fill)' band2 > "$out/theme4-e2-pie.svg"
draw2 e3        'E3 · Dot ring (spinner)' band2 > "$out/theme4-e3-dotring.svg"
