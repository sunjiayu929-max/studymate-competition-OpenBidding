# StudyMate 前端

前端使用 React 19、TypeScript 6、Vite 8。登录后的业务页面统一使用可折叠左侧应用壳，承载学习宇宙首页、课程空间、学习资源工坊、AI 助教、私有知识库、PPT 生成、笔记、测验、实时报告、可视讲解、学习资源与职业探索。

首页首屏是独立深色的“学习宇宙 · 实时指挥舱”：顶部显示北京时间、数据同步和当前课程，左侧明确区分个人实时数据与平台基础能力，中央以学习者核心和七颗可点击能力星球组织真实入口，右侧直接订阅 workspace store 展示 7 Agents 状态，底部只用真实笔记、测验、画像评估和工作台时间戳形成学习脉冲与近 7 日趋势。个人数据为空或单个接口失败时展示对应空态/降级，不用平台数据或测试 fixture 冒充个人成绩。进入今日学习后继续使用现有暖白工作台。

## 启动与构建

```bash
npm install
npm run dev
```

默认开发地址为 `http://localhost:5173`，`/api` 请求由 Vite 代理到本地后端。

```bash
npm run lint
npm run build
npm run preview
```

## 页面路由

| 路径 | 页面 |
| --- | --- |
| `/login` | 登录与注册 |
| `/` | 学习宇宙主舞台与今日学习桌面 |
| `/courses` | 课程空间 |
| `/profile` | 学习画像与就业技能 |
| `/workspace`、`/workspace/r/:agentId` | 学习资源工坊（7 Agents）与资源详情 |
| `/tutor`、`/tutor/voice` | 课程助教与语音助教 |
| `/knowledge` | 用户私有知识库、资料进度与内部检索测试 |
| `/rag`、`/rag/source/:chunkId` | 兼容的课程知识检索与原文上下文页，不占一级导航 |
| `/ppt` | PPT 大纲、预览编辑与可编辑 `.pptx` 导出 |
| `/notes` | 智能笔记与错题整理 |
| `/quiz`、`/quiz/:id` | 测验库、作答与回顾 |
| `/report` | 学习报告与岗位建议 |
| `/concept`、`/concept/library` | 可视讲解与动画库 |
| `/resources` | 按知识点检索真实视频与课程资源 |
| `/career` | 职业匹配与能力差距探索 |
| `/feedback` | 反馈中心 |
| `/guide` | 新手指引与功能地图 |
| `/tests` | 管理员和评委测试管理 |

除 `/login` 外，业务页面需要登录。`/tests` 只对 `judge` 和 `admin` 角色显示并开放。

## 主要目录

```text
frontend/
├── public/                  # 不经过打包处理的静态资源
├── scripts/                 # Playwright 截图等前端工具
├── src/
│   ├── components/          # 通用组件与业务组件
│   ├── components/concepts/ # 300 个可视讲解主题的注册与渲染
│   ├── lib/                 # API 客户端、类型和工具函数
│   ├── pages/               # 页面组件
│   ├── store/               # 前端状态和跨页面助教生成状态
│   └── App.tsx              # 路由入口
└── package.json
```

助教的 SSE 生成状态由模块级状态管理保持，可在页面或抽屉卸载后继续接收，并按用户与课程隔离。

全局悬浮助教与实时语音页复用 `idle / listening / thinking / speaking / paused` 状态媒体契约。`public/digital-human/` 中的多姿态人物是 AI 生成的比赛演示素材，不是视频、动作捕捉或逐音素口型；界面只做克制交叉淡化和微动，并遵循 `prefers-reduced-motion`。语音页加载时不会申请麦克风，只有用户明确点击后才可能请求权限。

可视讲解的讲课节拍注册到统一内容时间轴：TTS 可用时读取实际媒体时长，无语音配置时使用明确的文本估算；seek、逐句字幕高亮、动画定位和 0.75/1/1.25/1.5 倍速共享同一状态。普通模式继续按内容自适应，全屏使用独立布局。

PPT 大纲与单页重写调用 `/api/ppt/*`，浏览器只发送 Qwen/DeepSeek/MiMo 标识。未配置所选模型时页面明确提示，只有用户点击“明确使用本地策略”才走确定性降级，不会静默切换模型。PPTX 运行库保持按路由懒加载。

## 页面截图工具

原来散落在工作区根目录和前端根目录的 `shot.mjs` 已统一为：

```text
frontend/scripts/capture-page.mjs
```

使用前先确保前端可访问，再执行：

```bash
STUDYMATE_BASE_URL=http://localhost:5173 npm run screenshot -- / /tmp/studymate-home.png
```

如需登录态，可按脚本帮助信息提供账号参数。截图默认属于本地测试产物，不应直接提交；确定要写入正式文档后再移动到对应文档资源目录。

助教长对话可先在页面点击“长截图模式”，或直接访问 `/tutor?capture=1`，再使用浏览器整页截图：

```bash
STUDYMATE_BASE_URL=http://localhost:5173 npm run screenshot -- '/tutor?capture=1' /tmp/studymate-tutor-full.png
```

针对工作台示例、可视讲解预取、专注模式、报告预览、画像消息和外部资源空状态的隔离回归：

```bash
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion2.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion3.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion4.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion5.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion6.mjs
npm run check:timeline
npm run check:voice
npm run check:pptx
npm run check:budget
npm run check:phase3
npm run check:e2e
npm run check:universe
```

- `check-suggestion2.mjs` 覆盖示例只填入、概念预取复用、专注测验、报告预览与版本、画像消息去重和外部资源空状态。
- `check-suggestion3.mjs` 覆盖未作答标签统一、报告主题×难度热力图、资源页底部翻页、RAG 相对匹配度与拓展阅读稳定入口。
- `check-suggestion4.mjs` 覆盖画像维度计数、历史项目证据写入就业技能和雷达图更新。
- `check-suggestion5.mjs` 覆盖人才呀知识点匹配、B站真实视频直达、稳定搜索入口和报告文案。
- `check-suggestion6.mjs` 覆盖助教正文换行、长截图模式、右栏雷达填充和蛇形学习路径。
- `check:phase3` 静态核对数字人五状态媒体、响应式 WebP、语音用户手势策略、评委模式隔离恢复和落地页资源接线。
- `check:e2e` 自行启动已构建预览，以安全测试夹具覆盖登录、宇宙、课程/RAG 来源、画像首屏、可视讲解时间轴、全局助教、语音降级，以及私库、PPT、模型选择、报告和管理员数据健康页；麦克风、全屏与全部后端/外部接口均被拦截，不写正式数据。
- `check:universe` 独立覆盖北京时间、平台/个人数据区分、7 Agents、七颗能力星球、主 CTA/选课 CTA、真实空态与真实事件态、减弱动态、滚离暂停，并检查 1366×768、1440×900、1920×1080 无横向溢出。

## 开发约定

- 页面放 `src/pages/`，可复用业务模块放 `src/components/`。
- API 请求和共享类型集中放 `src/lib/`，跨页面状态放 `src/store/`。
- 新增路由时同步更新用户指引、接口说明和访问控制。
- 项目当前没有启用 React Compiler；ESLint 不继承 compiler 相关 recommended 规则，只启用 `react-hooks/rules-of-hooks` 与 `react-hooks/exhaustive-deps`。
- 提交前至少运行 `npm run lint` 与 `npm run build`。
