# Mockup sources

The README's progress pictures and the hold picture are drawn by these bash scripts: `gallery.sh` builds
on the theme mockups `progress2.sh` … `progress9.sh` (each sources the one before it and writes a
`*helpers.sh` next to itself, which git ignores). They are mockups with example numbers, not the mod's own
drawing: redraw them when a theme changes.

    bash assets/src/gallery.sh assets

The band and card pictures (`band-*.svg`) come from `assets/mockups.sh`, which draws the card from the mod's own code.
