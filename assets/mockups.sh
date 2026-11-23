#!/usr/bin/env bash
# Writes the README mockups of the open card, one dark and one light SVG per mockup, into $1: bash assets/mockups.sh assets
# Hand-drawn mockups with example numbers, not the mod's own drawing: redraw them when the card changes.
set -eu
out="$1"

palette() {
  if [ "$1" = dark ]; then
    BG='#2a2925' TEXT='#e8e2d2' MUTED='#8d8775' EMPTY='#4a463b' LINE='#3a372f' ORANGE='#ff6b1a' YELLOW='#f5a623'
    WARM='#cc6363' COLD='#6aaabd' OK='#1d9e75' DANGER='#e24b4a' INK='#1c1a16' BTN='#3a3832'
  else
    BG='#f4f1ea' TEXT='#2b2a26' MUTED='#6b675c' EMPTY='#d9d4c7' LINE='#e0dbcf' ORANGE='#d4560c' YELLOW='#a8700f'
    WARM='#b04545' COLD='#2c7a94' OK='#0f7a57' DANGER='#c03534' INK='#ffffff' BTN='#e6e2d8'
  fi
}

# t x y size weight fill text [anchor]
t() { printf '<text x="%s" y="%s" font-size="%s" font-weight="%s" fill="%s"%s>%s</text>' "$1" "$2" "$3" "$4" "$5" "${7:+ text-anchor=\"$7\"}" "$6"; }
rect() { printf '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"/>' "$@"; }
title() { t "$1" "$2" 11 700 "$MUTED" "$3"; }
# big x y figure unit
big() { printf '<text x="%s" y="%s" font-weight="600" fill="%s"><tspan font-size="26">%s</tspan><tspan font-size="13" font-weight="500" fill="%s" dx="6">%s</tspan></text>' "$1" "$2" "$TEXT" "$3" "$MUTED" "$4"; }
vline() { rect "$1" "$2" 1 "$3" 0 "$LINE"; }
hline() { rect "$1" "$2" "$3" 1 0 "$LINE"; }
# dots x y lit hue: 25 x 2
dots() { local i c; for i in $(seq 0 49); do c=$EMPTY; [ "$i" -lt "$3" ] && c=$4
  printf '<circle cx="%s" cy="%s" r="2.6" fill="%s"/>' $(( $1 + 3 + (i % 25) * 8 )) $(( $2 + (i / 25) * 8 )) "$c"; done; }
# bars x base
bars() { local i=0 h c; for h in 2 5 9 2 14 7 18; do c=$MUTED; [ $i -eq 6 ] && c=$ORANGE; [ "$h" -eq 2 ] && c=$EMPTY
  rect $(( $1 + i * 13 )) $(( $2 - h )) 10 "$h" 1 "$c"; i=$((i+1)); done; }
# track x y w fillw fillcol tick
track() { rect "$1" "$2" "$3" 5 2.5 "$EMPTY"; rect "$1" "$2" "$4" 5 2.5 "$5"; rect "$6" $(( $2 - 4 )) 2 13 0 "$TEXT"; }
chip() { local w=$(( ${#3} * 9 + 14 )); rect "$1" $(( $2 - 15 )) "$w" 21 6 "$4"; t $(( $1 + w / 2 )) $(( $2 )) 12 700 "$INK" "$3" middle; }
btn() { rect "$1" $(( $2 - 16 )) "$3" 24 6 "$BTN"; t $(( $1 + $3 / 2 )) $(( $2 )) 12 500 "$TEXT" "$4" middle; }

head_() { printf '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="0 0 %s %s" font-family="system-ui,-apple-system,Segoe UI,sans-serif">' "$1" "$2" "$1" "$2"
  rect 0 0 "$1" "$2" 12 "$BG"; }

toprow() { # cold(0/1) width
  local hue=$WARM word=WARM after='32m left'; [ "$1" = 1 ] && hue=$COLD word=COLD after='16h 19m · $1.52'
  t 18 34 13 700 "$TEXT" USAGE; t 76 34 13 500 "$MUTED" 5H; t 100 34 13 700 "$YELLOW" '90% left'; t 162 34 13 500 "$MUTED" '· 3h 50m'
  t 234 34 13 500 "$MUTED" 7D; t 258 34 13 700 "$ORANGE" '69% left'; t 320 34 13 500 "$MUTED" '· 3d 3h'
  t 380 34 13 500 "$MUTED" COST; t 418 34 13 700 "$TEXT" '≈$16.61'; t 474 34 13 500 "$MUTED" '· last $0.47'
  chip 570 34 "$word" "$hue"; t $(( 570 + ${#word} * 9 + 22 )) 34 13 700 "$hue" "$after"
  btn $(( $2 - 230 )) 34 28 '−'; btn $(( $2 - 194 )) 34 92 'Keep warm'; btn $(( $2 - 94 )) 34 78 'Wrap up'
  rect 18 50 $(( $2 - 36 )) 2 1 "$ORANGE"
}

col() { echo $(( 18 + $1 * ($2 + 24) )); } # col i colW

# The row above the card on a narrow band: percent used of each limit as /usage writes it, the cost, the chip and the icon buttons.
narrowrow() { # cold
  local hue=$WARM word=WARM next='32m'; [ "$1" = 1 ] && hue=$COLD word=COLD next='$1.52 next'
  t 18 34 13 500 "$MUTED" 5h; t 38 34 13 700 "$YELLOW" '10%'; t 82 34 13 500 "$MUTED" week; t 120 34 13 700 "$ORANGE" '31%'; t 166 34 13 700 "$TEXT" '≈$16.61'; chip 232 34 "$word" "$hue"; t $(( 232 + ${#word} * 9 + 22 )) 34 13 700 "$hue" "$next"
  btn 470 34 28 '−'; btn 504 34 36 K; btn 546 34 36 W; rect 18 50 564 2 1 "$ORANGE"
}

# A status line: a 4 px dot, then the text. ln y dotfill text
ln() { printf '<circle cx="22" cy="%s" r="4" fill="%s"/>' $(( $1 - 4 )) "$2"; t 34 "$1" 12.5 600 "$TEXT" "$3"; }

# Layout B, one layout at every width: the pace strip across the top, then as many columns as fit
# (DELEGATION, IN CACHE, SPEND, KEEP WARM), a status line for each zone without a column, and from three
# columns the metric row. W 1200 is three columns, W 600 one.
card_b() { # W cold metrics
  local W=$1 cold=$2 mx=$3 n=1 hue=$WARM
  [ "$W" -ge 1000 ] && n=3
  [ "$cold" = 1 ] && hue=$COLD
  local cw=$(( (W - 36 - (n - 1) * 24) / n )) lines=$(( 4 - n )) sh H
  sh=$(( 302 + 25 * (lines - 1) + 14 )); H=$sh
  [ "$mx" = 1 ] && [ "$n" = 3 ] && H=$(( sh + 106 ))
  head_ $W $H
  if [ "$n" = 3 ]; then toprow "$cold" "$W"; else narrowrow "$cold"; fi

  # The pace strip: label, track (55% of the strip after the label), the forecast to the right on the same line.
  title 18 82 'PACE VS RESET'
  local tx=$(( 18 + 28 )) tw=$(( (W - 36 - 28) * 55 / 100 )) wx lowl='runs out in ~2h 40m'
  wx=$(( tx + tw + 12 )); [ "$W" -lt 1000 ] && lowl='out in ~2h 40m'
  t 18 134 12 700 "$ORANGE" 7D; track $tx 126 $tw $tw "$ORANGE" $(( tx + tw * 36 / 100 ))
  printf '<text x="%s" y="134" font-size="12" font-weight="500" fill="%s"><tspan fill="%s">lasts ~8d 14h</tspan> · resets 3d 3h <tspan fill="%s" font-weight="700">✓</tspan></text>' $wx "$MUTED" "$TEXT" "$OK"
  t 18 106 12 700 "$YELLOW" 5H; track $tx 98 $tw $(( tw * 70 / 100 )) "$DANGER" $(( tx + tw - 2 ))
  printf '<text x="%s" y="106" font-size="12" font-weight="500" fill="%s"><tspan fill="%s">%s</tspan> · resets 3h 50m</text>' $wx "$MUTED" "$DANGER" "$lowl"
  hline 18 150 $(( W - 36 ))

  # DELEGATION, first: the saving, cost and time compare bars, the work against the time it took.
  local x0 x1 x2; x0=$(col 0 $cw); x1=$(col 1 $cw); x2=$(col 2 $cw)
  title "$x0" 172 DELEGATION
  printf '<text x="%s" y="204" font-weight="600" fill="%s"><tspan font-size="26">≈$3.40</tspan><tspan font-size="13" font-weight="500" fill="%s" dx="6">saved</tspan></text>' "$x0" "$OK" "$MUTED"
  local rx=$(( x0 + 150 )) bx bw; bx=$(( rx + 36 )); bw=$(( x0 + cw - bx )); [ "$bw" -gt 160 ] && bw=160
  t $rx 190 12 600 "$MUTED" cost; rect $bx 184 $bw 6 3 "$EMPTY"; rect $bx 184 $(( bw * 40 / 100 )) 6 3 "$ORANGE"
  t $rx 204 12 600 "$MUTED" time; rect $bx 198 $bw 6 3 "$EMPTY"; rect $bx 198 $(( bw * 42 / 100 )) 6 3 "$YELLOW"
  t "$x0" 254 12 500 "$MUTED" '12m of agent work in 5m · 2.4× faster'

  if [ "$n" = 3 ]; then
    # IN CACHE with its runway line, and SPEND.
    vline $(( x1 - 12 )) 160 110
    if [ "$cold" = 1 ]; then title "$x1" 172 RE-CACHE; else title "$x1" 172 'IN CACHE'; fi
    big "$x1" 200 190k tokens; dots "$x1" 214 10 "$hue"
    t "$x1" 246 12 500 "$MUTED" '19% of the 1M context · 810k free'; t "$x1" 266 12 500 "$MUTED" '~40 turns left at +6k a turn'
    vline $(( x2 - 12 )) 160 110
    title "$x2" 172 SPEND; big "$x2" 200 '≈$16.61' 'this thread'; bars "$x2" 232; t "$x2" 246 12 500 "$MUTED" 'today $3.10 · week $16.61'; t "$x2" 266 12 500 "$MUTED" '4 commits · 1 PR · ≈$3.32 a result'
  fi

  # The zones with no column: one status line each.
  hline 18 280 $(( W - 36 ))
  local keepdot=$OK keeptxt='keep warm $0.05/h · going cold $1.52 · saved $4.20'
  [ "$cold" = 1 ] && keepdot=$COLD keeptxt='re-cache $1.52 on Opus · Sonnet $0.76 · Haiku $0.19'
  if [ "$n" = 1 ]; then
    ln 302 "$hue" '190k in cache · 19% of the 1M context · 810k free'
    ln 327 "$MUTED" '≈$16.61 this thread · today $3.10 · week $16.61'
    ln 352 "$keepdot" "$keeptxt"
  else
    ln 302 "$keepdot" "$keeptxt"
  fi

  if [ "$mx" = 1 ] && [ "$n" = 3 ]; then
    # The metric row, three cells: cache hit, cost per turn, by model.
    local m=$sh x
    hline 18 $m $(( W - 36 ))
    x=$x0; title "$x" $(( m + 26 )) 'CACHE HIT'; big "$x" $(( m + 58 )) 96% ''; t "$x" $(( m + 88 )) 12 500 "$MUTED" '$0.42 per 1M tokens'
    x=$x1; vline $(( x - 12 )) $(( m + 10 )) 100; title "$x" $(( m + 26 )) 'PER TURN'; big "$x" $(( m + 58 )) '$0.38' avg
    printf '<text x="%s" y="%s" font-size="12" font-weight="500" fill="%s">last $2.11 · <tspan fill="%s">5× avg</tspan></text>' "$x" $(( m + 88 )) "$MUTED" "$DANGER"
    # BY MODEL: the biggest share as the figure, a split bar of every model, the two largest costs as the caption.
    x=$x2; vline $(( x - 12 )) $(( m + 10 )) 100; title "$x" $(( m + 26 )) 'BY MODEL'
    printf '<text x="%s" y="%s" font-weight="600" fill="%s"><tspan font-size="26">Opus</tspan><tspan font-size="26" fill="%s" dx="8">78%%</tspan></text>' "$x" $(( m + 58 )) "$TEXT" "$WARM"
    local o=$(( (cw - 4) * 78 / 100 )) s=$(( (cw - 4) * 17 / 100 )) h
    h=$(( cw - 4 - o - s ))
    rect "$x" $(( m + 66 )) $o 6 3 "$WARM"; rect $(( x + o + 2 )) $(( m + 66 )) $s 6 3 "$ORANGE"; rect $(( x + o + s + 4 )) $(( m + 66 )) $h 6 3 "$YELLOW"
    printf '<text x="%s" y="%s" font-size="12" font-weight="500" fill="%s"><tspan fill="%s">■</tspan> $12.96 · <tspan fill="%s">■</tspan> Sonnet $2.90</text>' "$x" $(( m + 88 )) "$MUTED" "$WARM" "$ORANGE"
  fi
  echo '</svg>'
}

for m in dark light; do
  palette $m
  card_b 1200 0 1 > "$out/card-b-1200-warm-$m.svg"
  card_b 600 0 0 > "$out/card-b-600-warm-$m.svg"
  card_b 600 1 0 > "$out/card-b-600-cold-$m.svg"
done
