#!/usr/bin/env bash
# README pictures: one strip per progress theme (a band running a task list) and the hold for a risky git
# command, each in a dark and a light SVG. Built on the theme mockup scripts beside this one.
set -u
out="$1"
here="$(dirname "$0")"
sed '/^draw2 heart5/,$d' "$here/progress9.sh" > "$here/theme5helpers.sh"
. "$here/theme5helpers.sh"

# calm: one segment a step, the current one breathing (the mod's segmented bar).
track_calm() { local x=$1 y=$2 w=$3 mode=$4 i sw=$(( ($3 - 6 * 3) / 7 ))
  for i in 0 1 2 3 4 5 6; do local sx=$(( x + i * (sw + 3) ))
    if [ $i -lt $D ]; then rect $sx $(( y - 3 )) $sw 6 2 "$ORANGE"
    elif [ $i -eq $D ]; then printf '<rect x="%s" y="%s" width="%s" height="6" rx="2" fill="%s">%s</rect>' $sx $(( y - 3 )) $sw "$ORANGE" "$PULSE"
    else rect $sx $(( y - 3 )) $sw 6 2 "$EMPTY"; fi; done; }

strip() { # theme band-fn file
  local m; for m in dark light; do palette $m
    { printf '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="96" viewBox="0 0 1200 96" font-family="system-ui,-apple-system,Segoe UI,sans-serif">'
      "$2" "$1" 18 9 1164 run; echo '</svg>'; } > "$out/$3-$m.svg"; done; }

strip calm      band  theme-calm
strip heart5    band2 theme-vitals
strip lcars3    band2 theme-bridge
strip crumbs2   band2 theme-wake
strip e2        band2 theme-dial
strip comet3    band2 theme-comet

# The hold: Claude asked for a hard reset; the band shows what it would lose and waits.
hold() { local m; for m in dark light; do palette $m
  { printf '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="176" viewBox="0 0 1200 176" font-family="system-ui,-apple-system,Segoe UI,sans-serif">'
    rect 18 9 1164 158 12 "$BG"; toprow 18 37 1164
    rect 32 54 1136 1 0 "$EMPTY"
    printf '<text x="32" y="80" font-size="13" font-weight="700" fill="%s"><tspan fill="%s">● HELD</tspan>  git reset --hard HEAD~2</text>' "$TEXT" "$ORANGE"
    t 32 102 12.5 500 "$TEXT" '  drops 2 commits:  a1b2c3d Fix the login redirect  ·  9f8e7d6 Add tests for the redirect'
    t 32 122 12.5 500 "$TEXT" '  discards changes in 3 files:  src/login.ts  ·  src/login.test.ts  ·  README.md'
    t 32 150 12 500 "$MUTED" 'Nothing has run yet. Cancel tells Claude no; Proceed lets the command through.'
    btn 960 150 90 Cancel; rect 1060 134 108 24 6 "$ORANGE"; t 1114 150 12 700 "$INK" Proceed middle
    echo '</svg>'; } > "$out/hold-$m.svg"; done; }
hold
