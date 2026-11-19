#!/usr/bin/env bash
# A, next iteration: the monitor's pen writes the done stretch and ends at a beating heart with the step's name;
# working: the heart beats at the start and the pen writes the line out from it.
set -u
out="$1"
here="$(dirname "$0")"
sed '/^draw2 monitor/,$d' "$here/progress8.sh" > "$here/theme4helpers.sh"
. "$here/theme4helpers.sh"

track_heart5() { local x=$1 y=$2 w=$3 mode=$4 step=$(( $3 / N ))
  if [ "$mode" = idle ]; then
    heart $(( x + 10 )) "$y"
    pen $(( x + 24 )) $(( x + w )) "$y" 90 3.6s; return; fi
  # The done stretch: one beat per done step, written by the pen, ending at the heart.
  local hx; hx=$(nodeX $x $w $D)
  pen "$x" $(( hx - 14 )) "$y" "$(( (hx - 14 - x) / D ))" 2.4s
  heart "$hx" "$y"
  t $(( hx + 14 )) $(( y + 4 )) 12 700 "$TEXT" 'Run tests'
  printf '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="2" stroke-dasharray="2 5"/>' $(( hx + LABW - 4 )) "$y" $(( x + w )) "$y" "$EMPTY"
  local i; for i in 4 5 6; do local cx; cx=$(nodeX $x $w $i); printf '<circle cx="%s" cy="%s" r="3" fill="%s"/>' $cx "$y" "$EMPTY"; done; }

draw2 heart5 'A · Heartbeat: the pen writes the done steps, the heart beats at the current one' band2 > "$out/theme5-a-heartbeat.svg"
