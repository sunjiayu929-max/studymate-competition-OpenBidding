# 视频数字人 MVP 实施交接

## 本轮交付结论

登录后语音助教的主体已从“多张静态姿态图交叉淡入”改为双连续视频轨：闭嘴待机轨负责 `idle/listening/thinking`，原讲解轨只负责 TTS 真正播放后的 `speaking`。两个视频都提前加载，状态切换使用约 280ms 的视频层过渡，不再轮换 PNG/WebP。

第三轮采用“真实讲师视频舞台”备用方向。语音页不再把横屏人物放在一个过大的空面板上：16:9 视频成为主要画面，右上安全区显示“真人讲师”状态，底部渐变承载媒体标识，字幕摘要和暂停/清空/退出工具带紧贴视频下方。宽屏主区上限后续扩展为 1680px、右栏上限提高到 720px，并让两栏在可用高度内垂直协调，减少 1800×900 等宽屏下方的大块留白；1366×768 仍保持紧凑布局。

第四轮按用户明确反馈取消了带教室背景的软边裁切。全站可拖动入口现在使用同一位讲师的闭嘴 **透明 VP9 WebM**：360×480 画布只保留人物 alpha，不再显示教室背景、拱形、椭圆或任何卡片底色。文字助教生成时只改变思考光效，视频仍保持闭嘴。它继续支持点击打开、拖动、键盘激活和刷新后位置持久化，并按页面语境低频显示两行以内的非阻塞消息。

这是诚实的视频优先 MVP：小入口已经是透明连续半身视频，但不宣称已经具备透明全身连续视频、实时 3D、逐音素口型或 Wav2Lip。

本轮复查后选择了“真实讲师视频舞台”作为稳定方向，没有继续接入实时音频能量口型。原因是当前主链路由 `StreamingTtsPipeline` / `playBlob` 管理实际音频元素，`VoiceTutor.tsx` 只能收到句子开始和队列结束回调；若在本任务授权范围内强行接入 `AnalyserNode`，只能覆盖非流式回退路径，或者必须侵入公共 TTS 播放层。前者会造成同一页面两种不同同步行为，后者触发“不得改写 ASR/TTS 状态机”的止损条件。最终同步等级因此明确为 **TTS 开始/停止同步**，不是停顿能量同步，更不是逐音素口型。

## 素材清单与真实性边界

本轮没有下载、购买或引入任何第三方素材，也没有使用授权不明的网页视频。连续视频和海报均为仓库原有资产：

| 用途 | 路径 | 参数 | SHA-256 |
| --- | --- | --- | --- |
| 连续人物视频 | `frontend/public/avatars/lecturer_talk.mp4` | H.264、960×540、25fps、33.36 秒、yuv420p、无音频轨、435087 B、约 104337 bit/s | `0DBC593C3EBB4BA6CECB0863F4A0A7C0F866439A5DE003811285AF5D96A3BD9F` |
| 视频海报 | `frontend/public/avatars/lecturer_talk_poster.jpg` | JPEG、960×540、34358 B | `3DCB454DE3A6B82753E72D49D96D0BB57EF3A2CC877857C6E5F37C86F7209076` |
| 闭嘴待机循环 | `frontend/public/digital-human/studymate-lecturer-idle.mp4` | H.264、960×540、25fps、2.00 秒、yuv420p、无音频轨、34478 B；从原片 33.08–33.32 秒闭嘴动作慢放并正反向回环 | `B663D10D3DA864DCD85FBD6C859680FFE88958BA07E8C0192F9430543744EFD6` |
| 闭嘴待机海报 | `frontend/public/digital-human/studymate-lecturer-idle-poster.jpg` | JPEG、960×540、42021 B | `4A5D422D52601756E1B90740A985905E3F2297AC9BB6B8D80D801063EF033474` |
| 透明动态入口 | `frontend/public/digital-human/studymate-tutor-idle-transparent.webm` | VP9、360×480、25fps、2.00 秒、`ALPHA_MODE=1`、无音频轨、19781 B | `0DBD76397AB4E6964883AF698E124779FA6516097888E95B8F06F49395644603` |
| 透明入口海报 | `frontend/public/digital-human/studymate-tutor-idle-transparent-poster.png` | RGBA PNG、360×480、98730 B | `9F0A84A98A9EC619FB0AF0C8179C5CEB2915D29285BE15640EA065FB3320E51B` |
| 透明全身失败回退（不再作为入口主表现） | `frontend/public/digital-human/studymate-tutor-transparent.png` | RGBA PNG、1024×1536、403092 B | `6BA4317D77CBAE2F2EA7E209605CF339DAE27E07E42562054E3BEAFB43F8E505` |

仓库内没有检索到 `lecturer_talk.mp4` 的外部来源或单独许可页面。因此本交接只把它记录为“项目既有资产”，不补造第三方来源或许可声明。若项目发布流程要求逐项权属证明，应由素材提供方补齐原始生成记录或授权文件。

讲解视频包含真实连续的眨眼、头部、口部动作，以及开放掌、单手强调、双手展开和总结收手等真实动作。逐段抽帧复查确认这些动作在原始 33 秒序列中自然连续，但没有提取成独立循环：短片段首尾姿态难以无痕衔接，句间切换会比完整原片更假。当前实现直接连续播放原片，所以具备真实的多种手势内容，但**没有多手势调度器**。闭嘴待机循环逐帧确认口部保持闭合；由于原片没有较长的静默动作，它只包含非常轻微的头部和身体回落，不宣称具备完整的待机表演。源文件为横屏教室场景，人物只到膝上方附近，不是透明全身素材。语音舞台明确按“真人讲师视频”呈现完整 16:9 源画面；浮动入口则从同一闭嘴循环生成稳定人物蒙版，裁成透明半身画布。

透明入口没有引入新的第三方人物媒体。处理脚本 `frontend/scripts/create-transparent-idle.py` 使用本机 torchvision 的官方 `DeepLabV3-ResNet50` 权重对项目既有视频做人物分割；7 个时间采样的概率蒙版先求均值，再统一应用到全部 50 帧，避免逐帧阈值造成发丝闪烁。边缘经过轻度收缩、羽化和邻近不透明像素去污染，随后编码为 VP9 `yuva420p` WebM。模型权重来自 PyTorch 官方下载地址，人物影像本身仍完全来自项目既有素材。

## 状态和播放规则

| 状态 | 视频行为 | 页面文案/视觉 |
| --- | --- | --- |
| `idle` | 闭嘴待机轨，0.93–1.02× 自然节奏 | 准备就绪 |
| `listening` | 闭嘴待机轨，0.93–1.02× 自然节奏 | 绿色聆听状态 |
| `thinking` | 闭嘴待机轨，基础 0.90× 并叠加轻微节奏变化 | 思考中；LLM 已完成而 TTS 尚未播放时显示“准备朗读” |
| `speaking` | 讲解轨，1.00× 连续播放 | 仅在 TTS 音频真正开始播放后进入，显示轻量波形 |
| `paused` | 两条视频均暂停，显示闭嘴待机当前帧 | 暂停状态和轻度去饱和 |

待机轨和讲解轨同时挂载并预热。两轨用 280ms 缓动透明度过渡；讲解轨尚未可播或失败时继续显示已预热的待机轨，`data-active-track` 记录的是实际可见轨，不会错误报告 `speaking`。待机视频不再机械 `loop`：每轮闭嘴微动结束后停在最后一个有效帧 360/780/520/1040ms，并按 0.96/1.00/0.93/1.02× 循环改变速度。

透明 WebM 精确到达 `duration` 时 Chromium 可能暴露透明空表面。当前主路径会按媒体时长、当前时间和播放速度计算一次低开销预结束计时器，在 `duration - 0.08s` 前主动暂停，再定位到 `duration - 0.04s` 的最后有效帧进入 hold；`onEnded` 只保留为调度延迟时的兜底。`data-idle-boundary-armed`、`data-idle-restart-pending` 和 `data-idle-hold-source` 用于专项 QA。页面隐藏、组件离屏、暂停、切换 speaking 或卸载时会立即取消边界和重启计时器。浮动人物另叠加周期 11.6 秒、幅度低于 0.25% 的慢速重心漂移；该 CSS 只作用于透明人物，不移动语音页教室背景。

`StreamingTtsPipeline` 在同一回答的句子队列中，从首次 `onPlaybackStart` 到 `onDrain` 始终保持 `speaking`，因此组件不会在句间反复触发起势。每次真正发生 `speaking false → true` 都代表新的回答回合，讲解视频一律从自然闭嘴起势点开始；已移除基于时间窗口续播旧回答的逻辑。它仍然只是回答级开始/停止同步，不代表精确口型或音素同步。

视频始终 `muted`、`playsInline`，不会自动播放声音。语音仍完全由现有 TTS 音频链路负责。`audio.play()` 成功或流式 TTS 的 `onPlaybackStart` 触发后才设置 `speaking`；合成和等待阶段保持 `thinking`/“准备朗读”；音频结束后立即回 `listening`。本轮没有修改 ASR/TTS 协议或会话状态机。

### 同步能力分级与止损结果

| 能力 | 当前结果 | 说明 |
| --- | --- | --- |
| TTS 合成等待闭嘴 | 已实现 | `thinking` 始终使用闭嘴待机轨 |
| TTS 开始/停止同步 | 已实现 | 真正开始播放才切讲解轨，结束立即回闭嘴轨 |
| 句内大停顿/能量同步 | 未实现 | 主流式播放器不暴露音频节点；未为功能清单侵入公共播放层 |
| 精确逐音素口型 | 未实现 | 当前素材与链路都不支持，也不作此声明 |
| 连续真实手势 | 已实现 | 完整讲解原片自带连续手势 |
| 独立多手势调度 | 未实现 | 抽出的短段无法保证自然循环与无痕身份/姿态衔接 |

复查采用的止损结论是：保留完整讲解原片比按句子切碎开放掌、强调、总结等段落更自然；保留可靠的开始/停止同步比只在非流式回退路径做能量同步更一致。没有增加额外 `AudioContext`、解码器或 TTS 预分析，因此不会增加首声等待，也不会改变声音播放稳定性。

## 性能与回退

- `<video>` 离开视口、`document.hidden`、组件关闭或进入 `paused` 时暂停，减少后台解码。
- `prefers-reduced-motion` 下不创建视频播放实例，显示单张视频海报。
- 视频解码或网络加载失败时显示单张海报，并在语音舞台显示“视频加载失败，已切换为静态形象”；对话功能不受影响。
- 全站浮动入口只挂载透明闭嘴 idle WebM，不挂载 speaking 视频，避免额外解码和文字生成时假装说话；`prefers-reduced-motion` 或视频失败时显示透明 RGBA 海报。
- 浮动入口尺寸按视口为 170×218 / 184×236 / 196×252px；点击、拖动和键盘激活分离，位置保存在 `localStorage` 的 `sm:digital-human-position`。第三轮同时修正了快速拖动后 React 状态尚未提交时可能保存旧坐标的问题，改为实时位置引用持久化。
- 浮动助教现在会在首次进入约 2.2 秒后主动介绍：“我是你的学习助教，有问题随时来问我。”，展示约 8.2 秒；同一浏览器会话只主动介绍一次。后续情境提示约每 75 秒出现一次、展示 7.2 秒，避免持续打扰。
- 人物左上方提供“隐藏学习助教”，抽屉标题栏也提供“隐藏助教”。隐藏偏好写入 `sm:digital-human-hidden`，刷新后继续保持；右侧仅保留一个低干扰的“显示助教”小入口，点击即可恢复。`Alt+/` 在隐藏状态下也会恢复并打开助教。

## 后续透明全身 WebM 媒体契约

若取得权属明确、无水印、绿幕或已带 alpha 的连续全身素材，建议按以下契约替换，不要重新引入姿态图片轮换：

- 文件名：
  - `frontend/public/digital-human/studymate-tutor-idle-alpha.webm`
  - `frontend/public/digital-human/studymate-tutor-listening-alpha.webm`
  - `frontend/public/digital-human/studymate-tutor-thinking-alpha.webm`
  - `frontend/public/digital-human/studymate-tutor-explain-neutral-alpha.webm`
  - `frontend/public/digital-human/studymate-tutor-emphasize-alpha.webm`
  - `frontend/public/digital-human/studymate-tutor-point-alpha.webm`
  - `frontend/public/digital-human/studymate-tutor-conclude-alpha.webm`
  - MP4 兼容回退可使用同名 `-fallback.mp4`，但 MP4 不承诺 alpha。
- 编码：VP9 Profile 0/yuva420p WebM，25 或 30fps，无音频轨；浏览器解码验证必须能读到 alpha。
- 画布：推荐 720×1280，人物从头顶到鞋底完整可见，四周至少保留 4% 安全区；CSS 使用 `object-contain object-bottom`。
- 动作：每段建议 4–8 秒、首尾姿态和速度连续；`idle/listening/thinking` 不应持续张嘴讲话；四条讲解轨分别覆盖普通讲解、轻微强调、侧面指向和总结收手。只有在同一人物、机位、光线和首尾姿态能自然衔接时才接入调度；可包含自然口部节奏，但不宣称逐音素同步。
- 体积：单段目标不超过 4MB，总体不超过 14MB；同时提供 360×640 或等效移动端版本时，用 `<source media>` 选择。
- 抠色：只对许可证允许本地处理的素材执行；导出前逐帧检查发丝、手指、鞋底、半透明边缘和绿色溢色。发现破碎肢体或明显绿边时不得上线。
- 接入点：在 `frontend/src/lib/digitalHuman.ts` 增加每状态 source 配置，在 `DigitalHumanVideo.tsx` 内以双视频预热并于自然边界切换；切换期间保持上一帧到新段可播放，禁止空白帧。

## 修改文件

- `frontend/src/components/DigitalHumanVideo.tsx`
- `frontend/src/components/DigitalHumanVideo.css`
- `frontend/src/components/DigitalHumanMedia.tsx`
- `frontend/src/components/LecturerAvatar.tsx`
- `frontend/src/components/TutorBubble.tsx`
- `frontend/src/pages/VoiceTutor.tsx`
- `frontend/src/lib/digitalHuman.ts`
- `frontend/public/digital-human/studymate-lecturer-idle.mp4`
- `frontend/public/digital-human/studymate-lecturer-idle-poster.jpg`
- `frontend/public/digital-human/studymate-tutor-idle-transparent.webm`
- `frontend/public/digital-human/studymate-tutor-idle-transparent-poster.png`
- `frontend/scripts/create-transparent-idle.py`
- `frontend/scripts/check-digital-human-video.mjs`
- `frontend/scripts/check-voice-history-isolation.mjs`
- `frontend/qa/digital-human-video.html`
- `frontend/src/components/DigitalHumanVideo.qa.tsx`
- `frontend/src/store/voiceTutorHistory.ts`
- `frontend/src/store/tutorGeneration.ts`
- `docs/视频数字人MVP实施交接.md`

## 数字讲师与文字助教会话隔离

- 语音页右侧现为“数字讲师会话”，使用独立的 `voiceTutorHistory`，不再读取或写入文字助教的 `tutorHistory`。
- 数字讲师记录按用户和课程保存在 `sm:voice-tutor-history:u{uid}:c{courseId}` 命名空间；页面刷新后仍保留，但不会同步进文字助教的后端历史。
- 共用的生成器只增加了可选 `historySink`。文字助教不传参数时仍写入原 `tutorHistory`；语音页明确传入 `voiceTutorHistory`，因此流式完成、停止和错误消息均落到正确会话。
- 课程 ID 仍原样传给生成接口，课程上下文能力未削弱；ASR、TTS 和后端协议均未改变。
- 语音页“清空”只删除当前数字讲师会话，并在确认框明确提示不会影响文字助教历史。
- 旧版本已经混入文字助教的记录没有可靠的来源字段，因此不做猜测性迁移或删除；升级后它们不会再显示在数字讲师页，新消息也不会继续混入。

## 定向验证

已执行：

- `npx eslint src/components/DigitalHumanMedia.tsx src/components/DigitalHumanVideo.tsx src/components/DigitalHumanVideo.qa.tsx src/components/LecturerAvatar.tsx src/components/TutorBubble.tsx src/pages/VoiceTutor.tsx src/lib/digitalHuman.ts`
- `npx eslint src/store/voiceTutorHistory.ts src/store/tutorGeneration.ts src/pages/VoiceTutor.tsx`
- `npx tsc --noEmit -p tsconfig.app.json`
- `node scripts/check-digital-human-video.mjs`
- `node scripts/check-voice-history-isolation.mjs`

按并行任务约束，本轮未执行 `npm run build`，也未写入 `dist/`。

应用内浏览器 QA：

- 真人讲师舞台检查了 1366×768 与 1800×900。1366 下左栏约 559px、右栏约 624px；1800 下内容宽度扩展后左栏约 926×660、右栏约 698×720，右栏底部距页脚约 38px，原截图中的大块底部留白显著收窄。两种视口均无横向溢出、人物未变形，状态覆盖区不挡脸。
- 暂停态下视频解码 `readyState=4`、`data-video-ready=true`，视频保留当前帧且 `paused=true`。
- 直接打开同源 MP4 做连续解码检查：960×540、时长 33.36 秒、`readyState=4`，约 1.2 秒观察窗口内 `currentTime` 从 0.405 秒前进至 1.657 秒。
- 追加进行了 20.59 秒真实浏览器连续播放观察：讲解原片从 0.016 秒连续前进到 20.606 秒，21 个每秒采样点全部保持 `readyState=4`、`paused=false`、960×540，无暂停或尺寸异常。闭嘴 2 秒素材另以 FFmpeg 重复解码 20 秒，零解码错误；浏览器组件内已验证其 1.2 秒连续前进和首尾回环配置。
- 第四轮透明入口在 Chromium 中确认实际加载 `/digital-human/studymate-tutor-idle-transparent.webm`，解码尺寸 360×480、`readyState=4`、背景计算值为完全透明且没有 CSS 蒙版或背景形状。15 秒观察中完成 7 次回环，所有采样点均保持播放，没有黑帧或解码中止。
- 第五轮通过不连接后端的本地 QA 页连续采样自然待机：透明轨 `readyState=4`，播放速率按 1.02→0.96→1.00× 变化，并在最后有效帧出现约 1.04 秒、0.36 秒等不同长度的闭嘴停顿。首次实现停在精确 `duration` 时发现透明人物会短暂消失，由此确认必须采用预结束保护，而不能只依赖 `onEnded` 后补救。
- 第六轮修正后以 20ms 间隔采样 600 次，覆盖 4 个连续边界；`currentTime` 最大始终为 1.960/2.000 秒，4 次 hold 的 `data-idle-hold-source` 全部为 `pre-end`，没有走 `ended-fallback`。新 speaking 回合从旧轨 1.323 秒重置到约 0.590 秒起势。组件完全越过 80px 预加载边界后，`data-idle-boundary-armed` 与 `data-idle-restart-pending` 都变为 `false`，视频保持暂停；控制台无运行错误。
- 实际拖动后入口从页面中部移动到右下安全位置，抽屉没有误打开；新标签页重新加载后坐标仍保持为拖动后的值。第三轮发现并修正了 pointer-up 与 React 状态提交同帧时可能保存旧位置的竞态。
- 气泡首次约 2.2 秒后显示“我是你的学习助教，有问题随时来问我。”，位于透明人物左侧且不遮脸；后续情境提示保持约 75 秒低频出现。浏览器截图确认卡片内容能直接透过人物四周显示，不存在教室背景、拱形或椭圆底。
- 焦点态最初会在整个透明按钮外画矩形 ring，浏览器复查后已改为仅在“在线”小状态上显示键盘焦点提示，人物外围不再出现卡片边框。
- 首次进入暂停态的主按钮和状态说明已改为“开始对话”；真正启动过并再次暂停后显示“继续对话”。QA 未点击该按钮，避免在没有额外授权时申请并向已配置 ASR 服务传输麦克风音频。因此 `speaking` 的真实 TTS 现场切换仍由现有 `audio.play()` / 流式 TTS `onPlaybackStart` 代码路径、TypeScript、ESLint 和专用检查脚本验证。
- 会话隔离复查中，语音页右侧显示“数字讲师会话 / 独立保存，不与文字助教记录混合”，新命名空间初始为 0 条；页面不再渲染文字助教的既有记录。未启动麦克风或真实语音服务。

截图绝对路径：

- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\voice-tutor-real-video-stage-1366x768-final.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\voice-tutor-real-video-stage-1440x900.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\tutor-bubble-soft-video-1366x768.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\tutor-bubble-soft-video-1440x900-safe.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\tutor-bubble-transparent-video-1280x720.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\voice-tutor-balanced-layout-1800x900.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\voice-tutor-isolated-history-1280x720.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\tutor-bubble-greeting-and-hide-1280x720.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\tutor-bubble-hidden-restore-final-1280x720.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\digital-human-idle-rest-frame-1280x720.png`
- `C:\Users\Lenovo\.codex\visualizations\2026\07\30\019fb213-be96-7dc0-bf52-9adb956d8522\digital-human-pre-end-hold-1280x720.png`
