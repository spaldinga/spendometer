#!/usr/bin/env bash
# Second refinement of the themes A, B, E, F (D unchanged), on progress5.sh's helpers.
set -u
out="$1"
here="$(dirname "$0")"
sed '/^draw2 heart2/,$d' "$here/progress5.sh" > "$here/themehelpers.sh"
. "$here/themehelpers.sh"
palette_t=$(declare -f palette)
palette() { eval "${palette_t/palette ()/palette_t5 ()}"; palette_t5 "$1"
  if [ "$1" = dark ]; then LC_OR='#ff9900' LC_PE='#ffcc99' LC_TA='#cc9966' LC_LA='#cc99cc' LC_BL='#9999ff' LC_INK='#000000'
  else LC_OR='#c06f00' LC_PE='#b8743a' LC_TA='#8a5a2b' LC_LA='#8e5a8e' LC_BL='#5555bb' LC_INK='#ffffff'; fi; }

# A trace through n points every `gap` px from a, amplitude from frame f: one keyframe of the equalizer line.
eqline() { # a y n gap maxamp frame
  local a=$1 y=$2 n=$3 g=$4 m=$5 f=$6 k d="M$1 $2"
  for k in $(seq 1 "$n"); do local amp=$(( ((k * 7 + f * 5 + k * f) % (m + 1)) )); [ $(( k % 2 )) -eq 0 ] && amp=$(( -amp ))
    d="$d L$(( a + k * g )) $(( y - amp ))"; done; echo "$d L$(( a + (n + 1) * g )) $y"; }

# ---- A Heartbeat: done steps beat; the current step is one line jumping at the equalizer's height ----
track_heart3() { local x=$1 y=$2 w=$3 mode=$4 step=$(( $3 / N ))
  if [ "$mode" = idle ]; then local n=$(( w / 6 - 1 ))
    printf '<path d="%s" fill="none" stroke="%s" stroke-width="1.8" stroke-linejoin="round"><animate attributeName="d" values="%s;%s;%s;%s" dur="1.2s" repeatCount="indefinite"/></path>' \
      "$(eqline $x $y $n 6 3 0)" "$ORANGE" "$(eqline $x $y $n 6 3 0)" "$(eqline $x $y $n 6 3 1)" "$(eqline $x $y $n 6 3 2)" "$(eqline $x $y $n 6 3 0)"
    return; fi
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"/>' "$(beatpath $x $y $w 0 $(( D - 1 )))" "$ORANGE"
  local a=$(( x + D * step )) n=$(( step / 5 - 1 ))
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"><animate attributeName="d" values="%s;%s;%s;%s" dur="0.7s" repeatCount="indefinite"/></path>' \
    "$(eqline $a $y $n 5 8 0)" "$ORANGE" "$(eqline $a $y $n 5 8 0)" "$(eqline $a $y $n 5 8 1)" "$(eqline $a $y $n 5 8 2)" "$(eqline $a $y $n 5 8 0)"
  local c=$(( a + (n + 1) * 5 )); rect $c $(( y - 1 )) $(( x + w - c )) 2 1 "$EMPTY"; }

# ---- B Console: strict Star Trek console; numbered blocks, the step's name inside the current block ----
lcblock() { rect "$1" $(( $2 - 7 )) "$3" 14 0 "$4"; [ -n "${5:-}" ] && t $(( $1 + $3 - 4 )) $(( $2 + 4 )) 9 700 "$LC_INK" "$5" end; }
track_lcars2() { local x=$1 y=$2 w=$3 mode=$4 i
  local capL=70 capR=34 gap=4
  rect "$x" $(( y - 7 )) $capL 14 7 "$LC_OR"; rect $(( x + capL - 7 )) $(( y - 7 )) 7 14 0 "$LC_OR"
  if [ "$mode" = idle ]; then
    t $(( x + capL - 6 )) $(( y + 4 )) 9 700 "$LC_INK" 'SCAN 01' end
    local bw=$(( (w - capL - capR - 2 * gap - 15 * gap) / 16 )); local x0=$(( x + capL + gap ))
    for i in $(seq 0 15); do lcblock $(( x0 + i * (bw + gap) )) "$y" $bw "$LC_BL"; printf '<rect x="%s" y="%s" width="%s" height="14" fill="%s" opacity=".55"/>' $(( x0 + i * (bw + gap) )) $(( y - 7 )) $bw "$BG"; done
    printf '<g><animateTransform attributeName="transform" type="translate" values="0 0;%s 0;0 0" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" dur="2.6s" repeatCount="indefinite"/>' $(( 13 * (bw + gap) ))
    lcblock $x0 "$y" $bw "$LC_TA"; lcblock $(( x0 + bw + gap )) "$y" $bw "$LC_PE"; lcblock $(( x0 + 2 * (bw + gap) )) "$y" $bw "$LC_OR"; echo '</g>'
  else
    t $(( x + capL - 6 )) $(( y + 4 )) 9 700 "$LC_INK" 'STEP 04·07' end
    local cw=170; local bw=$(( (w - capL - capR - 2 * gap - cw - 6 * gap) / 6 )); local bx=$(( x + capL + gap ))
    local cols=("$LC_TA" "$LC_PE" "$LC_OR")
    for i in 0 1 2 3 4 5 6; do
      if [ $i -lt $D ]; then lcblock $bx "$y" $bw "${cols[$i]}" "0$(( i + 1 ))"; bx=$(( bx + bw + gap ))
      elif [ $i -eq $D ]; then
        printf '<rect x="%s" y="%s" width="%s" height="14" fill="%s"><animate attributeName="fill" values="%s;%s;%s" dur="1.6s" repeatCount="indefinite"/></rect>' $bx $(( y - 7 )) $cw "$LC_LA" "$LC_LA" "$LC_OR" "$LC_LA"
        t $(( bx + 6 )) $(( y + 4 )) 10 700 "$LC_INK" '04 RUN TESTS'
        local b; for b in 0 1 2 3; do eqbar $(( bx + cw - 30 + b * 6 )) "$y" $(( 3 + b * 2 )) $(( 9 - b )) 0.6s $(( b * 2 )) "$LC_INK"; done
        bx=$(( bx + cw + gap ))
      else lcblock $bx "$y" $bw "$LC_BL" "0$(( i + 1 ))"; printf '<rect x="%s" y="%s" width="%s" height="14" fill="%s" opacity=".45"/>' $bx $(( y - 7 )) $bw "$BG"; bx=$(( bx + bw + gap )); fi
    done
  fi
  rect $(( x + w - capR )) $(( y - 7 )) $capR 14 7 "$LC_LA"; rect $(( x + w - capR )) $(( y - 7 )) 7 14 0 "$LC_LA"; }

# ---- E Stepper + ring; working: the rings fill one after another, the line lighting behind ----
track_stepring3() { local x=$1 y=$2 w=$3 mode=$4 i
  [ "$mode" = run ] && { track_stepring2 "$@"; return; }
  local sp=$(( (w - 16) / (N - 1) ))
  for i in 0 1 2 3 4 5; do local a=$(( x + 8 + i * sp ))
    rect $(( a + 9 )) $(( y - 1 )) $(( sp - 18 )) 2 1 "$EMPTY"
    printf '<rect x="%s" y="%s" width="%s" height="2" rx="1" fill="%s" opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;.12;.2;.85;1" dur="3.6s" begin="%s.%ss" repeatCount="indefinite"/></rect>' $(( a + 9 )) $(( y - 1 )) $(( sp - 18 )) "$ORANGE" $(( (i * 4) / 10 )) $(( (i * 4) % 10 )); done
  for i in 0 1 2 3 4 5 6; do local cx=$(( x + 8 + i * sp )) bg=$(( i * 4 ))
    printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5"/>' $cx "$y" "$EMPTY"
    printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0 44" transform="rotate(-90 %s %s)"><animate attributeName="stroke-dasharray" values="0 44;0 44;44 0;44 0;0 44" keyTimes="0;.0001;.12;.85;1" dur="3.6s" begin="%s.%ss" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;1;0;0" keyTimes="0;.12;.85;.95;1" dur="3.6s" begin="%s.%ss" repeatCount="indefinite"/></circle>' \
      $cx "$y" "$ORANGE" $cx "$y" $(( bg / 10 )) $(( bg % 10 )) $(( bg / 10 )) $(( bg % 10 )); done; }

# ---- F Comet + stepper: the current node rings out the moment the comet lands; working: the comet only flies right ----
comet() { local i; for i in 0 1 2 3 4 5; do printf '<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' $(( $1 - i * 7 )) "$2" "$(( 4 - i / 2 ))" "$ORANGE" "$(echo "1 .7 .5 .35 .2 .1" | cut -d' ' -f$((i+1)))"; done; }
track_comet3() { local x=$1 y=$2 w=$3 mode=$4 i
  local DUR=1.6s
  if [ "$mode" = idle ]; then
    rect "$x" $(( y - 1 )) "$w" 2 1 "$EMPTY"
    printf '<g><animateTransform attributeName="transform" type="translate" values="0 0;%s 0" keyTimes="0;1" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.85;1" dur="2.2s" repeatCount="indefinite"/>' $(( w - 8 ))
    comet "$x" "$y"; echo '</g>'; return; fi
  local cur; cur=$(nodeX $x $w $D)
  rect "$x" $(( y - 1 )) $(( cur - x )) 2 1 "$ORANGE"; rect $(( cur + LABW - 4 )) $(( y - 1 )) $(( x + w - cur - LABW + 4 )) 2 1 "$EMPTY"
  for i in 0 1 2 3 4 5 6; do local cx; cx=$(nodeX $x $w $i)
    if [ $i -lt $D ]; then printf '<circle cx="%s" cy="%s" r="5" fill="%s"/>' $cx "$y" "$ORANGE"
    elif [ $i -eq $D ]; then
      printf '<circle cx="%s" cy="%s" r="5" fill="%s" stroke="%s" stroke-width="2"><animate attributeName="fill" values="%s;%s;%s;%s" keyTimes="0;.6;.75;1" dur="%s" repeatCount="indefinite"/></circle>' $cx "$y" "$BG" "$ORANGE" "$BG" "$ORANGE" "$BG" "$BG" $DUR
      printf '<circle cx="%s" cy="%s" r="5" fill="none" stroke="%s" stroke-width="1.8" opacity="0"><animate attributeName="r" values="5;5;16" keyTimes="0;.6;1" dur="%s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;0;1;0" keyTimes="0;.59;.6;1" dur="%s" repeatCount="indefinite"/></circle>' $cx "$y" "$ORANGE" $DUR $DUR
      t $(( cx + 12 )) $(( y + 4 )) 12 700 "$TEXT" 'Run tests'
    else printf '<circle cx="%s" cy="%s" r="4" fill="%s" stroke="%s" stroke-width="2"/>' $cx "$y" "$BG" "$EMPTY"; fi; done
  printf '<g><animateTransform attributeName="transform" type="translate" values="0 0;%s 0;%s 0" keyTimes="0;.6;1" dur="%s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.6;.62;1" dur="%s" repeatCount="indefinite"/>' $(( cur - x - 8 )) $(( cur - x - 8 )) $DUR $DUR
  comet $(( x + 8 )) "$y"; echo '</g>'; }

draw2 heart3    'A · Heartbeat' band > "$out/theme2-a-heartbeat.svg"
draw2 lcars2    'B · Console' band2 > "$out/theme2-b-console.svg"
draw2 stepring3 'E · Stepper + ring' band2 > "$out/theme2-e-stepper-ring.svg"
draw2 comet3    'F · Comet + stepper' band2 > "$out/theme2-f-comet-stepper.svg"
