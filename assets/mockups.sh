#!/usr/bin/env bash
# Writes the README images of the band into $1, one dark and one light SVG per tab and width:
#   bash assets/mockups.sh assets
# band-<tab>-<width>-<theme>.svg for the tabs cost and capacity, at 1200 (wide) and 600 (narrow) px.
#
# The drawing is assets/mockups.gen.ts: the card, pies, pace track, Robo and chip come from the mod's own SVG code,
# the row's words and buttons are drawn there with example numbers. The test kit is the only way to run the mod's
# TypeScript here and it cannot write files, so this copies the mod into a scratch folder with the generator as its
# one test, runs it, and writes each `@@mockup <file> <svg>` line it prints. The cards' alt text is printed too
# (`@@alt`), for the README.
set -eu
out="$(cd "$1" && pwd)"
repo="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cp -r "$repo/.claude-plugin" "$repo/hooks" "$repo/types" "$tmp/"
mkdir "$tmp/tests"
cp "$repo/assets/mockups.gen.ts" "$tmp/tests/mockups.test.ts"

# BUN_INSPECT set in the shell makes the test kit fail to start (see AGENTS.md).
ok=1
BUN_INSPECT= claude plugin test "$tmp" > "$tmp/run.txt" 2>&1 || ok=0

n=0
while IFS= read -r line; do
  case "$line" in
    '@@mockup '*)
      rest="${line#@@mockup }"
      printf '%s\n' "${rest#* }" > "$out/${rest%% *}"
      n=$((n + 1)) ;;
    '@@alt '*) printf '%s\n' "${line#@@alt }" ;;
  esac
done < "$tmp/run.txt"
echo "wrote $n images to $out" >&2
if [ "$ok" = 0 ]; then grep -v '^@@' "$tmp/run.txt" >&2; exit 1; fi
