# StudyMate：个性化学习多智能体系统

StudyMate 是面向高校计算机类课程的个性化学习平台，将学习画像、课程知识库、多智能体资源生成、AI 助教、智能测验、学习报告、可视化讲解和就业能力建议连接成完整学习闭环。

- 在线演示：[https://matropic.cn](https://matropic.cn)
- 应用目录：[`studymate/`](studymate/)
- 应用使用说明：[`studymate/README.md`](studymate/README.md)
- 项目与赛事资料：[`docs/`](docs/)

## 核心能力

- 个性化学习画像：覆盖知识基础、认知风格、目标、薄弱点、节奏、内容偏好和就业技能。
- 多智能体学习资源：协同生成讲解文档、思维导图、题目、代码案例、学习路径和拓展阅读。
- 课程 RAG：内置 5 门基础课程、938 个知识块及检索向量，支持混合检索和原文追溯。
- AI 课程助教：支持课程上下文、持续会话、图片与文件附件、流式回复。
- 学习闭环：课程空间、笔记、错题、测验、报告、画像回写、反馈与学习记录。
- 可视化讲解：覆盖机器学习、数据结构与算法、操作系统、计算机网络和计算机组成原理。
- 外部学习资源：支持哔哩哔哩、讯飞人才呀，以及论文、图书和技术博客真实详情页解析。
- 在线编程：可选接入 Piston，运行 Python、C11 和 C++17。

## 快速启动

仓库根目录保存竞赛资料和交付文档，可独立运行的应用位于 `studymate/`。

```bash
git clone https://github.com/Hajicong/studymate.git
cd studymate/studymate
cp .env.example backend/.env
docker compose up -d --build
```

启动后访问：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:8000/api/ping`
- OpenAPI：`http://localhost:8000/docs`

需要在线代码运行时：

```bash
docker compose --profile code-runner up -d --build
```

## 开箱即用的演示数据

后端镜像携带经过脱敏和完整性校验的压缩 SQLite 种子库。首次使用空数据卷启动时，会自动初始化：

- 34 个固定演示账号：1 个管理员、10 个评委、15 个编号测试账号、8 个学生；
- 5 门基础课程；
- 938 个包含正文和检索向量的知识块；
- 演示画像、评估、笔记、资源和测验数据。

账号只保存 Argon2 密码哈希，种子库不包含登录会话、邮箱验证码、Cookie、API Key 或 SMTP 凭据。已有 Docker 数据卷不会被镜像更新覆盖。

种子库说明见 [`studymate/backend/resources/seed/README.md`](studymate/backend/resources/seed/README.md)。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite、Tailwind CSS、Framer Motion |
| 后端 | FastAPI、SQLAlchemy Async、SQLite、OpenAI 兼容 SDK |
| 智能体与检索 | 多 Agent 协作、BM25、向量检索、RRF 融合 |
| 部署 | Docker Compose、Nginx、Caddy，可选 Piston |

## 目录结构

```text
.
├── docs/                     # 赛事资料、项目资料和交付文档
└── studymate/                # 可独立运行的应用
    ├── backend/              # FastAPI、Agent、RAG、数据库和外部集成
    ├── frontend/             # React 前端
    ├── data/                 # 知识库原始数据与处理结果
    ├── docs/                 # 架构、接口、部署、验收与密钥管理
    ├── scripts/              # 跨模块维护和部署工具
    └── docker-compose.yml    # 容器编排入口
```

### 本机路径说明

- 规范路径：`/home/ysc/work/Project/Competition/Software Cup/StudyMate`
- 历史路径 `compitition` 已在 Codex 会话迁移后删除；请统一使用规范路径
- 外层目录 `Competition/Software Cup/` 下还可并列放置 `StudyMate-Doc` 等非本仓库内容

## 文档导航

- [系统架构](studymate/docs/系统架构.md)
- [接口说明](studymate/docs/接口说明.md)
- [开发与验收指南](studymate/docs/开发与验收指南.md)
- [Ubuntu 部署指南](studymate/docs/Ubuntu部署指南.md)
- [密钥管理指南](studymate/docs/密钥管理指南.md)
- [竞赛资料索引](docs/README.md)

## 安全说明

- 不提交 `.env`、`.deploy.env`、本地运行数据库、数据库备份、日志、Cookie 或真实密钥。
- Docker 只分发 `studymate/backend/resources/seed/studymate.db.gz` 脱敏种子库。
- 公网部署前应设置独立的生产密钥、启用 HTTPS，并更换公开演示账号的密码。
