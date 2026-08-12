# Usage, sharing, and evaluation

This skill is project-scoped. Use this reference when sharing or maintaining it; normal website work should follow `SKILL.md` directly.

## Install in a project

Copy the complete folder to:

    <project-root>/.agents/skills/build-visual-first-site/

Keep `SKILL.md`, `agents`, `assets`, `references`, and `scripts` together. Start Codex from inside the project. The skill can be invoked explicitly with `$build-visual-first-site` or implicitly by a request matching its description.

Do not place project-specific absolute paths, brand copy, image mappings, or framework versions inside the reusable folder.

## Low-friction prompts

These should work without a long design brief:

- “用这些旅行照片做一个高级、简洁、手机端也漂亮的网站，你来决定风格。”
- “把我现有的摄影主页改得更有氛围，动态要和图片匹配。”
- “我还没有图片，帮这个山间民宿做一个视觉优先的落地页。”
- “Use $build-visual-first-site to turn this folder of architecture photos into a polished portfolio.”

The agent should inspect first, ask at most the question allowed by the minimal-question contract, recommend one primary direction, and continue.

## Positive trigger checks

The skill should trigger for:

1. scenic or seasonal landing pages;
2. photography and travel journals;
3. hospitality, lifestyle, architecture, food, and premium product showcases driven by imagery;
4. an existing image-led site that needs mobile recomposition or motion polish;
5. supplied, partial, weak, mixed, or missing image assets.

## Negative trigger checks

The skill should not trigger as the primary workflow for:

1. analytics dashboards;
2. admin or internal CRUD tools;
3. forms-heavy SaaS onboarding;
4. spreadsheet-like utilities;
5. checkout, catalog, or commerce flows where product operations outweigh visual storytelling;
6. backend-only, API-only, or infrastructure work.

## Forward evaluation cases

Run these after meaningful changes to the skill. Judge behavior and evidence, not whether every result looks like the same reference page.

The machine-readable prompt set lives in `../assets/evaluation-cases.json`; use it to replay both positive and negative triggers without rewriting the cases from memory.

| Case | Inputs | Expected behavior | Failure signal |
| --- | --- | --- | --- |
| Scenic single hero | one 3:2 landscape | considers Poetic Immersive, protects horizon, proves mobile crop | copies a centered seasonal hero by default |
| Architecture set | 4–8 geometric images | Quiet Luxury likely wins with scored evidence | adds unrelated particles or dreamy script |
| Personal travel archive | 10+ mixed images and notes | Travel Editorial likely wins; curates rather than shows all | treats every image as full-screen |
| Food or home | warm close-ups and people | Clear Lifestyle likely wins | forces cold corporate luxury |
| Ordered five-scene story | explicit sequence | Cinematic Story likely wins | destroys order in a generic gallery |
| Weak mixed assets | low-resolution inconsistent files | frames, curates, or requests one anchor | stretches weak files full-screen |
| No images, clear subject | goal plus subject only | creates or sources one hero concept first | generates an unreviewed full set |
| Existing mobile defect | working site and screenshot | preserves stack, fixes responsive composition, rechecks viewports | rewrites unrelated architecture |

## Script regression

Run:

    node "<skill-dir>/scripts/check-package.mjs"
    node "<skill-dir>/scripts/audit-images.mjs" --self-test
    node "<skill-dir>/scripts/audit-images.mjs" <representative image directory>

Confirm that a 1536×1024 image is considered a viable desktop full-bleed candidate, portrait orientation respects EXIF rotation, and HEIC/HEIF files are reported instead of silently ignored.

## Package acceptance

Before sharing:

- validate the skill structure with the current Skill Creator validator;
- confirm every linked reference exists;
- parse `assets/site-brief.template.json` and `assets/evaluation-cases.json`;
- parse `agents/openai.yaml` through the validator;
- run the image-audit self-test;
- run at least one real-image audit;
- search for hard-coded local drive paths, prior brand names, and stale framework assumptions;
- confirm the skill still declines non-image-led work.
