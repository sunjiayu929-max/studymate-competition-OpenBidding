# Design principles

## Core belief

The photograph supplies emotion. Typography supplies hierarchy. Interaction supplies direction. Motion supplies breath.

The interface must frame the image, not compete with it.

## Observable rules for “high-end and simple”

- Give every viewport one obvious focal point.
- Give every section one primary action.
- Establish hierarchy through size, weight, spacing, and placement before adding decoration.
- Use a consistent grid and repeated alignment lines.
- Keep generous negative space around important copy and controls.
- Use at most two type families and only the weights that carry a clear role.
- Derive the accent palette from the imagery; keep neutral UI colors quiet.
- Use a single icon family with consistent stroke weight.
- Make surfaces necessary, sparse, and visually light.
- Prefer natural image color. Apply overlays only where they solve readability.
- Write short, specific copy that belongs to the photograph and purpose.
- Remove any element whose deletion does not reduce clarity, identity, or usability.

## Image hierarchy

- Protect faces, landmarks, architecture, horizon lines, light sources, and intentional negative space.
- Place text in a genuine safe region. Do not solve every collision with a dark rectangle.
- Use full bleed only when resolution, composition, and crop tolerance support it.
- When an image is busy, choose a split composition, editorial frame, or dedicated text field.
- Rank multiple images as hero, chapter, supporting, and detail. Do not give every image equal prominence.

## Interaction discipline

- Keep navigation short and predictable.
- Use quiet controls with clear labels or accessible names.
- Make hover and pressed states subtle but perceptible.
- Keep touch targets at least 44 by 44 CSS pixels when practical.
- Use familiar vector arrows. Do not use emoji, boxed glyphs, or mismatched icon sets.

## Anti-patterns

Reject:

- giant typography covering the subject without an intentional editorial reason
- glassmorphism on every element
- unrelated gradients, neon glows, and heavy shadows
- stacked cards used only to make the page feel “designed”
- centered layouts applied to every image regardless of composition
- excessive pills, badges, and floating controls
- generic AI slogans disconnected from the content
- random particle effects
- fast bouncing, spinning, or attention-seeking motion
- a desktop layout merely squeezed onto mobile
- copying the recognizable visual skin of a named company

