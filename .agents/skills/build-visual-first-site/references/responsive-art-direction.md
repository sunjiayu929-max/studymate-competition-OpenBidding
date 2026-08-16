# Responsive art direction

Mobile is a new composition, not a scaled desktop.

## Per-image decisions

For each hero or chapter image:

1. Mark the desktop focal point and text-safe region.
2. Mark the mobile focal point independently.
3. Decide whether object-position is sufficient.
4. Use a dedicated crop or picture source when one crop cannot protect the subject.
5. Reposition copy, controls, and ambient motifs around the mobile crop.

Do not share one global object-position across visually different images.

## Mobile composition

- Use 100dvh with sensible svh fallback for immersive pages.
- Respect top and bottom safe-area insets.
- Simplify navigation rather than compressing desktop links.
- Keep critical content clear of browser chrome and bottom controls.
- Keep touch targets at least 44 by 44 CSS pixels when practical.
- Use a consistent vector arrow. Give icon-only controls an accessible name.
- Limit headline width and set deliberate line breaks when automatic wrapping harms the composition.
- Reduce visual density before reducing readability.
- Preserve a recognizable section or season selector without letting it dominate the image.

## Readability

- Check contrast over the actual crop, not a color token in isolation.
- Prefer image-aware radial or linear readability light over a global dark overlay.
- Use text shadow only as a subtle optical correction.
- When no safe region exists, create a separate text field or framed layout.

## Test matrix

Inspect at least:

- 1920 by 1080 desktop
- 1440 by 900 desktop
- 430 by 932 mobile
- 390 by 844 mobile
- 360 by 800 compact mobile
- 844 by 390 mobile landscape
- one short-height viewport

Check horizontal overflow, safe areas, headline wrapping, crop, subject occlusion, CTA reachability, selector density, and motion placement at every representative size.

## Performance

- Preserve original source files and serve optimized derivatives when practical.
- Use modern formats and responsive sizes for large imagery.
- Avoid loading every full-resolution scene eagerly.
- Preload only the initial critical hero.
- Keep decorative animation lightweight and GPU-friendly.

