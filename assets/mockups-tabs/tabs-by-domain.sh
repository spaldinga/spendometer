#!/usr/bin/env bash
# Writes tabs-by-domain.svg beside this script: the card's two domain tabs, Cost and Capacity (backlog 85),
# wide (1200) and narrow (600), dark and light, and the candidates for Capacity's icon.
# Hand-drawn mockups with example numbers, in the style of assets/mockups.sh.
set -eu
export LC_ALL=C.UTF-8
cd "$(dirname "$0")"
EMO="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif"
CAP='🔋' # Capacity's icon in the cards; the strip at the top shows the other candidates

palette() {
  if [ "$1" = dark ]; then
    BG='#2a2925' TEXT='#e8e2d2' MUTED='#8d8775' EMPTY='#4a463b' LINE='#3a372f' ORANGE='#ff6b1a' YELLOW='#f5a623'
    WARM='#cc6363' COLD='#6aaabd' OK='#1d9e75' DANGER='#e24b4a' INK='#1c1a16' BTN='#3a3832' FRAME='#1c1a16'
  else
    BG='#f4f1ea' TEXT='#2b2a26' MUTED='#6b675c' EMPTY='#d9d4c7' LINE='#e0dbcf' ORANGE='#d4560c' YELLOW='#a8700f'
    WARM='#b04545' COLD='#2c7a94' OK='#0f7a57' DANGER='#c03534' INK='#ffffff' BTN='#e6e2d8' FRAME='#f4f1ea'
  fi
}

t() { printf '<text x="%s" y="%s" font-size="%s" font-weight="%s" fill="%s"%s>%s</text>' "$1" "$2" "$3" "$4" "$5" "${7:+ text-anchor=\"$7\"}" "$6"; }
rect() { printf '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"/>' "$@"; }
title() { t "$1" "$2" 11 700 "$MUTED" "$3"; }
big() { printf '<text x="%s" y="%s" font-weight="600" fill="%s"><tspan font-size="26">%s</tspan><tspan font-size="13" font-weight="500" fill="%s" dx="6">%s</tspan></text>' "$1" "$2" "${5:-$TEXT}" "$3" "$MUTED" "$4"; }
vline() { rect "$1" "$2" 1 "$3" 0 "$LINE"; }
hline() { rect "$1" "$2" "$3" 1 0 "$LINE"; }
dots() { local i c; for i in $(seq 0 49); do c=$EMPTY; [ "$i" -lt "$3" ] && c=$4
  printf '<circle cx="%s" cy="%s" r="2.6" fill="%s"/>' $(( $1 + 3 + (i % 25) * 8 )) $(( $2 + (i / 25) * 8 )) "$c"; done; }
bars() { local i=0 h c; for h in 2 5 9 2 14 7 18; do c=$MUTED; [ $i -eq 6 ] && c=$ORANGE; [ "$h" -eq 2 ] && c=$EMPTY
  rect $(( $1 + i * 13 )) $(( $2 - h )) 10 "$h" 1 "$c"; i=$((i+1)); done; }
track() { rect "$1" "$2" "$3" 5 2.5 "$EMPTY"; rect "$1" "$2" "$4" 5 2.5 "$5"; rect "$6" $(( $2 - 4 )) 2 13 0 "$TEXT"; }
chip() { local w=$(( ${#3} * 9 + 14 )); rect "$1" $(( $2 - 15 )) "$w" 21 6 "$4"; t $(( $1 + w / 2 )) $(( $2 )) 12 700 "$INK" "$3" middle; }
ln() { printf '<circle cx="22" cy="%s" r="4" fill="%s"/>' $(( $1 - 4 )) "$2"; t 34 "$1" 12.5 600 "$TEXT" "$3"; }

# A tab button: x y wide(1/0) emoji word selected(1/0). Prints the button and sets BW to its width.
tabbtn() {
  local op=1; [ "$6" = 0 ] && op=.4
  if [ "$3" = 1 ]; then BW=$(( ${#5} * 8 + 38 )); else BW=30; fi
  rect "$1" $(( $2 - 16 )) $BW 24 6 "$BTN"
  printf '<text x="%s" y="%s" font-size="14" font-family="%s" opacity="%s">%s</text>' $(( $1 + 7 )) $(( $2 + 1 )) "$EMO" $op "$4"
  [ "$3" = 1 ] && printf '<text x="%s" y="%s" font-size="12" font-weight="500" fill="%s" opacity="%s">%s</text>' $(( $1 + 29 )) "$2" "$TEXT" $op "$5"
  return 0
}
# The two tabs then the fold button, ending at the right edge: xr y wide sel(cost|capacity) capEmoji
tabs() {
  local w=$3 x
  if [ "$w" = 1 ]; then x=$(( $1 - 34 - 8 - (4 * 8 + 38) - 8 - (8 * 8 + 38) )); else x=$(( $1 - 34 - 8 - 30 - 8 - 30 )); fi
  local c=0 k=0; [ "$4" = cost ] && c=1; [ "$4" = capacity ] && k=1
  tabbtn $x "$2" "$w" '💰' Cost $c; x=$(( x + BW + 8 ))
  tabbtn $x "$2" "$w" "$5" Capacity $k; x=$(( x + BW + 8 ))
  rect $x $(( $2 - 16 )) 28 24 6 "$BTN"; t $(( x + 14 )) "$2" 12 500 "$TEXT" '−' middle
}

# The band's row above the card, cut down to what matters here: the cost, the chip, the tabs, the fold button.
row() { # W wide sel
  t 18 34 13 500 "$MUTED" COST; t 56 34 13 700 "$TEXT" '≈$16.61'; chip 122 34 WARM "$WARM"; t 180 34 13 700 "$WARM" '32m left'
  tabs $(( $1 - 18 )) 34 "$2" "$3" "$CAP"
  rect 18 50 $(( $1 - 36 )) 2 1 "$ORANGE"
}

col() { echo $(( 18 + $1 * ($2 + 24) )); }

# The Cost tab. Wide: SPEND, DELEGATION and CACHE DISCOUNT as columns, PER MESSAGE and BY MODEL as lines.
# Narrow: SPEND as the column, the other four as lines.
cost_card() { # W
  local W=$1 n=1 y0=56; [ "$W" -ge 1000 ] && n=3
  local cw=$(( (W - 36 - (n - 1) * 24) / n )) lines=$(( 5 - n )) H x0 x1 x2
  H=$(( y0 + 124 + 27 * lines + 4 + 8 ))
  rect 0 0 $W $H 12 "$BG"; row $W $(( n == 3 ? 1 : 0 )) cost
  x0=$(col 0 $cw); x1=$(col 1 $cw); x2=$(col 2 $cw)
  title $x0 $(( y0 + 22 )) SPEND; big $x0 $(( y0 + 50 )) '≈$16.61' 'this thread'; bars $x0 $(( y0 + 82 ))
  t $x0 $(( y0 + 96 )) 12 500 "$MUTED" 'today $3.10 · week $16.61'; t $x0 $(( y0 + 116 )) 12 500 "$MUTED" '4 commits · 1 PR · ≈$3.32 a result'
  if [ $n = 3 ]; then
    vline $(( x1 - 12 )) $(( y0 + 10 )) 110; title $x1 $(( y0 + 22 )) DELEGATION; big $x1 $(( y0 + 50 )) '≈$3.40' saved "$OK"
    local rx=$(( x1 + 150 )) bx bw; bx=$(( rx + 36 )); bw=$(( x1 + cw - bx )); [ "$bw" -gt 160 ] && bw=160
    t $rx $(( y0 + 36 )) 12 600 "$MUTED" cost; rect $bx $(( y0 + 30 )) $bw 6 3 "$EMPTY"; rect $bx $(( y0 + 30 )) $(( bw * 40 / 100 )) 6 3 "$ORANGE"
    t $rx $(( y0 + 50 )) 12 600 "$MUTED" time; rect $bx $(( y0 + 44 )) $bw 6 3 "$EMPTY"; rect $bx $(( y0 + 44 )) $(( bw * 42 / 100 )) 6 3 "$YELLOW"
    t $x1 $(( y0 + 96 )) 12 500 "$MUTED" '12m of agent work in 5m · 2.4× faster'
    vline $(( x2 - 12 )) $(( y0 + 10 )) 110; title $x2 $(( y0 + 22 )) 'CACHE DISCOUNT'; big $x2 $(( y0 + 50 )) '96%' 'read from cache'
    t $x2 $(( y0 + 96 )) 12 500 "$MUTED" '$0.42 per 1M tokens'; t $x2 $(( y0 + 116 )) 12 500 "$MUTED" 'keep-warm pings saved $4.20'
  fi
  local y=$(( y0 + 124 )); hline 18 $y $(( W - 36 )); y=$(( y + 24 ))
  if [ $n = 1 ]; then
    ln $y "$MUTED" 'delegation ≈$3.40 saved · 12m of work in 5m'; y=$(( y + 27 ))
    ln $y "$MUTED" 'cache discount 96% · $0.42 per 1M tokens'; y=$(( y + 27 ))
  fi
  ln $y "$MUTED" 'per message $0.38 avg · last $2.11 · 5× avg'; y=$(( y + 27 ))
  ln $y "$MUTED" 'by model Opus $12.96 · Sonnet $2.90 · Haiku $0.75'
  CH=$H
}

# The Capacity tab: the pace strip across the top, then CONVERSATION SIZE and TOOL OUTPUT. Narrow: tool output as a line.
capacity_card() { # W
  local W=$1 n=1 y0=56; [ "$W" -ge 1000 ] && n=2
  local cw=$(( (W - 36 - (n - 1) * 24) / n )) lines=$(( 2 - n )) H x0 x1 yc
  H=$(( y0 + 88 + 124 + (lines > 0 ? 27 * lines + 4 : 0) + 8 ))
  rect 0 0 $W $H 12 "$BG"; row $W $(( n == 2 ? 1 : 0 )) capacity
  title 18 $(( y0 + 22 )) 'PACE VS RESET'
  local tx=46 tw wx lowl='runs out in ~2h 40m'
  tw=$(( (W - 36 - 28) * 55 / 100 )); wx=$(( tx + tw + 12 )); [ "$W" -lt 1000 ] && lowl='out in ~2h 40m'
  t 18 $(( y0 + 48 )) 12 700 "$YELLOW" 5H; track $tx $(( y0 + 40 )) $tw $(( tw * 70 / 100 )) "$DANGER" $(( tx + tw * 40 / 100 ))
  printf '<text x="%s" y="%s" font-size="12" font-weight="500" fill="%s"><tspan fill="%s">%s</tspan> · resets 3h 0m</text>' $wx $(( y0 + 48 )) "$MUTED" "$DANGER" "$lowl"
  t 18 $(( y0 + 74 )) 12 700 "$ORANGE" 7D; track $tx $(( y0 + 66 )) $tw $(( tw * 31 / 100 )) "$ORANGE" $(( tx + tw * 57 / 100 ))
  printf '<text x="%s" y="%s" font-size="12" font-weight="500" fill="%s"><tspan fill="%s">lasts ~8d 14h</tspan> · resets 3d 3h <tspan fill="%s" font-weight="700">✓</tspan></text>' $wx $(( y0 + 74 )) "$MUTED" "$TEXT" "$OK"
  yc=$(( y0 + 88 )); hline 18 $yc $(( W - 36 ))
  x0=$(col 0 $cw); x1=$(col 1 $cw)
  title $x0 $(( yc + 22 )) 'IN CACHE'; big $x0 $(( yc + 50 )) 190k tokens; dots $x0 $(( yc + 64 )) 10 "$WARM"
  t $x0 $(( yc + 96 )) 12 500 "$MUTED" '19% of the 1M context · 810k free'; t $x0 $(( yc + 116 )) 12 500 "$MUTED" '~40 turns left at +6k a turn'
  if [ $n = 2 ]; then
    vline $(( x1 - 12 )) $(( yc + 10 )) 110; title $x1 $(( yc + 22 )) 'TOOL OUTPUT'; big $x1 $(( yc + 50 )) 48k tokens
    rect $x1 $(( yc + 62 )) 180 6 3 "$MUTED"; rect $(( x1 + 182 )) $(( yc + 62 )) 72 6 3 "$YELLOW"; rect $(( x1 + 256 )) $(( yc + 62 )) 36 6 3 "$EMPTY"
    t $x1 $(( yc + 96 )) 12 500 "$MUTED" 'Read 30k · Bash 12k · Grep 6k'; t $x1 $(( yc + 116 )) 12 500 "$MUTED" '3 re-reads of unchanged files · 9k'
  else
    hline 18 $(( yc + 124 )) $(( W - 36 )); ln $(( yc + 148 )) "$MUTED" 'tool output 48k tokens · Read 30k · Bash 12k'
  fi
  CH=$H
}

# Draw a card into the gallery: theme kind W x y. Sets CH to its height.
place() { palette "$1"; printf '<g transform="translate(%s %s)">' "$4" "$5"; "$2"_card "$3"; printf '</g>'; }
label() { t "$1" "$2" 14 700 '#e8e2d2' "$3"; }

# The icon strip: for each candidate, the wide pair and the narrow pair, Capacity selected, in both themes.
strip() { # theme x y
  palette "$1"; printf '<g transform="translate(%s %s)">' "$2" "$3"; rect 0 0 590 190 12 "$BG"
  local y=34 e name
  for e in '🔋|battery: room left' '⛽|fuel: tank level' '🧠|brain: today'"'"'s Context' '⏳|hourglass: time left'; do
    name=${e#*|}; e=${e%%|*}
    t 18 "$y" 12 500 "$MUTED" "$name"
    tabs 420 "$y" 1 capacity "$e"; tabs 572 "$y" 0 capacity "$e"
    y=$(( y + 42 ))
  done
  printf '</g>'
}

{
GW=1240
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %s 2120" width="%s" height="2120" font-family="system-ui,-apple-system,Segoe UI,sans-serif"><rect width="%s" height="2120" fill="#1f1e1b"/>' $GW $GW $GW
t 20 26 12 500 '#a8a28f' 'Backlog 85: the card'"'"'s tabs are the domains, Cost first then Capacity. Overview is gone. Example numbers. The tab in use is the undimmed one.'
label 20 58 'A. Capacity'"'"'s icon: four candidates (wide row: emoji and word; narrow: emoji alone). Cost keeps 💰.'
strip dark 20 72; strip light 630 72
label 20 294 'B. Cost tab, wide (three columns: SPEND, DELEGATION, CACHE DISCOUNT; PER MESSAGE and BY MODEL as lines)'
place dark cost 1200 20 308; y=$(( 308 + CH + 12 )); place light cost 1200 20 $y; y=$(( y + CH + 36 ))
label 20 $(( y - 14 )) 'C. Capacity tab, wide (the pace strip, then IN CACHE and TOOL OUTPUT)'
place dark capacity 1200 20 $y; y=$(( y + CH + 12 )); place light capacity 1200 20 $y; y=$(( y + CH + 36 ))
label 20 $(( y - 14 )) 'D. Narrow (600): Cost, one column (SPEND) and four lines'
place dark cost 600 20 $y; place light cost 600 630 $y; y=$(( y + CH + 36 ))
label 20 $(( y - 14 )) 'E. Narrow (600): Capacity, the pace strip, IN CACHE, and tool output as a line'
place dark capacity 600 20 $y; place light capacity 600 630 $y; y=$(( y + CH + 20 ))
printf '</svg>\n'
echo "height used: $y" >&2
} > tabs-by-domain.svg
echo wrote tabs-by-domain.svg
