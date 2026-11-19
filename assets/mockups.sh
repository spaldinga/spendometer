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
  t 18 34 13 700 "$TEXT" USAGE; t 76 34 13 500 "$MUTED" 7D; t 100 34 13 700 "$ORANGE" '69% left'; t 162 34 13 500 "$MUTED" '· 3d 3h'
  t 222 34 13 500 "$MUTED" 5H; t 246 34 13 700 "$YELLOW" '90% left'; t 308 34 13 500 "$MUTED" '· 3h 50m'
  t 380 34 13 500 "$MUTED" COST; t 418 34 13 700 "$TEXT" '≈$16.61'; t 474 34 13 500 "$MUTED" '· last $0.47'
  chip 570 34 "$word" "$hue"; t $(( 570 + ${#word} * 9 + 22 )) 34 13 700 "$hue" "$after"
  btn $(( $2 - 230 )) 34 28 '−'; btn $(( $2 - 194 )) 34 92 'Keep warm'; btn $(( $2 - 94 )) 34 78 'Wrap up'
  rect 18 50 $(( $2 - 36 )) 2 1 "$ORANGE"
}

col() { echo $(( 18 + $1 * ($2 + 24) )); } # col i colW

wide() { # name cold metrics
  local W=1200 H=232 cw=$(( (1200 - 36 - 72) / 4 )) hue=$WARM; [ "$3" = 1 ] && H=330; [ "$2" = 1 ] && hue=$COLD
  head_ $W $H; toprow "$2" $W
  local x0 x1 x2 x3; x0=$(col 0 $cw); x1=$(col 1 $cw); x2=$(col 2 $cw); x3=$(col 3 $cw)
  if [ "$2" = 1 ]; then title "$x0" 82 RE-CACHE; else title "$x0" 82 'IN CACHE'; fi
  big "$x0" 114 190k tokens; dots "$x0" 132 10 "$hue"; t "$x0" 166 12 500 "$MUTED" '19% of the 1M context · 810k free'
  vline $(( x1 - 12 )) 70 110; title "$x1" 82 SPEND; big "$x1" 114 '≈$16.61' 'this thread'; bars "$x1" 148; t "$x1" 166 12 500 "$MUTED" 'today $3.10 · week $16.61'
  vline $(( x2 - 12 )) 70 110
  if [ "$2" = 1 ]; then
    title "$x2" 82 'RE-CACHE NOW'
    printf '<text x="%s" y="114" font-weight="600" fill="%s"><tspan font-size="26">$1.52</tspan><tspan font-size="13" font-weight="500" fill="%s" dx="6">on Opus</tspan></text>' "$x2" "$COLD" "$MUTED"
    t "$x2" 140 12 500 "$TEXT" 'Sonnet $0.76 · Haiku $0.19'; t "$x2" 160 12 500 "$MUTED" 'warm costs $0.05/h'
  else
    title "$x2" 82 'KEEP WARM'; big "$x2" 114 '$0.05' /h
    printf '<text x="%s" y="140" font-size="12" font-weight="500" fill="%s">going cold costs <tspan fill="%s" font-weight="700">$1.52</tspan></text>' "$x2" "$MUTED" "$COLD"
    t "$x2" 160 12 500 "$MUTED" 'saved $4.20 · pings $0.31'
  fi
  vline $(( x3 - 12 )) 70 110; title "$x3" 82 'PACE VS RESET'
  local tx=$(( x3 + 28 )) tw=$(( cw - 28 ))
  t "$x3" 106 12 700 "$ORANGE" 7D; track $tx 98 $tw $tw "$ORANGE" $(( tx + tw * 40 / 100 ))
  printf '<text x="%s" y="122" font-size="12" font-weight="500" fill="%s"><tspan fill="%s">lasts ~8d 14h</tspan> · resets 3d 3h <tspan fill="%s" font-weight="700">✓</tspan></text>' $tx "$MUTED" "$TEXT" "$OK"
  t "$x3" 148 12 700 "$YELLOW" 5H; track $tx 140 $tw $(( tw * 62 / 100 )) "$DANGER" $(( tx + tw * 88 / 100 ))
  printf '<text x="%s" y="164" font-size="12" font-weight="500" fill="%s"><tspan fill="%s">runs out in ~2h 40m</tspan> · resets 3h 50m</text>' $tx "$MUTED" "$DANGER"
  if [ "$3" = 1 ]; then
    hline 18 196 $(( W - 36 ))
    local k; for k in "0|CACHE HIT|96%||of input read from cache" "1|PER TURN|\$0.38|avg|last \$2.11 · 5× avg" "2|CONTEXT RUNWAY|~40|turns|+6k tokens a turn" "3|SUBAGENTS|\$5.14||Explore \$3.90 · coder \$1.24"; do
      IFS='|' read -r i ti fig un cap <<<"$k"; local x; x=$(col "$i" $cw)
      [ "$i" -gt 0 ] && vline $(( x - 12 )) 206 100
      title "$x" 222 "$ti"; big "$x" 254 "$fig" "$un"
      if [ "$i" = 1 ]; then printf '<text x="%s" y="278" font-size="12" font-weight="500" fill="%s">last $2.11 · <tspan fill="%s">5× avg</tspan></text>' "$x" "$MUTED" "$DANGER"
      else t "$x" 278 12 500 "$MUTED" "$cap"; fi
    done
  fi
  echo '</svg>'
}

compact() { # cold
  local W=600 H=262 hue=$WARM word=WARM next='32m'; [ "$1" = 1 ] && hue=$COLD word=COLD next='$1.52 next'
  head_ $W $H
  t 18 34 13 700 "$ORANGE" '69% left'; t 90 34 13 700 "$TEXT" '≈$16.61'; chip 156 34 "$word" "$hue"; t $(( 156 + ${#word} * 9 + 22 )) 34 13 700 "$hue" "$next"
  btn 470 34 28 '−'; btn 504 34 36 K; btn 546 34 36 W; rect 18 50 $(( W - 36 )) 2 1 "$ORANGE"
  if [ "$1" = 1 ]; then title 18 82 RE-CACHE; else title 18 82 'IN CACHE'; fi
  big 18 114 190k tokens; dots 18 132 10 "$hue"; t 18 166 12 500 "$MUTED" '19% · 810k free'
  vline 300 70 110; title 312 82 SPEND; big 312 114 '≈$16.61' 'this thread'; bars 312 148; t 312 166 12 500 "$MUTED" 'today $3.10 · week $16.61'
  hline 18 186 $(( W - 36 ))
  if [ "$1" = 1 ]; then
    printf '<circle cx="22" cy="210" r="4" fill="%s"/>' "$COLD"; t 34 214 12.5 600 "$TEXT" 're-cache $1.52 on Opus · Sonnet $0.76 · Haiku $0.19'
  else
    printf '<circle cx="22" cy="210" r="4" fill="%s"/>' "$OK"; t 34 214 12.5 600 "$TEXT" 'keep warm $0.05/h · going cold $1.52 · saved $4.20'
  fi
  printf '<circle cx="22" cy="236" r="4" fill="%s"/>' "$DANGER"; t 34 240 12.5 600 "$DANGER" '5H runs out in ~2h 40m · resets 3h 50m'
  echo '</svg>'
}

for m in dark light; do
  palette $m
  wide 0 0 1 > "$out/card-wide-warm-$m.svg"
  wide 0 1 0 > "$out/card-wide-cold-$m.svg"
  compact 0 > "$out/card-compact-warm-$m.svg"
  compact 1 > "$out/card-compact-cold-$m.svg"
done
