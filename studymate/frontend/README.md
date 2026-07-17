# StudyMate 前端

前端使用 React 19、TypeScript 6、Vite 8，承载课程空间、学习画像、多智能体工作台、AI 助教、RAG 检索、笔记、测验、报告、可视讲解、反馈和管理测试页面。

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
| `/` | 今日学习与首页 |
| `/courses` | 课程空间 |
| `/profile` | 学习画像与就业技能 |
| `/workspace`、`/workspace/r/:agentId` | 多智能体生成记录与资源详情 |
| `/tutor`、`/tutor/voice` | 课程助教与语音助教 |
| `/rag`、`/rag/source/:chunkId` | 课程知识检索与原文追溯 |
| `/notes` | 智能笔记与错题整理 |
| `/quiz`、`/quiz/:id` | 测验库、作答与回顾 |
| `/report` | 学习报告与岗位建议 |
| `/concept`、`/concept/library` | 可视讲解与动画库 |
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

针对工作台示例、可视讲解预取、专注模式、报告预览、画像消息和外部资源空状态的隔离回归：

```bash
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion2.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion3.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion4.mjs
```

- `check-suggestion2.mjs` 覆盖示例只填入、概念预取复用、专注测验、报告预览与版本、画像消息去重和外部资源空状态。
- `check-suggestion3.mjs` 覆盖未作答标签统一、报告主题×难度热力图、资源页底部翻页、RAG 相对匹配度与拓展阅读稳定入口。
- `check-suggestion4.mjs` 覆盖画像维度计数、历史项目证据写入就业技能和雷达图更新。

## 开发约定

- 页面放 `src/pages/`，可复用业务模块放 `src/components/`。
- API 请求和共享类型集中放 `src/lib/`，跨页面状态放 `src/store/`。
- 新增路由时同步更新用户指引、接口说明和访问控制。
- 项目当前没有启用 React Compiler，因此 ESLint 只关闭 `refs`、`set-state-in-effect` 和 `preserve-manual-memoization` 三条编译器专用规则；Hooks 调用顺序与 `exhaustive-deps` 依赖检查继续启用。
- 提交前至少运行 `npm run lint` 与 `npm run build`。
