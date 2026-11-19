#!/usr/bin/env bash
# Third refinement: A (ECG shapes from the reference pictures), B (console breadcrumbs from scratch), E (rings only).
set -u
out="$1"
here="$(dirname "$0")"
sed '/^draw2 heart3/,$d' "$here/progress6.sh" > "$here/theme2helpers.sh"
. "$here/theme2helpers.sh"

# Picture 1: an ECG complex, 30 px wide: small P wave, a little Q dip, a tall R spike, a deep S, back, a T hump.
# Amplitudes scaled by m (in tenths), so frames share one command structure and can morph.
ecg() { local m=$1 s; s() { echo $(( $1 * m / 10 )); }
  echo "q3 $(s -4) 6 0 l2 $(s 2) l3 $(s -18) l4 $(s 24) l3 $(s -8) l3 0 q4 $(s -6) 8 0"; }
ECGW=29
# Picture 2: a damped ringing, 34 px wide: small wiggles, a big swing up and down, small wiggles fading.
ring_shape() { echo "l4 2 l3 -4 l3 3 l3 -15 l4 22 l3 -11 l3 5 l3 -3 l4 1"; }
RINGW=30

# ---- A Heartbeat ----
track_heart4() { local x=$1 y=$2 w=$3 mode=$4 step=$(( $3 / N )) i
  if [ "$mode" = idle ]; then
    rect "$x" $(( y - 1 )) "$w" 2 1 "$EMPTY"
    local DUR=3.2 n=7
    for i in $(seq 0 $(( n - 1 ))); do local px=$(( x + 20 + i * (w - 60) / (n - 1) )) at; at=$(( (px - x) * 100 / w ))
      printf '<path d="M%s %s %s" fill="none" stroke="%s" stroke-width="2" stroke-linejoin="round" opacity="0"><animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;%s;%s;%s;1" dur="%ss" repeatCount="indefinite"/></path>' \
        $(( px - RINGW )) "$y" "$(ring_shape)" "$ORANGE" "0.$(printf '%02d' $(( at > 2 ? at - 2 : 0 )))" "0.$(printf '%02d' $at)" "0.$(printf '%02d' $(( at + 18 > 99 ? 99 : at + 18 )))" "$DUR"; done
    printf '<circle cx="%s" cy="%s" r="4" fill="%s"><animate attributeName="cx" values="%s;%s" dur="%ss" repeatCount="indefinite"/></circle>' "$x" "$y" "$ORANGE" "$x" $(( x + w )) "$DUR"
    printf '<circle cx="%s" cy="%s" r="8" fill="%s" opacity=".25"><animate attributeName="cx" values="%s;%s" dur="%ss" repeatCount="indefinite"/></circle>' "$x" "$y" "$ORANGE" "$x" $(( x + w )) "$DUR"
    return; fi
  local d="M$x $y"
  for i in $(seq 0 $(( D - 1 ))); do local s0=$(( x + i * step )) c=$(( x + i * step + step / 2 - ECGW / 2 )); d="$d L$c $y $(ecg 10) L$(( s0 + step )) $y"; done
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"/>' "$d" "$ORANGE"
  local a=$(( x + D * step )) c=$(( x + D * step + step / 2 - ECGW / 2 )) e=$(( x + (D + 1) * step ))
  local f1="M$a $y L$c $y $(ecg 10) L$e $y" f2="M$a $y L$c $y $(ecg 5) L$e $y" f3="M$a $y L$c $y $(ecg 11) L$e $y" f4="M$a $y L$c $y $(ecg 3) L$e $y"
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="2.4" stroke-linejoin="round"><animate attributeName="d" values="%s;%s;%s;%s;%s" dur="0.9s" repeatCount="indefinite"/></path>' "$f1" "$ORANGE" "$f1" "$f2" "$f3" "$f4" "$f1"
  printf '<circle cx="%s" cy="%s" r="4" fill="%s"/><circle cx="%s" cy="%s" r="8" fill="%s" opacity=".25">%s</circle>' $e "$y" "$ORANGE" $e "$y" "$ORANGE" "$PULSE"
  rect $(( e + 6 )) $(( y - 1 )) $(( x + w - e - 6 )) 2 1 "$EMPTY"; }

# ---- B Console breadcrumbs, from scratch: every step is a labelled console block ----
lcl() { # x y w fill label [inner]
  printf '<rect x="%s" y="%s" width="%s" height="16" fill="%s"%s' "$1" $(( $2 - 8 )) "$3" "$4" "$( [ -n "${6:-}" ] && echo ">$6</rect>" || echo '/>')"
  t $(( $1 + $3 - 5 )) $(( $2 + 4 )) 10 700 "$LC_INK" "$5" end; }
track_lcars3() { local x=$1 y=$2 w=$3 mode=$4 i gap=4
  local capL=78 capR=34; local bx=$(( x + capL + gap ))
  rect "$x" $(( y - 8 )) $capL 16 8 "$LC_OR"; rect $(( x + capL - 8 )) $(( y - 8 )) 8 16 0 "$LC_OR"
  rect $(( x + w - capR )) $(( y - 8 )) $capR 16 8 "$LC_LA"; rect $(( x + w - capR )) $(( y - 8 )) 8 16 0 "$LC_LA"
  if [ "$mode" = idle ]; then
    t $(( x + capL - 6 )) $(( y + 4 )) 10 700 "$LC_INK" 'WORKING' end
    lcl $bx "$y" 150 "$LC_PE" '4 STEPS · 1M 12S'; bx=$(( bx + 150 + gap ))
    local n=10 bw=$(( (x + w - capR - gap - bx - 9 * gap) / 10 ))
    for i in $(seq 0 $(( n - 1 ))); do local c=$(( i % 3 )); local cols=("$LC_BL" "$LC_LA" "$LC_TA")
      printf '<rect x="%s" y="%s" width="%s" height="16" fill="%s" opacity=".25"><animate attributeName="opacity" values=".25;1;.25;.25" keyTimes="0;.1;.3;1" dur="2s" begin="0.%ss" repeatCount="indefinite"/></rect>' $(( bx + i * (bw + gap) )) $(( y - 8 )) $bw "${cols[$c]}" "$(( i * 2 ))"; done
    return; fi
  t $(( x + capL - 6 )) $(( y + 4 )) 10 700 "$LC_INK" 'STEP 04·07' end
  local names=("READ CODE" "PLAN" "WRITE CODE" "RUN TESTS" "REVIEW" "COMMIT" "PUSH") cols=("$LC_TA" "$LC_PE" "$LC_OR")
  for i in 0 1 2 3 4 5 6; do local s="${names[$i]}" bw; bw=$(( ${#s} * 7 + 22 )); [ $i -eq $D ] && bw=$(( bw + 30 ))
    if [ $i -lt $D ]; then lcl $bx "$y" $bw "${cols[$i]}" "$s"
    elif [ $i -eq $D ]; then lcl $bx "$y" $bw "$LC_OR" "$s" "<animate attributeName=\"fill\" values=\"$LC_OR;$LC_LA;$LC_OR\" keyTimes=\"0;.5;1\" calcMode=\"discrete\" dur=\"1.2s\" repeatCount=\"indefinite\"/>"
      t $(( bx + 6 )) $(( y + 4 )) 10 700 "$LC_INK" "0$(( i + 1 ))"
    else lcl $bx "$y" $bw "$LC_BL" "$s"; printf '<rect x="%s" y="%s" width="%s" height="16" fill="%s" opacity=".5"/>' $bx $(( y - 8 )) $bw "$BG"; fi
    bx=$(( bx + bw + gap )); done
  rect $bx $(( y - 8 )) $(( x + w - capR - gap - bx )) 16 0 "$LC_LA"; }

# ---- E Stepper + ring; working: rings only, more of them, filling one after another ----
track_stepring4() { local x=$1 y=$2 w=$3 mode=$4 i
  [ "$mode" = run ] && { track_stepring2 "$@"; return; }
  local n=$(( (w - 16) / 26 + 1 )) sp=26 DUR=4.2
  for i in $(seq 0 $(( n - 1 ))); do local cx=$(( x + 8 + i * sp )) at=$(( i * 70 / n ))
    printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5"/>' $cx "$y" "$EMPTY"
    printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0 44" transform="rotate(-90 %s %s)"><animate attributeName="stroke-dasharray" values="0 44;0 44;44 0;44 0;0 44" keyTimes="0;0.%02d;0.%02d;0.90;1" dur="%ss" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.88;.96;1" dur="%ss" repeatCount="indefinite"/></circle>' \
      $cx "$y" "$ORANGE" $cx "$y" $(( at + 1 )) $(( at + 8 )) $DUR $DUR; done; }

draw2 heart4    'A · Heartbeat' band > "$out/theme3-a-heartbeat.svg"
draw2 lcars3    'B · Console breadcrumbs' band2 > "$out/theme3-b-console.svg"
draw2 stepring4 'E · Stepper + ring' band2 > "$out/theme3-e-stepper-ring.svg"
