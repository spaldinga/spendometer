#!/usr/bin/env bash
# Progress mixes, on the helpers of progress2.sh.
set -u
out="$1"
here="$(dirname "$0")"
sed '/^draw wave/,$d' "$here/progress2.sh" > "$here/helpers.sh"
. "$here/helpers.sh"
palette_orig=$(declare -f palette)
palette() { palette_mode=$1; eval "${palette_orig/palette ()/palette_inner ()}"; palette_inner "$1"
  if [ "$1" = dark ]; then HEAT=('#f5a623' '#f88a1f' '#ff6b1a'); else HEAT=('#a8700f' '#bf6410' '#d4560c'); fi; }

# One bouncing bar centred on y: x y h1 h2 dur phase(0-9) colour
eqbar() { printf '<rect x="%s" y="%s" width="4" height="%s" rx="1" fill="%s"><animate attributeName="height" values="%s;%s;%s" dur="%s" begin="-0.%ss" repeatCount="indefinite"/><animate attributeName="y" values="%s;%s;%s" dur="%s" begin="-0.%ss" repeatCount="indefinite"/></rect>' \
  "$1" $(( $2 - $3 / 2 )) "$3" "$7" "$3" "$4" "$3" "$5" "$6" $(( $2 - $3 / 2 )) $(( $2 - $4 / 2 )) $(( $2 - $3 / 2 )) "$5" "$6"; }
# A small equalizer of n bars starting at x
eq() { local x=$1 y=$2 n=$3 col=$4 b; for b in $(seq 0 $(( n - 1 ))); do eqbar $(( x + b * 6 )) "$y" $(( 4 + (b * 7) % 9 )) $(( 8 + (b * 5) % 11 )) 0.7s $(( (b * 3) % 10 )) "$col"; done; }

# ---- A Equalizer + heartbeat: a trace with a beat per done step; the current step beats as a live equalizer ----
beatpath() { # x y w from to : trace over steps from..to, a beat in each
  local x=$1 y=$2 w=$3 i d step=$(( $3 / N )); d="M$(( x + $4 * step )) $y"
  for i in $(seq "$4" "$5"); do local cx=$(( x + i * step + step / 2 )); d="$d L$(( cx - 10 )) $y l3 -3 l3 9 l4 -14 l3 10 l3 -2 L$(( x + (i + 1) * step )) $y"; done; echo "$d"; }
track_eqheart() { local x=$1 y=$2 w=$3 mode=$4 step=$(( $3 / N ))
  if [ "$mode" = idle ]; then
    printf '<path d="%s" fill="none" stroke="%s" stroke-width="1.8" stroke-linejoin="round"/>' "$(beatpath $x $y $w 0 6)" "$EMPTY"
    printf '<g><animateTransform attributeName="transform" type="translate" values="0 0;%s 0;0 0" dur="4s" repeatCount="indefinite"/>' $(( w - 40 )); eq "$x" "$y" 7 "$ORANGE"; echo '</g>'; return; fi
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="2.2" stroke-linejoin="round"/>' "$(beatpath $x $y $w 0 $(( D - 1 )))" "$ORANGE"
  rect $(( x + D * step )) $(( y - 1 )) "$step" 2 1 "$EMPTY"
  printf '<path d="%s" fill="none" stroke="%s" stroke-width="1.8" stroke-linejoin="round"/>' "$(beatpath $x $y $w $(( D + 1 )) 6)" "$EMPTY"
  eq $(( x + D * step + step / 2 - 18 )) "$y" 7 "$ORANGE"; }

# ---- B Equalizer + heat: done segments warm from yellow to orange; the current one an equalizer in the heat colours ----
track_eqheat() { local x=$1 y=$2 w=$3 mode=$4 i b
  if [ "$mode" = idle ]; then local n=$(( w / 12 ))
    for b in $(seq 0 $(( n - 1 ))); do eqbar $(( x + b * 12 )) "$y" $(( 3 + (b * 7) % 8 )) $(( 6 + (b * 5) % 12 )) 0.9s $(( (b * 3) % 10 )) "${HEAT[$(( b * 3 / n ))]}"; done; return; fi
  local sw=$(( (w - 6 * 4) / 7 ))
  for i in 0 1 2 3 4 5 6; do local sx=$(( x + i * (sw + 4) ))
    if [ $i -lt $D ]; then rect $sx $(( y - 3 )) $sw 6 2 "${HEAT[$i]}"
    elif [ $i -eq $D ]; then for b in $(seq 0 $(( sw / 6 - 1 ))); do eqbar $(( sx + b * 6 )) "$y" $(( 4 + (b * 7) % 9 )) $(( 8 + (b * 5) % 11 )) 0.7s $(( (b * 3) % 10 )) "${HEAT[$(( b % 3 ))]}"; done
    else rect $sx $(( y - 3 )) $sw 6 2 "$EMPTY"; fi; done; }

# ---- C Ants + ripple: two rows of IN CACHE dots; the done dots march toward the current column ----
dotline() { # x1 x2 y colour anim(0/1) dir
  printf '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="5.6" stroke-linecap="round" stroke-dasharray="0 9"%s' "$1" "$3" "$2" "$3" "$4" "$( [ "$5" = 1 ] && echo '>' || echo '/>')"
  [ "$5" = 1 ] && printf '<animate attributeName="stroke-dashoffset" values="%s" dur="0.6s" repeatCount="indefinite"/></line>' "$6"; }
track_antripple() { local x=$1 y=$2 w=$3 mode=$4
  if [ "$mode" = idle ]; then dotline "$x" $(( x + w )) $(( y - 4 )) "$ORANGE" 1 '18;0'; dotline "$x" $(( x + w )) $(( y + 4 )) "$ORANGE" 1 '0;18'; return; fi
  local fw=$(( w * D / N / 9 * 9 ))
  dotline "$x" $(( x + fw )) $(( y - 4 )) "$ORANGE" 1 '18;0'; dotline "$x" $(( x + fw )) $(( y + 4 )) "$ORANGE" 1 '18;0'
  local c=$(( x + fw + 9 ))
  printf '<g>%s<circle cx="%s" cy="%s" r="2.8" fill="%s"/><circle cx="%s" cy="%s" r="2.8" fill="%s"/><circle cx="%s" cy="%s" r="2.8" fill="%s"/><circle cx="%s" cy="%s" r="2.8" fill="%s"/></g>' "$PULSE" $c $(( y - 4 )) "$ORANGE" $c $(( y + 4 )) "$ORANGE" $(( c + 9 )) $(( y - 4 )) "$ORANGE" $(( c + 9 )) $(( y + 4 )) "$ORANGE"
  dotline $(( c + 18 )) $(( x + w )) $(( y - 4 )) "$EMPTY" 0; dotline $(( c + 18 )) $(( x + w )) $(( y + 4 )) "$EMPTY" 0; }

# ---- D Wave + breadcrumbs: the step names, with a wave flowing under the done ones ----
track_wavecrumbs() { local x=$1 y=$2 w=$3 mode=$4 id; nextid
  if [ "$mode" = idle ]; then
    t "$x" $(( y - 1 )) 12 500 "$MUTED" 'no task list'
    printf '<path d="%s" fill="none" stroke="%s" stroke-width="1.6"/>' "$(wavepath $x $(( y + 8 )) $(( x + w )) 2 6)" "$EMPTY"
    printf '<clipPath id="%s"><rect x="%s" y="%s" width="120" height="12"><animate attributeName="x" values="%s;%s;%s" dur="3s" repeatCount="indefinite"/></rect></clipPath><g clip-path="url(#%s)"><path d="%s" fill="none" stroke="%s" stroke-width="2"/></g>' "$id" "$x" $(( y + 2 )) "$x" $(( x + w - 120 )) "$x" "$id" "$(wavepath $x $(( y + 8 )) $(( x + w )) 2 6)" "$ORANGE"
    return; fi
  local names=("Read code" "Plan" "Write code" "Run tests" "Review" "Commit" "Push") cx=$x i doneEnd=$x curEnd=$x
  for i in 0 1 2 3 4 5 6; do local s="${names[$i]}" col=$MUTED wt=500
    if [ $i -lt $D ]; then s="✓ $s"; col=$TEXT; elif [ $i -eq $D ]; then s="● $s"; col=$ORANGE; wt=700; fi
    local tw=$(( (${#s} + 1) * 66 / 10 ))
    if [ $i -eq $D ]; then printf '<text x="%s" y="%s" font-size="12" font-weight="700" fill="%s">%s%s</text>' $cx $(( y - 1 )) "$col" "$s" "$PULSE"; else t $cx $(( y - 1 )) 12 $wt "$col" "$s"; fi
    cx=$(( cx + tw )); [ $i -lt $D ] && doneEnd=$cx; [ $i -eq $D ] && curEnd=$cx
    [ $i -lt 6 ] && t $cx $(( y - 1 )) 12 500 "$MUTED" '›' && cx=$(( cx + 16 ))
  done
  printf '<clipPath id="%s"><rect x="%s" y="%s" width="%s" height="12"/></clipPath><g clip-path="url(#%s)"><path d="%s" fill="none" stroke="%s" stroke-width="2"><animateTransform attributeName="transform" type="translate" values="-12 0;0 0" dur="0.8s" repeatCount="indefinite"/></path></g>' "$id" "$x" $(( y + 2 )) $(( curEnd - x )) "$id" "$(wavepath $(( x - 12 )) $(( y + 8 )) $(( curEnd + 12 )) 2 6)" "$ORANGE"
  printf '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="2" stroke-dasharray="2 4"/>' $(( curEnd + 4 )) $(( y + 8 )) $(( cx )) $(( y + 8 )) "$EMPTY"; }

# ---- E Stepper + ring: each step a ring; done ones full with a tick, the current one filling ----
track_stepring() { local x=$1 y=$2 w=$3 mode=$4 i step=$(( ($3 - 16) / (N - 1) ))
  for i in 0 1 2 3 4 5; do local c=$EMPTY; [ "$mode" = run ] && [ $i -lt $D ] && c=$ORANGE; rect $(( x + 8 + i * step + 9 )) $(( y - 1 )) $(( step - 18 )) 2 1 "$c"; done
  for i in 0 1 2 3 4 5 6; do local cx=$(( x + 8 + i * step ))
    printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5"/>' $cx "$y" "$EMPTY"
    [ "$mode" = idle ] && continue
    if [ $i -lt $D ]; then printf '<circle cx="%s" cy="%s" r="7" fill="%s"/><path d="M%s %s l2.5 2.5 l4.5 -5" fill="none" stroke="%s" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' $cx "$y" "$ORANGE" $(( cx - 3 )) "$y" "$INK"
    elif [ $i -eq $D ]; then printf '<circle cx="%s" cy="%s" r="7" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="0 44" transform="rotate(-90 %s %s)"><animate attributeName="stroke-dasharray" values="0 44;44 0" dur="1.8s" repeatCount="indefinite"/></circle>' $cx "$y" "$ORANGE" $cx "$y"; fi; done
  if [ "$mode" = idle ]; then local vals="" k; for k in 0 1 2 3 4 5 6; do vals="$vals$(( x + 8 + k * step )) $y;"; done
    printf '<g><animateTransform attributeName="transform" type="translate" values="%s" calcMode="discrete" dur="4.2s" repeatCount="indefinite"/><circle cx="0" cy="0" r="7" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="12 32"><animateTransform attributeName="transform" type="rotate" values="0;360" dur="0.6s" repeatCount="indefinite"/></circle></g>' "${vals%;}" "$ORANGE"; fi; }

# ---- F Comet + stepper: nodes on a line; a comet keeps flying from the start to the current node ----
track_cometstep() { local x=$1 y=$2 w=$3 mode=$4 i step=$(( ($3 - 12) / (N - 1) ))
  rect "$x" $(( y - 1 )) "$w" 2 1 "$EMPTY"
  local to=$(( D * step )) vals dur=1.4s; [ "$mode" = run ] && rect "$x" $(( y - 1 )) $(( to + 6 )) 2 1 "$ORANGE"
  for i in 0 1 2 3 4 5 6; do local cx=$(( x + 6 + i * step ))
    if [ "$mode" = run ] && [ $i -lt $D ]; then printf '<circle cx="%s" cy="%s" r="5" fill="%s"/>' $cx "$y" "$ORANGE"
    elif [ "$mode" = run ] && [ $i -eq $D ]; then printf '<circle cx="%s" cy="%s" r="5" fill="%s" stroke="%s" stroke-width="2"/><circle cx="%s" cy="%s" r="5" fill="none" stroke="%s" stroke-width="1.5"><animate attributeName="r" values="5;13" dur="1.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="1.4s" repeatCount="indefinite"/></circle>' $cx "$y" "$BG" "$ORANGE" $cx "$y" "$ORANGE"
    else printf '<circle cx="%s" cy="%s" r="4" fill="%s" stroke="%s" stroke-width="2"/>' $cx "$y" "$BG" "$EMPTY"; fi; done
  if [ "$mode" = idle ]; then vals="0 0;$(( w - 12 )) 0;0 0"; dur=3s; else vals="0 0;$to 0"; fi
  printf '<g><animateTransform attributeName="transform" type="translate" values="%s" dur="%s" repeatCount="indefinite"/>' "$vals" "$dur"
  for i in 0 1 2 3 4 5; do printf '<circle cx="%s" cy="%s" r="%s" fill="%s" opacity="%s"/>' $(( x + 6 - i * 7 )) "$y" "$(( 4 - i / 2 ))" "$ORANGE" "$(echo "1 .7 .5 .35 .2 .1" | cut -d' ' -f$((i+1)))"; done; echo '</g>'; }

# ---- G Wave equalizer: equalizer bars whose heights roll as a wave; done ones orange, the rest low and grey ----
track_waveeq() { local x=$1 y=$2 w=$3 mode=$4 n=$(( $3 / 8 )) b
  local doneN=$(( n * D / N )) curN=$(( n * (D + 1) / N ))
  for b in $(seq 0 $(( n - 1 ))); do local bx=$(( x + b * 8 )) ph=$(( (b * 8) % 100 ))
    if [ "$mode" = idle ]; then
      printf '<rect x="%s" y="%s" width="4" height="4" rx="1" fill="%s"><animate attributeName="height" values="3;14;3" dur="1.4s" begin="-%s.%02ds" repeatCount="indefinite"/><animate attributeName="y" values="%s;%s;%s" dur="1.4s" begin="-%s.%02ds" repeatCount="indefinite"/></rect>' $bx $(( y - 2 )) "$ORANGE" 0 $ph $(( y - 1 )) $(( y - 7 )) $(( y - 1 )) 0 $ph
    elif [ $b -lt $doneN ]; then
      printf '<rect x="%s" y="%s" width="4" height="4" rx="1" fill="%s"><animate attributeName="height" values="5;13;5" dur="1.4s" begin="-%s.%02ds" repeatCount="indefinite"/><animate attributeName="y" values="%s;%s;%s" dur="1.4s" begin="-%s.%02ds" repeatCount="indefinite"/></rect>' $bx $(( y - 2 )) "$ORANGE" 0 $ph $(( y - 2 )) $(( y - 6 )) $(( y - 2 )) 0 $ph
    elif [ $b -lt $curN ]; then eqbar $bx "$y" 4 16 0.5s $(( b % 10 )) "$ORANGE"
    else rect $bx $(( y - 1 )) 4 3 1 "$EMPTY"; fi; done; }

draw eqheart    'A · Equalizer + heartbeat' > "$out/mix-a-eq-heartbeat.svg"
draw eqheat     'B · Equalizer + heat' > "$out/mix-b-eq-heat.svg"
draw antripple  'C · Ants + ripple dots' > "$out/mix-c-ants-ripple.svg"
draw wavecrumbs 'D · Wave + breadcrumbs' > "$out/mix-d-wave-breadcrumbs.svg"
draw stepring   'E · Stepper + ring' > "$out/mix-e-stepper-ring.svg"
draw cometstep  'F · Comet + stepper (extra)' > "$out/mix-f-comet-stepper.svg"
draw waveeq     'G · Wave equalizer (extra)' > "$out/mix-g-wave-equalizer.svg"
