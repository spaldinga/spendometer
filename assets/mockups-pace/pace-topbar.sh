#!/usr/bin/env bash
# Writes pace-topbar.svg beside this script: mockups of the 5h pace in the always-visible top row (backlog 70).
# Hand-drawn, example numbers, dark palette only. Not the mod's own drawing. Text is assumed 7.5 px a character;
# the script warns on stderr when a row's content runs into its buttons.
set -eu
export LC_ALL=C.UTF-8
cd "$(dirname "$0")"
BG='#2a2925' ROW='#34322c' TEXT='#e8e2d2' MUTED='#8d8775' EMPTY='#4a463b' LINE='#3a372f' ORANGE='#ff6b1a' YELLOW='#f5a623'
WARM='#cc6363' OK='#1d9e75' DANGER='#e24b4a' INK='#1c1a16' BTN='#3a3832'

# --- helpers copied from ../mockups.sh
t() { printf '<text x="%s" y="%s" font-size="%s" font-weight="%s" fill="%s"%s>%s</text>' "$1" "$2" "$3" "$4" "$5" "${7:+ text-anchor=\"$7\"}" "$6"; }
rect() { printf '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"/>' "$@"; }
track() { rect "$1" "$2" "$3" 5 2.5 "$EMPTY"; rect "$1" "$2" "$4" 5 2.5 "$5"; rect "$6" $(( $2 - 4 )) 2 13 0 "$TEXT"; }
chip() { local w=$(( ${#3} * 9 + 14 )); rect "$1" $(( $2 - 15 )) "$w" 21 6 "$4"; t $(( $1 + w / 2 )) $(( $2 )) 12 700 "$INK" "$3" middle; }
pie() { printf '<circle cx="%s" cy="%s" r="7" fill="%s"/>' $(( $1 + 8 )) $(( $2 + 8 )) "$EMPTY"
  awk -v cx=$(( $1 + 8 )) -v cy=$(( $2 + 8 )) -v p="$3" -v c="$4" 'BEGIN { a = p / 100 * 6.2831853; printf "<path d=\"M%d %dL%d %dA7 7 0 %d 1 %.2f %.2fZ\" fill=\"%s\"/>", cx, cy, cx, cy - 7, (p > 50), cx + 7 * sin(a), cy - 7 * cos(a), c }'; }
btn() { rect "$1" $(( $2 - 16 )) "$3" 24 6 "$BTN"; t $(( $1 + $3 / 2 )) $2 12 500 "$TEXT" "$4" middle; }
# ptick x y pct: a 2 px white radial tick on the pie rim at the share of the window's time gone
ptick() { awk -v cx=$(( $1 + 8 )) -v cy=$(( $2 + 8 )) -v p="$3" -v c="$TEXT" 'BEGIN { a = p / 100 * 6.2831853; printf "<line x1=\"%.2f\" y1=\"%.2f\" x2=\"%.2f\" y2=\"%.2f\" stroke=\"%s\" stroke-width=\"2\"/>", cx + 3.5 * sin(a), cy - 3.5 * cos(a), cx + 10 * sin(a), cy - 10 * cos(a), c }'; }

# --- a cursor, so text positions follow from the text and overflow is caught
X=0
adv() { X=$(( X + ${#1} * 15 / 2 + $2 )); }
put() { t $X 34 13 "$2" "$3" "$1"; adv "$1" "$4"; }      # put text weight fill gap
pp() { pie $X 26 "$1" "$2"; [ -n "${3:-}" ] && ptick $X 26 "$3"; X=$(( X + 16 + $4 )); } # pp pct col tick|"" gap
words() { # mode full|short|tiny; uses $ST
  local s
  if [ "$ST" = on ]; then
    case $1 in full) s='~48% at reset ✓';; short) s='~48% ✓';; *) s='✓';; esac
    printf '<text x="%s" y="34" font-size="13" font-weight="500" fill="%s">%s<tspan fill="%s" font-weight="700">✓</tspan></text>' $X "$MUTED" "${s%✓}" "$OK"
  else
    case $1 in full) s='out in ~1h 20m';; short) s='out in ~1h';; *) s='1h';; esac
    t $X 34 13 700 "$DANGER" "$s"
  fi
  adv "$s" 14
}
mtrack() { # width: the 5h pace track inline
  local f=$(( $1 * PCT / 100 )) k=$(( X + $1 * TICK / 100 - 1 ))
  track $X 29 $1 $f "$COL" $k; X=$(( X + $1 + 10 ))
}

# pace_row variant(base|A|B|C) size(wide|compact|narrow) state(on|over)
pace_row() {
  local v=$1 sz=$2 W lim x0=18
  ST=$3
  if [ "$ST" = on ]; then PCT=39 TICK=81 COL=$YELLOW REM='57m'; else PCT=70 TICK=40 COL=$DANGER REM='3h'; fi
  case $sz in wide) W=1040;; compact) W=640;; narrow) W=420; x0=12;; esac
  rect 0 0 $W 60 8 "$ROW"; rect 18 50 $(( W - 36 )) 2 1 "$ORANGE"
  X=$x0
  local wm=short tw=44; [ $sz = wide ] && wm=full tw=64
  if [ $sz = narrow ]; then wm=short tw=30; [ $v != A ] && wm=tiny; fi; [ $sz = compact ] && [ $v = B ] && wm=tiny
  case $sz in
  wide)
    lim=$(( W - 206 - 14 ))
    put USAGE 700 "$TEXT" 8; put 5H 500 "$MUTED" 6
    [ $v = C ] && pp $PCT "$COL" $TICK 6 || pp $PCT "$COL" "" 6
    put "$PCT% used" 700 "$COL" 8
    [ $v = B ] && mtrack $tw
    [ $v != B ] && put "· $REM" 500 "$MUTED" 14
    [ $v != base ] && words $wm
    X=$(( X + 8 ))
    put 7D 500 "$MUTED" 6; pp 37 "$ORANGE" "" 6; put '37% used' 700 "$ORANGE" 12
    put COST 500 "$MUTED" 8; put '≈$6.01' 700 "$TEXT" 6; put '· last $0.47' 500 "$MUTED" 16
    chip $X 34 WARM "$WARM"; X=$(( X + 4 * 9 + 14 + 8 )); put '32m left' 700 "$WARM" 0
    btn $(( W - 230 )) 34 28 '−'; btn $(( W - 194 )) 34 92 'Keep warm'; btn $(( W - 94 )) 34 78 'Wrap up';;
  compact)
    lim=$(( W - 120 - 8 ))
    put 5h 500 "$MUTED" 6
    [ $v = C ] && pp $PCT "$COL" $TICK 6 || pp $PCT "$COL" "" 6
    put "$PCT%" 700 "$COL" 8
    [ $v = B ] && mtrack $tw
    [ $v != base ] && words $wm
    X=$(( X + 8 ))
    put week 500 "$MUTED" 6; pp 37 "$ORANGE" "" 6; put 37% 700 "$ORANGE" 14
    put '≈$6.01' 700 "$TEXT" 12
    chip $X 34 WARM "$WARM"; X=$(( X + 4 * 9 + 14 + 8 )); put '$0.03 next' 700 "$WARM" 0
    btn $(( W - 120 )) 34 28 '−'; btn $(( W - 88 )) 34 36 K; btn $(( W - 48 )) 34 36 W;;
  narrow)
    lim=$(( W - 120 - 4 ))
    put 5h 500 "$MUTED" 6
    [ $v = C ] && pp $PCT "$COL" $TICK 6 || pp $PCT "$COL" "" 6
    put "$PCT%" 700 "$COL" 8
    [ $v = B ] && mtrack $tw
    [ $v != base ] && words $wm
    X=$(( X + 6 ))
    put wk 500 "$MUTED" 6; put 37% 700 "$ORANGE" 10
    put '≈$6.01' 700 "$TEXT" 10
    printf '<circle cx="%s" cy="30" r="4" fill="%s"/>' $(( X + 4 )) "$WARM"; X=$(( X + 8 ))
    btn $(( W - 120 )) 34 28 '−'; btn $(( W - 88 )) 34 36 K; btn $(( W - 48 )) 34 36 W;;
  esac
  [ $X -gt $lim ] && echo "overflow: $v $sz $ST ends at $X, limit $lim" >&2
  return 0
}

body=$(mktemp); Y=0
section() { t 30 $(( Y + 20 )) 16 700 "$TEXT" "$1" >> "$body"; t 30 $(( Y + 40 )) 12 500 "$MUTED" "$2" >> "$body"; Y=$(( Y + 62 )); }
row() { # variant size state label
  t 30 $(( Y + 8 )) 11 600 "$MUTED" "$4" >> "$body"
  printf '<g transform="translate(30,%s)">' $(( Y + 14 )) >> "$body"; pace_row "$1" "$2" "$3" >> "$body"; printf '</g>' >> "$body"
  Y=$(( Y + 84 ))
}
block() { # variant
  local sz st
  for sz in wide compact narrow; do for st in on over; do
    if [ $st = on ]; then row "$1" $sz $st "$sz, on pace: 39% used, resets in 57m (tick at 81%)"
    else row "$1" $sz $st "$sz, over pace: 70% used, 2h of 5h gone (tick at 40%)"; fi
  done; done
}

t 30 36 20 700 "$TEXT" 'The 5h pace in the top row' >> "$body"
t 30 58 12 500 "$MUTED" 'Fill = share of the 5h limit used (red when the forecast runs out before the reset). White tick = share of the window time gone. Only 5h gets pace; 7D is unchanged.' >> "$body"
Y=80
section 'Today (no pace)' 'The top row as it is now, for comparison.'
row base wide on 'wide'; row base compact on 'compact'; row base narrow on 'narrow'
section 'A. Words only' 'After 5h 39%: "~48% at reset ✓" or "out in ~1h 20m" in red. Shortened on compact and narrow.'
block A
section 'B. Mini track inline + words' 'A 64/44/30 px track with the time tick after the percent, then the words (shortened to ✓ / out 1h on narrow).'
block B
section 'C. The pie gets the tick + words' 'The existing pie keeps its size; a white tick on its rim marks the time gone. Words as in A (✓ / out 1h on narrow).'
block C

H=$(( Y + 10 ))
{ printf '<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="%s" viewBox="0 0 1100 %s" font-family="system-ui,-apple-system,Segoe UI,sans-serif">' $H $H
  rect 0 0 1100 $H 0 "$BG"; cat "$body"; echo '</svg>'; } > pace-topbar.svg
rm "$body"
echo "wrote $(pwd)/pace-topbar.svg"
