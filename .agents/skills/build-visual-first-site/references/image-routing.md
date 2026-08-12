# Image routing

## Inspect before asking

For every relevant image, separate metadata facts from visual judgment.

Metadata facts:

- format, file size, pixel dimensions, aspect ratio, and effective orientation;
- possible desktop, mobile, chapter, detail, or framed-placement candidates;
- browser-format compatibility and optimization risks.

Visual judgment:

- primary subject and secondary details;
- focal-point coordinates for desktop and mobile;
- genuine text-safe regions;
- face, horizon, architecture, landmark, product, and key-light safety;
- color temperature, dominant neutrals, and accents;
- depth, contrast, visual noise, and crop tolerance;
- whether ambient motion is implied by the scene or would conflict with it.

Run the audit script for facts, then view likely hero and supporting images at original detail. `roleCandidates` are suggestions, never final assignments.

## Asset-state decision

Classify the request as one of five states:

### Complete supplied set

The supplied files cover the required hero and supporting roles at usable quality.

- Use them as source of truth.
- Select a hero and assign chapter, supporting, detail, desktop, and mobile roles.
- Derive the style from the strongest visual relationship.
- Avoid generated replacements merely for novelty or variety.

### Partial supplied set

At least one strong image exists, but a role or orientation is missing.

- Use the strongest supplied image as the style anchor.
- Reuse it intelligently or create only the missing companion.
- Match lighting, medium, color language, realism, and narrative role without duplicating the same composition.
- Do not generate a complete replacement set.

### No supplied images

No useful image asset exists yet.

1. Infer subject and purpose from the request.
2. If both are clear, choose an initial style profile without asking for tokens or mood-board settings.
3. If the subject itself is unclear, ask one short subject-or-mood question.
4. Create or source one hero concept first.
5. Inspect its composition and mobile crop before expanding the visual family.

Prefer an original generated visual when originality matters and an image-generation skill is available. Prefer a suitable licensed or user-approved source when documentary accuracy matters. If neither path is available, ask the user for one anchor image; do not pretend gradients, abstract blobs, or code-drawn scenery are a photograph.

### Weak or unsuitable set

Files are too small, too noisy, too tightly cropped, or compositionally unsafe for the requested treatment.

- Do not force full-screen backgrounds.
- Use framed editorial placement, split image and copy, layered details, contact sheets, restrained solid fields, or one viable hero with a smaller gallery.
- Recommend replacement, optimization, or one companion only when it materially improves the outcome.
- Explain the limitation without insulting the photography.

### Mixed or inconsistent set

Images are individually usable but differ in lighting, medium, quality, or subject language.

- Curate before harmonizing.
- Group by place, date, subject, color, story, or medium.
- Use layout rhythm and restrained presentation color to create coherence.
- Do not flatten every image under one heavy color grade.
- When no coherent subset exists, choose one anchor and treat the remainder as an archive or secondary chapter.

## Single image versus collection

- One image: design around its natural negative space and strongest independent desktop and mobile crops.
- Two to five images: choose one hero and build a short narrative or curated sequence.
- Six or more images: group and prioritize; do not display everything merely because it exists.
- Mixed orientations: route wide images to scenes, vertical images to mobile, portrait, or chapter moments where appropriate.
- A vertical image can still anchor desktop through framing; a wide image can still work on mobile with a dedicated derivative. Do not infer role from ratio alone.

## Format handling

- Preserve JPEG, PNG, WebP, GIF, AVIF, HEIC, and HEIF originals.
- The audit script reads common formats and attempts ISO-BMFF dimensions for AVIF/HEIC/HEIF.
- Apply JPEG EXIF orientation before evaluating portrait versus landscape.
- Treat HEIC/HEIF as source formats that often need a web-compatible derivative; never silently omit them.
- If a format cannot be decoded or previewed, mark it for native inspection or conversion and keep the original untouched.
- Animated GIF metadata does not prove the animation is appropriate; inspect its actual motion.

## Permission and privacy boundaries

- Never overwrite original photography.
- Do not generatively add, remove, or alter content in a user photograph without explicit approval.
- Keep CSS cropping and layout treatment non-destructive; show consequential crops in the proof.
- Confirm before publishing faces, private locations, sensitive metadata, or externally sourced images.
- Strip unnecessary EXIF and location metadata from public derivatives when privacy matters.
- Record source or license details for third-party imagery.

## Image plan

Record at least:

- source path, ownership or license, and original preservation status;
- metadata and visually confirmed role;
- desktop and mobile focal points;
- text-safe region and crop anchors;
- intended presentation and responsive derivative;
- motion compatibility;
- permission, privacy, quality, and format risks.

