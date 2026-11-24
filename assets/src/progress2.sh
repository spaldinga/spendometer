#!/usr/bin/env bash
# Six livelier progress-row mockups for spendometer. Each SVG: dark block then light block; each block a band running
# a task list (4 of 7, step 4 under way, two subagents) and a band working with no task list. Animated with SMIL.
set -u
out="$1"

palette() {
  if [ "$1" = dark ]; then
    BG='#2a2925' TEXT='#e8e2d2' MUTED='#8d8775' EMPTY='#4a463b' ORANGE='#ff6b1a' YELLOW='#f5a623'
    WARM='#cc6363' INK='#1c1a16' BTN='#3a3832' PAGE='#1f1e1b' SHINE='#ffffff'
  else
    BG='#f4f1ea' TEXT='#2b2a26' MUTED='#6b675c' EMPTY='#d9d4c7' ORANGE='#d4560c' YELLOW='#a8700f'
    WARM='#b04545' INK='#ffffff' BTN='#e6e2d8' PAGE='#ffffff' SHINE='#ffffff'
  fi
}
t() { printf '<text x="%s" y="%s" font-size="%s" font-weight="%s" fill="%s"%s>%s</text>' "$1" "$2" "$3" "$4" "$5" "${7:+ text-anchor=\"$7\"}" "$6"; }
rect() { printf '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s"/>' "$@"; }
chip() { local w=$(( ${#3} * 9 + 14 )); rect "$1" $(( $2 - 15 )) "$w" 21 6 "$4"; t $(( $1 + w / 2 )) "$2" 12 700 "$INK" "$3" middle; }
btn() { rect "$1" $(( $2 - 16 )) "$3" 24 6 "$BTN"; t $(( $1 + $3 / 2 )) "$2" 12 500 "$TEXT" "$4" middle; }
PULSE='<animate attributeName="opacity" values="1;.35;1" dur="1.4s" repeatCount="indefinite"/>'
N=7; D=3
IDN=0; nextid() { IDN=$((IDN+1)); id="c$IDN"; }

toprow() { local x=$1 y=$2 w=$3
  t $(( x+14 )) "$y" 13 700 "$TEXT" USAGE; t $(( x+72 )) "$y" 13 500 "$MUTED" 7D; t $(( x+96 )) "$y" 13 700 "$ORANGE" '69% left'
  t $(( x+168 )) "$y" 13 500 "$MUTED" 5H; t $(( x+192 )) "$y" 13 700 "$YELLOW" '90% left'
  t $(( x+266 )) "$y" 13 500 "$MUTED" COST; t $(( x+304 )) "$y" 13 700 "$TEXT" '≈$16.61'; chip $(( x+372 )) "$y" WARM "$WARM"; t $(( x+430 )) "$y" 13 700 "$WARM" '32m left'
  btn $(( x+w-224 )) "$y" 28 '+'; btn $(( x+w-190 )) "$y" 92 'Keep warm'; btn $(( x+w-92 )) "$y" 78 'Wrap up'; }
label() { printf '<text x="%s" y="%s" font-size="12.5" text-anchor="end" fill="%s"><tspan font-weight="700" fill="%s">4/7</tspan> · Run tests · 1m 12s   <tspan fill="%s">●●</tspan><tspan font-weight="700" fill="%s"> ×2</tspan> Explore 4 · sonnet-coder 12</text>' "$1" "$2" "$MUTED" "$TEXT" "$ORANGE" "$TEXT"; }
working() { printf '<text x="%s" y="%s" font-size="12.5" text-anchor="end" fill="%s"><tspan font-weight="700" fill="%s">working</tspan> · 4 steps · 1m 12s</text>' "$1" "$2" "$MUTED" "$TEXT"; }

# A sine-like wave path from x0 to x1 at y, amplitude a, half-wavelength h.
wavepath() { local x0=$1 y=$2 x1=$3 a=$4 h=$5; local d="M$1 $2 q$(( h/2 )) -$a $h 0" x=$(( $1 + h )); while [ $x -lt $x1 ]; do d="$d t$h 0"; x=$(( x + h )); done; echo "$d"; }

# ---- 1 Wave: the done part is a flowing orange wave, the rest a flat line with a dot per step ----
track_wave() { local x=$1 y=$2 w=$3 mode=$4 id; nextid
  if [ "$mode" = idle ]; then
    printf '<path d="%s" fill="none" stroke="%s" stroke-width="2"/>' "$(wavepath $x $y $(( x + w )) 4 8)" "$EMPTY"
    printf '<clipPath id="%s"><rect x="%s" y="%s" width="140" height="20"><animate attributeName="x" values="%s;%s;%s" dur="3s" repeatCount="indefinite"/></rect></clipPath>' "$id" "$x" $(( y - 10 )) "$x" $(( x + w - 140 )) "$x"
    printf '<g clip-path="url(#%s)"><path d="%s" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round"/></g>' "$id" "$(wavepath $x $y $(( x + w )) 4 8)" "$ORANGE"
    return; fi
  local fw=$(( w * (2 * D + 1) / (2 * N) ))
  rect $(( x + fw )) $(( y - 1 )) $(( w - fw )) 2 1 "$EMPTY"
  local i; for i in 4 5 6; do printf '<circle cx="%s" cy="%s" r="2.5" fill="%s"/>' $(( x + w * i / N + w / (2*N) )) "$y" "$EMPTY"; done
  printf '<clipPath id="%s"><rect x="%s" y="%s" width="%s" height="20"/></clipPath>' "$id" "$x" $(( y - 10 )) "$fw"
  printf '<g clip-path="url(#%s)"><path d="%s" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round"><animateTransform attributeName="transform" type="translate" values="-16 0;0 0" dur="0.8s" repeatCount="indefinite"/></path></g>' "$id" "$(wavepath $(( x - 16 )) $y $(( x + fw + 16 )) 4 8)" "$ORANGE"
  printf '<circle cx="%s" cy="%s" r="5" fill="%s">%s</circle>' $(( x + fw )) "$y" "$ORANGE" "$PULSE"; }

# ---- 2 Equalizer: done segments solid, the current one a little equalizer ----
track_eq() { local x=$1 y=$2 w=$3 mode=$4 i
  if [ "$mode" = idle ]; then
    local n=$(( w / 7 )); for i in $(seq 0 $(( n - 1 ))); do local h1=$(( 3 + (i * 7) % 11 )) h2=$(( 3 + (i * 5) % 13 ))
      printf '<rect x="%s" y="%s" width="4" height="%s" rx="1" fill="%s"><animate attributeName="height" values="%s;%s;%s" dur="0.9s" begin="-%s.%ss" repeatCount="indefinite"/><animate attributeName="y" values="%s;%s;%s" dur="0.9s" begin="-%s.%ss" repeatCount="indefinite"/></rect>' \
        $(( x + i * 7 )) $(( y - h1 / 2 )) $h1 "$( [ $(( i % 9 )) -lt 3 ] && echo "$ORANGE" || echo "$EMPTY")" $h1 $h2 $h1 0 $(( i % 9 )) $(( y - h1 / 2 )) $(( y - h2 / 2 )) $(( y - h1 / 2 )) 0 $(( i % 9 )); done
    return; fi
  local sw=$(( (w - 6 * 4) / 7 ))
  for i in 0 1 2 3 4 5 6; do local sx=$(( x + i * (sw + 4) ))
    if [ $i -lt $D ]; then rect $sx $(( y - 3 )) $sw 6 2 "$ORANGE"
    elif [ $i -eq $D ]; then local b; for b in $(seq 0 $(( sw / 6 - 1 ))); do local h1=$(( 3 + (b * 7) % 12 )) h2=$(( 4 + (b * 5) % 13 ))
        printf '<rect x="%s" y="%s" width="4" height="%s" rx="1" fill="%s"><animate attributeName="height" values="%s;%s;%s" dur="0.7s" begin="-0.%ss" repeatCount="indefinite"/><animate attributeName="y" values="%s;%s;%s" dur="0.7s" begin="-0.%ss" repeatCount="indefinite"/></rect>' \
          $(( sx + b * 6 )) $(( y - h1 / 2 )) $h1 "$ORANGE" $h1 $h2 $h1 $(( b % 7 )) $(( y - h1 / 2 )) $(( y - h2 / 2 )) $(( y - h1 / 2 )) $(( b % 7 )); done
    else rect $sx $(( y - 3 )) $sw 6 2 "$EMPTY"; fi; done; }

# ---- 3 Shimmer: segments, a light passing over the done ones, the current one filling ----
track_shine() { local x=$1 y=$2 w=$3 mode=$4 i id; nextid; local sw=$(( (w - 6 * 4) / 7 ))
  local clip="" ; for i in 0 1 2 3 4 5 6; do rect $(( x + i * (sw + 4) )) $(( y - 3 )) $sw 6 2 "$EMPTY"; done
  if [ "$mode" = idle ]; then
    for i in 0 1 2 3 4 5 6; do clip="$clip<rect x=\"$(( x + i * (sw + 4) ))\" y=\"$(( y - 3 ))\" width=\"$sw\" height=\"6\" rx=\"2\"/>"; done
    printf '<clipPath id="%s">%s</clipPath><g clip-path="url(#%s)"><rect x="%s" y="%s" width="160" height="6" fill="%s"><animate attributeName="x" values="%s;%s" dur="1.8s" repeatCount="indefinite"/></rect></g>' "$id" "$clip" "$id" $(( x - 160 )) $(( y - 3 )) "$ORANGE" $(( x - 160 )) $(( x + w ))
    return; fi
  for i in 0 1 2; do rect $(( x + i * (sw + 4) )) $(( y - 3 )) $sw 6 2 "$ORANGE"; clip="$clip<rect x=\"$(( x + i * (sw + 4) ))\" y=\"$(( y - 3 ))\" width=\"$sw\" height=\"6\" rx=\"2\"/>"; done
  printf '<clipPath id="%s">%s</clipPath><g clip-path="url(#%s)"><rect x="%s" y="%s" width="40" height="6" fill="%s" opacity=".55"><animate attributeName="x" values="%s;%s" dur="1.6s" repeatCount="indefinite"/></rect></g>' "$id" "$clip" "$id" $(( x - 40 )) $(( y - 3 )) "$SHINE" $(( x - 40 )) $(( x + 3 * (sw + 4) ))
  printf '<rect x="%s" y="%s" width="0" height="6" rx="2" fill="%s"><animate attributeName="width" values="0;%s;%s" keyTimes="0;.85;1" dur="1.6s" repeatCount="indefinite"/></rect>' $(( x + 3 * (sw + 4) )) $(( y - 3 )) "$ORANGE" $sw $sw; }

# ---- 4 Ripple dots: the IN CACHE dot grid, a ripple running through the done dots ----
track_ripple() { local x=$1 y=$2 w=$3 mode=$4 c r; local cols=$(( w / 9 )); local done=$(( cols * D / N )) cur=$(( cols * (D + 1) / N ))
  for c in $(seq 0 $(( cols - 1 ))); do for r in 0 1; do local cx=$(( x + 3 + c * 9 )) cy=$(( y - 4 + r * 8 )) b; b=$(( c * 4 ))
    if [ "$mode" = idle ]; then
      printf '<circle cx="%s" cy="%s" r="2.8" fill="%s"><animate attributeName="opacity" values=".15;1;.15" dur="1.6s" begin="%s.%02ds" repeatCount="indefinite"/></circle>' $cx $cy "$ORANGE" $(( b / 100 )) $(( b % 100 ))
    elif [ $c -lt $done ]; then
      printf '<circle cx="%s" cy="%s" r="2.8" fill="%s"><animate attributeName="opacity" values="1;.35;1;1" keyTimes="0;.15;.3;1" dur="2s" begin="%s.%02ds" repeatCount="indefinite"/></circle>' $cx $cy "$ORANGE" $(( b / 100 )) $(( b % 100 ))
    elif [ $c -lt $cur ]; then printf '<circle cx="%s" cy="%s" r="2.8" fill="%s">%s</circle>' $cx $cy "$ORANGE" "$PULSE"
    else printf '<circle cx="%s" cy="%s" r="2.8" fill="%s"/>' $cx $cy "$EMPTY"; fi; done; done; }

# ---- 5 Stepper: nodes on a line, ticks on the done ones, a sonar ring on the current one ----
track_stepper() { local x=$1 y=$2 w=$3 mode=$4 i
  rect "$x" $(( y - 1 )) "$w" 2 1 "$EMPTY"
  if [ "$mode" = idle ]; then
    printf '<circle cx="%s" cy="%s" r="5" fill="%s"><animate attributeName="cx" values="%s;%s;%s" dur="3s" repeatCount="indefinite"/></circle>' "$x" "$y" "$ORANGE" $(( x + 6 )) $(( x + w - 6 )) $(( x + 6 ))
    printf '<circle cx="%s" cy="%s" r="5" fill="none" stroke="%s" stroke-width="1.5"><animate attributeName="cx" values="%s;%s;%s" dur="3s" repeatCount="indefinite"/><animate attributeName="r" values="5;13" dur="1.2s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="1.2s" repeatCount="indefinite"/></circle>' "$x" "$y" "$ORANGE" $(( x + 6 )) $(( x + w - 6 )) $(( x + 6 ))
    return; fi
  local step=$(( (w - 12) / (N - 1) ))
  rect "$x" $(( y - 1 )) $(( D * step + 6 )) 2 1 "$ORANGE"
  for i in 0 1 2 3 4 5 6; do local cx=$(( x + 6 + i * step ))
    if [ $i -lt $D ]; then printf '<circle cx="%s" cy="%s" r="6" fill="%s"/><path d="M%s %s l2.5 2.5 l4.5 -5" fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' $cx "$y" "$ORANGE" $(( cx - 3 )) "$y" "$INK"
    elif [ $i -eq $D ]; then printf '<circle cx="%s" cy="%s" r="6" fill="%s" stroke="%s" stroke-width="2"/><circle cx="%s" cy="%s" r="2.5" fill="%s"/><circle cx="%s" cy="%s" r="6" fill="none" stroke="%s" stroke-width="1.5"><animate attributeName="r" values="6;15" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="1.4s" repeatCount="indefinite"/></circle>' $cx "$y" "$BG" "$ORANGE" $cx "$y" "$ORANGE" $cx "$y" "$ORANGE"
    else printf '<circle cx="%s" cy="%s" r="5" fill="%s" stroke="%s" stroke-width="2"/>' $cx "$y" "$BG" "$EMPTY"; fi; done; }

# ---- 6 Liquid: a tube filling like liquid, its surface wobbling at the head ----
track_liquid() { local x=$1 y=$2 w=$3 mode=$4 id; nextid
  printf '<clipPath id="%s"><rect x="%s" y="%s" width="%s" height="10" rx="5"/></clipPath>' "$id" "$x" $(( y - 5 )) "$w"
  rect "$x" $(( y - 5 )) "$w" 10 5 "$EMPTY"
  local fw=$(( w * (2 * D + 1) / (2 * N) ))
  local vals="$fw;$fw"; [ "$mode" = idle ] && vals="$(( w / 5 ));$(( w * 3 / 5 ));$(( w / 5 ))"
  local dur=1s; [ "$mode" = idle ] && dur=3s
  printf '<g clip-path="url(#%s)"><rect x="%s" y="%s" width="%s" height="10" fill="%s"><animate attributeName="width" values="%s" dur="%s" repeatCount="indefinite"/></rect>' "$id" "$x" $(( y - 5 )) "${vals%%;*}" "$ORANGE" "$vals" "$dur"
  printf '<g><animateTransform attributeName="transform" type="translate" values="%s 0" dur="%s" repeatCount="indefinite" additive="replace"/>' "$( echo "$vals" | tr ';' '\n' | while read -r v; do printf '%s 0;' "$v"; done | sed 's/ 0;$//' )" "$dur"
  printf '<path d="M%s %s q4 -3 0 -5 q-4 -3 0 -5 L%s %s z" fill="%s"><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur="0.7s" repeatCount="indefinite" additive="sum"/></path></g>' "$x" $(( y + 5 )) "$x" $(( y + 5 )) "$ORANGE"
  local i; for i in 0 1 2; do printf '<circle cx="%s" cy="%s" r="1.3" fill="%s" opacity=".7"><animate attributeName="cx" values="%s;%s" dur="%s.%ss" repeatCount="indefinite"/></circle>' $(( x + 10 )) $(( y - 2 + i * 2 )) "$SHINE" $(( x + 10 + i * 30 )) $(( x + fw - 10 )) $(( 1 + i )) $(( i * 3 )); done
  echo '</g>'; }

band() { # proposal x y w mode
  local x=$2 y=$3 w=$4 ry=$(( $3 + 58 ))
  rect "$x" "$y" "$w" 78 12 "$BG"; toprow "$x" $(( y + 28 )) "$w"
  if [ "$5" = idle ]; then "track_$1" $(( x + 14 )) $ry $(( w - 28 - 200 - 16 )) idle; working $(( x + w - 14 )) $(( ry + 4 ))
  else "track_$1" $(( x + 14 )) $ry $(( w - 28 - 430 - 16 )) run; label $(( x + w - 14 )) $(( ry + 4 )); fi; }

draw() { local W=1200 H=380 m y=0
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="0 0 %s %s" font-family="system-ui,-apple-system,Segoe UI,sans-serif">' $W $H $W $H
  for m in dark light; do palette $m
    rect 0 $y $W 190 0 "$PAGE"; t 18 $(( y + 20 )) 12 700 "$MUTED" "$2 · $m"
    band "$1" 18 $(( y + 28 )) 1164 run; band "$1" 18 $(( y + 110 )) 1164 idle; y=$(( y + 190 )); done
  echo '</svg>'; }

draw wave    '1 · Wave: the done part flows as a wave, true to the name' > "$out/cool-1-wave.svg"
draw eq      '2 · Equalizer: the current step bounces like a level meter' > "$out/cool-2-equalizer.svg"
draw shine   '3 · Shimmer: a light runs over the done steps, the current one fills' > "$out/cool-3-shimmer.svg"
draw ripple  '4 · Ripple dots: the IN CACHE dots, a ripple through the done ones' > "$out/cool-4-ripple.svg"
draw stepper '5 · Stepper: ticked nodes, a sonar ring on the current one' > "$out/cool-5-stepper.svg"
draw liquid  '6 · Liquid: a tube filling, its surface wobbling' > "$out/cool-6-liquid.svg"
