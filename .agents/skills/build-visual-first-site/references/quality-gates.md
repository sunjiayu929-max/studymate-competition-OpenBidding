# Quality gates

Build success is necessary, not sufficient. Completion requires visible evidence.

## Required evidence

Record:

- screenshot or live visual inspection at representative desktop and mobile viewports;
- the exact viewports inspected;
- build, lint, and test commands actually run;
- reduced-motion, keyboard, touch, and short-height checks when relevant;
- any tool limitation or unverified behavior.

Do not award a visual score from source code alone. If screenshots or live rendering cannot be inspected, mark visual categories `not verified`, report the limitation, and do not claim the full quality gate passed.

## Gate 1: Assets

- Images open correctly and their roles are assigned after visual inspection.
- Hero treatment matches its resolution, crop tolerance, and composition.
- Desktop and mobile focal points are known independently.
- User originals remain untouched.
- Generation, editing, privacy, source, and publishing boundaries are understood.

## Gate 2: Direction

- One primary style profile has evidence and a score.
- The image remains the protagonist.
- Typography, palette, layout, copy, and motion support the same purpose.
- The primary action is clear without becoming visual clutter.

## Gate 3: Desktop and mobile proof

- The focal subject, face, landmark, product, horizon, and key light remain unobstructed.
- Headline wrapping and text placement are intentional.
- Readability treatment preserves image depth.
- Controls are quiet, consistent, reachable, and correctly placed.
- Mobile is recomposed rather than reduced.

## Gate 4: Implementation

- No horizontal overflow or clipped interactive content.
- Keyboard, touch, and focus behavior work.
- Icon-only controls have accessible names.
- Decorative motion is pointer-transparent and hidden from assistive technology.
- Reduced motion is honored.
- Images use responsible formats, dimensions, loading, and responsive sizing.
- Relevant build, lint, and tests pass or remaining failures are explained accurately.

## Calibrated visual score

Score each category 0, 1, or 2 using these shared anchors:

- **0 — blocker:** visible failure, broken behavior, contradiction with the chosen direction, or no usable evidence.
- **1 — acceptable:** functional and coherent, but with a visible compromise, weak edge case, or incomplete polish.
- **2 — intentional:** polished at all inspected viewports, supported by evidence, and no material caveat.

Apply the anchors to:

1. **Subject protection** — 0 if important content is covered or cropped badly; 1 if safe with a compromise; 2 if every crop strengthens the composition.
2. **Information hierarchy** — 0 if attention is confused; 1 if understandable; 2 if focal order is immediate and elegant.
3. **Readability** — 0 if text fails over a real crop; 1 if readable through a heavy treatment or at some sizes; 2 if consistently legible while preserving the image.
4. **Style coherence** — 0 if unrelated visual languages mix; 1 if mostly coherent with generic residue; 2 if every major choice follows the selected direction.
5. **Motion fit** — 0 if distracting, conflicting, inaccessible, or broken; 1 if safe but forgettable or uneven; 2 if visibly atmospheric, continuous, lightweight, controllable when needed, and image-matched.
6. **Responsive composition** — 0 if clipped, obstructed, or horizontally scrolling; 1 if usable but compressed; 2 if desktop, mobile, compact-height, and landscape each feel deliberately composed.
7. **Interaction and accessibility** — 0 if a primary action or input mode fails; 1 if core paths work with minor gaps; 2 if touch, keyboard, labels, focus, contrast, and reduced motion are complete.
8. **Performance and implementation polish** — 0 if wasteful or unstable; 1 if acceptable with known debt; 2 if loading, sizing, code structure, and project integration are deliberate.

Pass at 13 or higher out of 16 with no zero and with visual evidence for categories 1–6. A score cannot erase an automatic blocker.

## Automatic blockers

- Text covers a face, landmark, product, horizon, or key light source without a deliberate editorial reason.
- A CTA, title, navigation item, or persistent control is clipped, hidden, or unreachable.
- Emoji, a boxed Unicode arrow, or a missing-glyph symbol appears as an interface icon.
- Mobile requires horizontal scrolling.
- Motion conflicts with the image, disappears for long accidental gaps, distracts from reading, or ignores reduced motion.
- A low-resolution image is stretched full-screen without an intentional treatment.
- Multiple unrelated styles appear on one page.
- Placeholder copy, starter metadata, or generic asset residue remains in the final result.
- The site is published or private imagery is exposed without explicit authorization.

## Final review loop

1. Render and inspect.
2. List concrete defects, not impressions.
3. Fix the highest-impact defect first.
4. Re-render every affected viewport.
5. Score only the latest proof.
6. Report checks and limitations accurately.

