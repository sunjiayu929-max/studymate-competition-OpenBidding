# Motion recipes

## Principle

Motion should reveal the atmosphere already present in the image. It must not look pasted on.

Use slow, phase-shifted movement so something is gently alive without constant spectacle. Make an effect more legible by modestly increasing path length, scale, contrast, or density—not by making it frantic.

Persistent ambience must be visibly present often enough to be perceived during an ordinary visit. “Subtle” does not mean invisible.

## Timing ranges

- Initial UI entrance: 600 to 1200 ms
- Scene transition: 800 to 1400 ms
- Hover or press feedback: 160 to 300 ms
- Background breathing or drift: 20 to 45 seconds
- Ambient particle journey: 14 to 36 seconds
- Rare large motif such as birds or cloud passage: 24 to 50 seconds

Stagger loops so the ambience remains continuously visible. Avoid long periods in which every effect is simultaneously absent.

## Content-aware motifs

- Blossom or garden: breeze, petals, small birds, soft sunlight
- Lake or coast: water glints, slow cloud drift, distant birds, restrained ripples
- Autumn landscape: falling leaves, grasses, migrating birds, warm light shift
- Snow scene: sparse snow, chimney smoke, warm window glow, quiet bird movement
- City: light drift, shallow parallax, reflection movement, measured traffic traces
- Architecture: sunlight or shadow sweep and extremely subtle perspective drift
- Portrait: background light or fabric movement; never pass particles across the face
- Food or drink: steam, condensation, or a small specular glint
- Product: controlled highlight sweep or material response

Do not introduce aurora, fireworks, lens flares, weather, or animals that conflict with the source image or user request.

## Density and layering

- Use one dominant ambient motif and at most two supporting motifs.
- Keep foreground objects larger and rarer; background objects smaller and softer.
- Reduce density on mobile while preserving continuity.
- Stagger instances so at least one part of the primary motif is usually visible; avoid accidental 10–20 second empty gaps.
- Prefer several low-density, phase-shifted loops over one burst followed by silence.
- Keep motion layers pointer-transparent and out of the accessibility tree.
- Prefer transforms and opacity. Avoid layout-triggering animation.

## Visibility calibration

Inspect the animation in a real viewport for at least one full primary loop or 30 seconds, whichever is shorter.

- If viewers cannot notice the motif without being told where to look, increase path length, local contrast, on-screen duration, or staggered instances modestly.
- If the motif competes with the headline or subject, reduce density, size, contrast, or foreground overlap before slowing it further.
- Keep birds, leaves, petals, snow, steam, or light away from faces, essential copy, and primary controls.
- Test compact mobile separately; a motif that works on desktop may cross the entire reading area on a narrow screen.

## Control and accessibility

- Provide an ambience toggle when motion is persistent or thematically important.
- Honor prefers-reduced-motion by disabling decorative loops and shortening transitions.
- Preserve essential state changes without relying on motion alone.
- Pause or greatly reduce expensive animation when the page is hidden.

## Proof

Static screenshots prove composition but not motion quality. When motion is material, also observe the live page long enough to confirm continuity, pacing, stacking, toggle behavior, and reduced-motion behavior. Do not give `motion fit` a score of 2 from CSS source alone.
