# 介绍页运行时图片

- 欢迎页主叙事使用 `skillops-glider-hero-desktop-v1.webp`、`skillops-glider-hero-mobile-v1.webp` 与 `skillops-earth-orbit-v1.webp`。它们由 OpenAI 内置 ImageGen 为本页生成，并转为网页优化格式；原始 PNG 保留在 Codex 生成目录。
- `product-*-v1.jpg` 是从当前演示环境登录后抓取的真实产品界面。运行 `node scripts/capture-landing-sources.mjs` 可重新生成，账号信息必须通过 `STUDYMATE_CAPTURE_EMAIL` 与 `STUDYMATE_CAPTURE_PASSWORD` 环境变量传入。
- `preview-oj-placeholder-v1.svg` 与 `preview-interview-placeholder-v1.svg` 是待接入模块的概念占位图，图内和页面文案均明确标注“待接入”，后续可按原文件名直接替换。
- 首屏校园图使用 `studymate-campus-hero-960.webp` / `studymate-campus-hero-1600.webp`，`studymate-campus-hero.jpg` 为兼容回退。
- 学习太阳系优先使用 256/512 像素 WebP，缩小 PNG 为兼容回退。
- 高分辨率母图保存在 `frontend/assets-source/landing/`，不直接发布。
- 页面截图继续延迟加载；首屏主视觉按视口预加载。

旧欢迎页素材仍供历史页面或其他场景使用，但新版 `index.html` 不再引用。公开商业使用前仍需复核校园主视觉、人物视频与外部课程封面的展示授权；课程封面来源信息见 `public/course-covers/README.md`。
