# 数字人比赛演示素材

`studymate-tutor-transparent.png` 是第一阶段沿用的透明待机姿态。第三阶段以它为身份参考，通过 Codex 内置 ImageGen 生成并本地去除纯色背景，新增：

- `studymate-tutor-listening.png`
- `studymate-tutor-thinking.png`
- `studymate-tutor-speaking.png`

这些是 AI 生成的比赛演示姿态素材，不是视频、逐帧动作捕捉或逐音素口型。页面通过状态图片交叉淡化和克制微动形成轻量动态，并在 `prefers-reduced-motion` 下取消持续微动。

`*-320.webp` 与 `*-640.webp` 是运行时响应式版本；PNG 只作为兼容回退。更新姿态时必须保持同一人物、服装、机位、完整头脚和透明边缘。
