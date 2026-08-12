---
name: build-visual-first-site
description: Build or restyle high-end, image-led, responsive websites when photography, illustration, atmosphere, or visual storytelling is the primary experience. Use for travel and photography journals, immersive landing pages, seasonal stories, hospitality, lifestyle, portfolios, editorial showcases, premium products, image-matched motion, or mobile visual polish—with supplied images, partial assets, weak assets, or no images yet. Inspect the project and imagery, choose an evidence-based art direction, implement in the existing stack, and verify desktop and mobile visually. Do not use for dashboards, admin tools, forms-heavy SaaS, data utilities, or commerce flows where imagery is secondary.
---

# Build Visual-First Site

## Outcome

Create an original site in which imagery supplies emotion, typography supplies hierarchy, interaction supplies direction, and motion supplies atmosphere.

Use this design equation:

    disciplined product interface
    + editorial image direction
    + restrained, image-matched motion

Borrow principles such as clarity, hierarchy, spacing, consistency, and restraint from excellent product companies. Never clone a named company's recognizable layout, copy, brand, or visual skin.

## Resolve the package and project

- Treat the directory containing this `SKILL.md` as `<skill-dir>`. Never assume an absolute skill path.
- Read [project discovery](references/project-discovery.md) at the start of every new project.
- Respect repository instructions, user-owned files, the existing package manager, and unrelated changes.
- Distinguish request intent before acting:
  - build, change, or restyle: implement and verify;
  - discuss, review, or diagnose: inspect and advise without making unrequested changes;
  - publish: deploy only with explicit authorization.

## Load references progressively

Read only the references required for the active branch:

- [design principles](references/design-principles.md): before choosing a visual direction.
- [image routing](references/image-routing.md): whenever images are supplied, partial, missing, mixed, or unsuitable.
- [style profiles](references/style-profiles.md): before selecting or switching the art direction.
- [motion recipes](references/motion-recipes.md): when the experience includes ambient or transition motion.
- [responsive art direction](references/responsive-art-direction.md): before implementing desktop and mobile compositions.
- [quality gates](references/quality-gates.md): before claiming completion, showing a final proof, or publishing.
- [worked examples](references/worked-examples.md): when image evidence fits more than one direction or the result starts to look generic.
- [usage and evaluation](references/usage-and-evaluation.md): only when installing, sharing, maintaining, or regression-testing this skill.

## Minimal-question contract

Lead with visual judgment. Do not begin with a style questionnaire.

- Supplied images plus a clear goal: ask zero setup questions.
- Supplied images but unclear purpose: ask at most one purpose question.
- No images but a clear subject and goal: infer a direction and begin with one hero concept.
- No images and no identifiable subject: ask one short subject-or-mood question, not a list of preferences.
- Existing site restyle: preserve working behavior and ask only about a decision that would materially change the product.
- If the user says “you decide,” choose one primary direction and proceed.
- Recommend one direction and, only when genuinely close, one credible alternative. Never make the user select frameworks, breakpoints, fonts, animation libraries, or token values.

## Workflow

### 1. Discover the project

Follow [project discovery](references/project-discovery.md). Resolve the repository root, stack, routes, assets, commands, hosting markers, and current visual system dynamically. Do not replace working infrastructure merely to fit a preferred starter.

### 2. Audit images before layout

When image files exist:

1. Run the read-only inventory:

       node "<skill-dir>/scripts/audit-images.mjs" <image paths or directories>

2. View likely hero and supporting images at original detail. Metadata candidates are not final art direction.
3. Record subject, focal point, genuine text-safe regions, horizon or face safety, color temperature, depth, visual noise, crop tolerance, and mobile suitability.
4. Classify the asset state with [image routing](references/image-routing.md).

Never judge an image from its filename. Never overwrite an original.

### 3. Route the asset branch

- Complete supplied set: use it as source of truth; avoid unnecessary generation.
- Partial set: anchor the design to the strongest supplied image and fill only real gaps.
- No images: infer subject and purpose; create or source one hero direction before expanding a visual family.
- Weak or inconsistent set: use framing, split composition, editorial sequencing, or quiet fields instead of stretching poor imagery full-screen.

Use an available image-generation skill for original bitmap assets or approved generative edits. Never simulate a missing photograph with CSS or programmatic drawing. Obtain explicit approval before generatively altering a user photograph. Non-destructive CSS crops may be implemented and shown in the proof.

If image generation is unavailable, follow the fallback in [image routing](references/image-routing.md); do not silently substitute generic gradients or stock-like placeholders.

### 4. Route the style from evidence

Read [style profiles](references/style-profiles.md), score every plausible profile, and record the evidence. Choose one primary profile. Borrow at most one compatible secondary trait.

Do not default to Poetic Immersive merely because an image is attractive or because this skill was inspired by a scenic site. Purpose and composition outrank novelty.

Derive palette, crop anchors, typography character, contrast treatment, control density, and motion motif from the actual imagery.

### 5. Freeze a compact brief

Resolve:

- page purpose, audience, and primary action;
- asset state, image hierarchy, focal points, and crop anchors;
- primary profile, routing score, and supporting evidence;
- headline character, content density, palette, and typography roles;
- motion motif, visibility, intensity, and reduced-motion behavior;
- independent desktop and mobile compositions;
- image editing, privacy, and publishing permissions;
- verification commands and proof viewports.

Use [the brief template](assets/site-brief.template.json) when a persistent artifact helps. Otherwise keep the brief internal and continue.

If the visual direction is materially uncertain, prove one desktop hero and one mobile hero first. If the user explicitly requests autonomous completion, make the decision and apply the same proof gate internally.

### 6. Implement with restraint

- Reuse the existing framework and component conventions.
- Let the image remain the protagonist; UI behaves as a quiet frame.
- Give each viewport one dominant focal point and each section one primary action.
- Use no more than two type families and only purposeful weights.
- Use one coherent vector icon family. Never use emoji, boxed Unicode glyphs, or text characters as interface arrows.
- Use image-specific desktop and mobile crop anchors.
- Keep persistent motion image-aware, continuously perceptible, slow, optional when prominent, and pointer-transparent.
- Honor reduced motion, keyboard use, touch use, safe areas, and accessible names.
- Compose mobile independently instead of shrinking desktop.
- Preserve source imagery and create optimized derivatives when needed.
- Avoid speculative features, decorative card stacks, control clutter, and generic AI copy.

### 7. Verify with visible evidence

Follow [quality gates](references/quality-gates.md).

At minimum:

- render representative desktop, mobile, compact-height, and mobile-landscape views;
- inspect screenshots rather than trusting DOM, CSS, or build success;
- confirm the subject, headline, primary action, controls, and crop remain intentional;
- test touch, keyboard, reduced motion, and persistent-motion controls;
- run relevant build, lint, and tests using the project's own commands;
- record evidence and fix every blocker before claiming completion.

If visual inspection tooling is unavailable, complete structural checks, state the limitation, and do not claim the visual gate passed.

### 8. Deliver or publish

Report the chosen art direction, image handling, responsive coverage, motion behavior, checks run, and any remaining limitation in plain language.

Keep local creation and public publishing separate. Never deploy, expose private images, or make a site public without explicit user authorization.

## Tool fallbacks

- Image metadata script fails: inspect files directly and report which metadata remains unknown.
- Native HEIC/HEIF preview is unavailable: preserve originals, create a web-compatible derivative only inside the project, and keep source attribution.
- Image generation is unavailable: ask for an image or, when appropriate and allowed, use a suitable licensed source; do not fake the visual asset.
- Browser or screenshot tooling is unavailable: run structural and build checks, report that visual QA is incomplete, and avoid a high-confidence polish claim.
- A project command is missing: infer nothing from a different repository; inspect `package.json`, task files, or framework config and use the closest existing command.

