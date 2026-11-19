#!/usr/bin/env bash
# Refined progress themes, on the helpers of progress2.sh and progress4.sh.
set -u
out="$1"
here="$(dirname "$0")"
sed '/^draw eqheart/,$d' "$here/progress4.sh" > "$here/mixhelpers.sh"
. "$here/mixhelpers.sh"
eval "$(sed -n '/^# ---- 5 Stepper/,/^# ---- 6 Liquid/p' "$here/progress2.sh")"
palette_prev=$(declare -f palette)
palette() { eval "${palette_prev/palette ()/palette_mix ()}"; palette_mix "$1"
  if [ "$1" = dark ]; then LAV='#b59fd0' PEACH='#ffcc99' DEEP='#1a1917'; else LAV='#7c63a8' PEACH='#b8743a' DEEP='#e9e4d8'; fi; }

# The right-hand label for themes that already name the step on the track.
label2() { printf '<text x="%s" y="%s" font-size="12.5" text-anchor="end" fill="%s"><tspan font-weight="700" fill="%s">4/7</tspan> · 1m 12s   <tspan fill="%s">●●</tspan><tspan font-weight="700" fill="%s"> ×2</tspan> Explore 4 · sonnet-coder 12</text>' "$1" "$2" "$MUTED" "$TEXT" "$ORANGE" "$TEXT"; }
band2() { # proposal x y w mode : like band, with label2
  local x=$2 y=$3 w=$4 ry=$(( $3 + 58 ))
  rect "$x" "$y" "$w" 78 12 "$BG"; toprow "$x" $(( y + 28 )) "$w"
  if [ "$5" = idle ]; then "track_$1" $(( x + 14 )) $ry $(( w - 28 - 200 - 16 )) idle; working $(( x + w - 14 )) $(( ry + 4 ))
  else "track_$1" $(( x + 14 )) $ry $(( w - 28 - 330 - 16 )) run; label2 $(( x + w - 14 )) $(( ry + 4 )); fi; }

# ---- A Heartbeat: one beat shape throughout; the current step beats, the rest is a straight line ----
BEAT='l3 -3 l3 9 l4 -14 l3 10 l3 -2'
FLAT='l3 0 l3 0 l4 0 l3 0 l3 0'
track_heart2() { local x=$1 y=$2 w=$3 mode=$4 step=$(( $3 / N ))
  if [ "$mode" = idle ]; then
    rect "$x" $(( y - 1 )) "$w" 2 1 "$EMPTY"
    printf '<g><animateTransform attributeName="transform" type="translate" values="0 0;%s 0" dur="3.2s" repeatCount="indefinite"/><path d="M%s %s %s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"/><rect x="%s" y="%s" width="30" height="2" fill="%s" opacity=".5"/></g>' $(( w - 30 )) "$x" "$y" "$BEAT" "$ORANGE" $(( x - 30 )) $(( y - 1 )) "$ORANGE"
    return; fi
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"/>' "$(beatpath $x $y $w 0 $(( D - 1 )))" "$ORANGE"
  local a=$(( x + D * step )) cx=$(( x + D * step + step / 2 )) c=$(( x + (D + 1) * step ))
  printf '<path d="M%s %s L%s %s %s L%s %s" fill="none" stroke="%s" stroke-width="2.4" stroke-linejoin="round"><animate attributeName="d" values="M%s %s L%s %s %s L%s %s;M%s %s L%s %s %s L%s %s;M%s %s L%s %s %s L%s %s;M%s %s L%s %s %s L%s %s" keyTimes="0;.12;.3;1" dur="1.1s" repeatCount="indefinite"/></path>' \
    $a $y $(( cx - 10 )) $y "$BEAT" $c $y "$ORANGE" \
    $a $y $(( cx - 10 )) $y "$FLAT" $c $y  $a $y $(( cx - 10 )) $y "$BEAT" $c $y  $a $y $(( cx - 10 )) $y "$FLAT" $c $y  $a $y $(( cx - 10 )) $y "$FLAT" $c $y
  printf '<circle cx="%s" cy="%s" r="10" fill="%s" opacity="0"><animate attributeName="opacity" values="0;.25;0;0" keyTimes="0;.12;.3;1" dur="1.1s" repeatCount="indefinite"/></circle>' $(( cx + 1 )) $(( y - 4 )) "$ORANGE"
  rect $c $(( y - 1 )) $(( x + w - c )) 2 1 "$EMPTY"; }

# ---- B Console: a Star Trek-like panel; caps, heat blocks, the current block an equalizer ----
track_lcars() { local x=$1 y=$2 w=$3 mode=$4 i b
  local capL=52 capR=30 gap=4
  local inner=$(( w - capL - capR - 2 * gap ))
  if [ "$mode" = idle ]; then
    rect "$x" $(( y - 6 )) $capL 12 6 "$ORANGE"; rect $(( x + capL - 6 )) $(( y - 6 )) 6 12 0 "$ORANGE"
    t $(( x + capL / 2 )) $(( y + 4 )) 9 700 "$INK" 'SCAN' middle
    local n=16 bw=$(( (inner - 15 * gap) / 16 ))
    for i in $(seq 0 15); do rect $(( x + capL + gap + i * (bw + gap) )) $(( y - 6 )) $bw 12 0 "$EMPTY"; done
    local x0=$(( x + capL + gap ))
    printf '<g><animateTransform attributeName="transform" type="translate" values="0 0;%s 0;0 0" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" dur="2.6s" repeatCount="indefinite"/>' $(( 13 * (bw + gap) ))
    rect $x0 $(( y - 6 )) $bw 12 0 "${HEAT[0]}"; rect $(( x0 + bw + gap )) $(( y - 6 )) $bw 12 0 "${HEAT[1]}"; rect $(( x0 + 2 * (bw + gap) )) $(( y - 6 )) $bw 12 0 "${HEAT[2]}"
    echo '</g>'
    printf '<rect x="%s" y="%s" width="%s" height="12" rx="6" fill="%s">%s</rect>' $(( x + w - capR )) $(( y - 6 )) $capR "$LAV" "$PULSE"; rect $(( x + w - capR )) $(( y - 6 )) 6 12 0 "$LAV"
    return; fi
  rect "$x" $(( y - 6 )) $capL 12 6 "$ORANGE"; rect $(( x + capL - 6 )) $(( y - 6 )) 6 12 0 "$ORANGE"
  t $(( x + capL / 2 )) $(( y + 4 )) 9 700 "$INK" '04·07' middle
  local bw=$(( (inner - 6 * gap) / 7 ))
  for i in 0 1 2 3 4 5 6; do local bx=$(( x + capL + gap + i * (bw + gap) ))
    if [ $i -lt $D ]; then rect $bx $(( y - 6 )) $bw 12 0 "${HEAT[$i]}"
    elif [ $i -eq $D ]; then rect $bx $(( y - 6 )) $bw 12 0 "$DEEP"
      for b in $(seq 0 $(( (bw - 4) / 6 - 1 ))); do eqbar $(( bx + 3 + b * 6 )) "$y" $(( 3 + (b * 7) % 6 )) $(( 6 + (b * 5) % 5 )) 0.7s $(( (b * 3) % 10 )) "${HEAT[$(( b % 3 ))]}"; done
    else rect $bx $(( y - 6 )) $bw 12 0 "$EMPTY"; fi; done
  rect $(( x + w - capR )) $(( y - 6 )) $capR 12 6 "$LAV"; rect $(( x + w - capR )) $(( y - 6 )) 6 12 0 "$LAV"; }

# ---- D Wave + breadcrumbs: done names muted, a window around the current one, the wave strongest under it ----
track_crumbs2() { local x=$1 y=$2 w=$3 mode=$4 id; nextid
  if [ "$mode" = idle ]; then
    printf '<path d="%s" fill="none" stroke="%s" stroke-width="1.6"/>' "$(wavepath $x $(( y + 2 )) $(( x + w )) 2 6)" "$EMPTY"
    printf '<clipPath id="%s"><rect x="%s" y="%s" width="120" height="14"><animate attributeName="x" values="%s;%s;%s" dur="3s" repeatCount="indefinite"/></rect></clipPath><g clip-path="url(#%s)"><path d="%s" fill="none" stroke="%s" stroke-width="2.2"/></g>' "$id" "$x" $(( y - 5 )) "$x" $(( x + w - 120 )) "$x" "$id" "$(wavepath $x $(( y + 2 )) $(( x + w )) 2 6)" "$ORANGE"
    return; fi
  local names=("Read code" "Plan" "Write code" "Run tests" "Review" "Commit" "Push") cx=$x i curStart=$x curEnd=$x
  t $cx $(( y - 1 )) 12 500 "$MUTED" '… ›'; cx=$(( cx + 26 ))
  local doneStart=$cx
  for i in 1 2 3 4 5; do local s="${names[$i]}"
    if [ $i -lt $D ]; then s="✓ $s"; t $cx $(( y - 1 )) 12 500 "$MUTED" "$s"
    elif [ $i -eq $D ]; then curStart=$cx; printf '<text x="%s" y="%s" font-size="12" font-weight="700" fill="%s"><tspan fill="%s">●%s</tspan> %s</text>' $cx $(( y - 1 )) "$TEXT" "$ORANGE" "$PULSE" "$s"
    else t $cx $(( y - 1 )) 12 500 "$MUTED" "$s"; fi
    local tw=$(( (${#s} + (i == D ? 3 : 1)) * 66 / 10 )); cx=$(( cx + tw )); [ $i -eq $D ] && curEnd=$cx
    t $cx $(( y - 1 )) 12 500 "$MUTED" '›'; cx=$(( cx + 16 ))
  done
  t $cx $(( y - 1 )) 12 500 "$MUTED" '…'
  printf '<clipPath id="%s"><rect x="%s" y="%s" width="%s" height="12"/></clipPath><g clip-path="url(#%s)"><path d="%s" fill="none" stroke="%s" stroke-width="1.6" opacity=".7"><animateTransform attributeName="transform" type="translate" values="-12 0;0 0" dur="1.2s" repeatCount="indefinite"/></path></g>' "$id" "$x" $(( y + 3 )) $(( curStart - x - 6 )) "$id" "$(wavepath $(( x - 12 )) $(( y + 8 )) $(( curStart + 12 )) 1 6)" "$ORANGE"
  nextid
  printf '<clipPath id="%s"><rect x="%s" y="%s" width="%s" height="14"/></clipPath><g clip-path="url(#%s)"><path d="%s" fill="none" stroke="%s" stroke-width="2.4"><animateTransform attributeName="transform" type="translate" values="-12 0;0 0" dur="0.5s" repeatCount="indefinite"/></path></g>' "$id" "$curStart" $(( y + 2 )) $(( curEnd - curStart )) "$id" "$(wavepath $(( curStart - 12 )) $(( y + 8 )) $(( curEnd + 12 )) 3 6)" "$ORANGE"
  printf '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="2" stroke-dasharray="2 4"/>' $(( curEnd + 6 )) $(( y + 8 )) "$cx" $(( y + 8 )) "$EMPTY"; }

# Node positions with room for the current step's name after its node: x of node i.
LABW=78
nodeX() { local x=$1 w=$2 i=$3 sp=$(( ($2 - 16 - LABW) / (N - 1) )); echo $(( x + 8 + i * sp + (i > D ? LABW : 0) )); }

# ---- E Stepper + ring, the current step named ----
track_stepring2() { local x=$1 y=$2 w=$3 mode=$4 i
  [ "$mode" = idle ] && { track_stepper "$x" "$y" "$w" idle; return; }
  for i in 0 1 2 3 4 5; do local a b c=$EMPTY; a=$(nodeX $x $w $i); b=$(nodeX $x $w $((i+1))); [ $i -lt $D ] && c=$ORANGE
    [ $i -eq $D ] && a=$(( a + LABW - 4 )); rect $(( a + 9 )) $(( y - 1 )) $(( b - a - 18 )) 2 1 "$c"; done
  for i in 0 1 2 3 4 5 6; do local cx; cx=$(nodeX $x $w $i)
    printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5"/>' $cx "$y" "$EMPTY"
    if [ $i -lt $D ]; then printf '<circle cx="%s" cy="%s" r="7" fill="%s"/><path d="M%s %s l2.5 2.5 l4.5 -5" fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' $cx "$y" "$ORANGE" $(( cx - 3 )) "$y" "$INK"
    elif [ $i -eq $D ]; then printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0 44" transform="rotate(-90 %s %s)"><animate attributeName="stroke-dasharray" values="0 44;44 0" dur="1.8s" repeatCount="indefinite"/></circle>' $cx "$y" "$ORANGE" $cx "$y"
      t $(( cx + 13 )) $(( y + 4 )) 12 700 "$TEXT" 'Run tests'; fi; done; }

# ---- F Comet + stepper, the current step named ----
track_comet2() { local x=$1 y=$2 w=$3 mode=$4 i
  [ "$mode" = idle ] && { track_stepper "$x" "$y" "$w" idle; return; }
  local cur; cur=$(nodeX $x $w $D)
  rect "$x" $(( y - 1 )) $(( cur - x )) 2 1 "$ORANGE"; rect $(( cur + LABW - 4 )) $(( y - 1 )) $(( x + w - cur - LABW + 4 )) 2 1 "$EMPTY"
  for i in 0 1 2 3 4 5 6; do local cx; cx=$(nodeX $x $w $i)
    if [ $i -lt $D ]; then printf '<circle cx="%s" cy="%s" r="5" fill="%s"/>' $cx "$y" "$ORANGE"
    elif [ $i -eq $D ]; then printf '<circle cx="%s" cy="%s" r="5" fill="%s" stroke="%s" stroke-width="2"/><circle cx="%s" cy="%s" r="5" fill="none" stroke="%s" stroke-width="1.5"><animate attributeName="r" values="5;13" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="1.4s" repeatCount="indefinite"/></circle>' $cx "$y" "$BG" "$ORANGE" $cx "$y" "$ORANGE"
      t $(( cx + 12 )) $(( y + 4 )) 12 700 "$TEXT" 'Run tests'
    else printf '<circle cx="%s" cy="%s" r="4" fill="%s" stroke="%s" stroke-width="2"/>' $cx "$y" "$BG" "$EMPTY"; fi; done
  printf '<g><animateTransform attributeName="transform" type="translate" values="0 0;%s 0" dur="1.4s" repeatCount="indefinite"/>' $(( cur - x - 8 ))
  for i in 0 1 2 3 4 5; do printf '<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' $(( x + 8 - i * 7 )) "$y" "$(( 4 - i / 2 ))" "$ORANGE" "$(echo "1 .7 .5 .35 .2 .1" | cut -d' ' -f$((i+1)))"; done; echo '</g>'; }

draw2() { local W=1200 H=380 m y=0
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="0 0 %s %s" font-family="system-ui,-apple-system,Segoe UI,sans-serif">' $W $H $W $H
  for m in dark light; do palette $m
    rect 0 $y $W 190 0 "$PAGE"; t 18 $(( y + 20 )) 12 700 "$MUTED" "$2 · $m"
    "$3" "$1" 18 $(( y + 28 )) 1164 run; "$3" "$1" 18 $(( y + 110 )) 1164 idle; y=$(( y + 190 )); done
  echo '</svg>'; }

draw2 heart2     'A · Heartbeat' band > "$out/theme-a-heartbeat.svg"
draw2 lcars      'B · Console (equalizer + heat, Star Trek-like)' band > "$out/theme-b-console.svg"
draw2 crumbs2    'D · Wave + breadcrumbs' band2 > "$out/theme-d-wave-breadcrumbs.svg"
draw2 stepring2  'E · Stepper + ring' band2 > "$out/theme-e-stepper-ring.svg"
draw2 comet2     'F · Comet + stepper' band2 > "$out/theme-f-comet-stepper.svg"
