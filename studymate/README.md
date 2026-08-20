# StudyMate 应用

StudyMate 是面向领域岗位的个性化训练系统。用户先选择领域与目标岗位，再围绕岗位任务和能力点使用岗位知识库、多智能体资源生成、AI 岗位助教、笔记、测验、报告与画像回写完成训练闭环。当前可完整运行的岗位是“特定软件开发 · 前线部署工程师（FDE）”；其余岗位以“知识库待建设”真实展示，不提供虚假生成入口。

## 核心能力

- 7 组能力画像：知识基础、认知风格、岗位目标、薄弱能力点、训练节奏、内容偏好、就业技能。
- 岗位训练闭环：按领域映射目标岗位，由学情诊断、三类资源生成、三项独立审核和总裁决共 8 个核心 Agent 执行“诊断—生成—审核—裁决/返工—发布—反馈更新”；未越过发布门禁的资源不会进入正式资源库。详见 [`docs/岗位训练闭环使用指南.md`](docs/岗位训练闭环使用指南.md)。
- 双层知识库：岗位知识库与用户私有库共同提供可追溯证据；用户可上传 PDF/PPTX/DOCX/Markdown/TXT，并按来源页码追溯。旧有 5 个技术知识域及其 `course_id` 仅作为底层数据隔离兼容保留，不是用户选课入口。
- AI 岗位助教：按用户和岗位知识边界持久化会话，支持页面上下文、SSE 流式回复、图片理解、文件附件，以及服务端受控的 Qwen、DeepSeek、讯飞星火、MiMo 显式选择。
- PPT 生成：Qwen/DeepSeek/讯飞星火/MiMo 受控生成大纲与单页重写，复用岗位/私有知识上下文，支持引用、模板、图表页、显式本地降级，并导出元素可继续编辑的 `.pptx`。
- 岗位训练闭环：领域与岗位空间、笔记与错题、智能测验、学习报告、画像回写、埋点和反馈。
- 登录首页：单屏“学习宇宙 · 实时指挥舱”同时呈现目标岗位、个人今日状态、中央七星球入口、8 个核心 Agent 实时状态和真实学习脉冲；进入后保留暖白今日训练桌面。
- 可视讲解：按岗位能力方向组织既有 300 个确定性动画或脚本化讲解；AI 讲解支持真实/估算时长、seek、逐句高亮和 0.75～1.5 倍速。
- 外部资源：哔哩哔哩岗位能力点高相关视频、讯飞人才呀公开课程、论文/图书/博客真实详情页解析，以及本地可解释岗位推荐。
- 在线编程：通过可选 Piston 服务运行 Python、C11 和 C++17。

## 目录结构

```text
studymate/
├── backend/                 # FastAPI、SQLAlchemy、Agent、RAG 和外部集成
├── frontend/                # React 19、TypeScript、Vite
├── data/                    # 知识库原始数据和处理结果
├── docs/                    # 当前架构、接口、部署、验收和密钥文档
├── scripts/                 # 跨模块维护脚本
├── docker-compose.yml       # 本地与生产容器编排
├── Caddyfile                # 可选公网 HTTPS 入口
├── .env.example             # 后端运行配置示例
└── .deploy.env.example      # Compose 公网部署示例
```

## 本地开发

### 1. 配置后端

```bash
cp .env.example backend/.env
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

首次启动会创建或补齐本地 SQLite 表，并初始化固定演示账号。真实 API Key 只写入 `backend/.env`，不要写入仓库中的示例文件。

### 安全离线启动（巡检/验收）

需要保证 0 外联时，不要通过“把 Key 赋空字符串”模拟未配置。PowerShell 会删除空字符串环境变量，普通启动随后可能从 `backend/.env` 回读真实配置。使用后端自带的跨 shell 启动器，并显式提供隔离数据库与私库目录：

```bash
cd backend
python scripts/run_safe_offline.py \
  --database-path .runtime/studymate-safe.db \
  --private-knowledge-dir .runtime/studymate-safe-private
```

PowerShell 与 `cmd.exe` 使用同一个 Python 命令。路径以当前 `backend/` 目录为基准，也可以按需传入绝对路径。启动器会在导入应用前设置 `STUDYMATE_SAFE_OFFLINE=1`，完全跳过项目 `.env`；进程中已有的 LLM、Embedding、ASR、TTS、OCR、SMTP 和 Piston 配置也会被覆盖为不可用，并安装出站网络保险丝。它只监听环回地址，不启动 Piston，不使用真实数据库或私库目录。

`STUDYMATE_SAFE_OFFLINE` 必须通过进程环境或该启动器设置，不要写入 `backend/.env`。普通开发模式保持原有启动方式。

### 2. 启动前端

另开终端：

```bash
cd frontend
npm install
npm run dev
```

默认访问地址：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:8000/api/ping`
- OpenAPI 文档：`http://localhost:8000/docs`

### 3. 可选代码运行服务

```bash
docker compose --profile code-runner up -d piston-api
bash scripts/init-piston.sh
```

初始化脚本会安装 Python 3.10、C/C++ runtime，并按 `scripts/piston_python_libs.txt` 补齐固定版本的 `scikit-learn`、`matplotlib`、`seaborn`、`pillow`、`pandas`、`networkx`（官方 runtime 已含 NumPy/SciPy）。本地直接运行后端时，`.env` 中的 `PISTON_URL` 默认使用 `http://127.0.0.1:2000`。

## Docker 启动

```bash
cp .env.example backend/.env
docker compose up -d --build
docker compose ps
curl http://localhost:8000/api/ping
```

常用可选 Profile：

```bash
# 增加在线代码运行
docker compose --profile code-runner up -d --build

# 增加 Caddy 公网入口，需先配置 .deploy.env
docker compose --env-file .deploy.env --profile public --profile code-runner up -d --build

# 启动 PostgreSQL、Redis、Chroma 预留服务
docker compose --profile extras up -d
```

生产环境启用独立 AI 面试服务时，使用统一编排脚本。它会先启动主项目创建共享网络，再启动相邻的 `../ai-interview` Compose 项目；不会把面试 MySQL 合并到主系统：

```bash
# .deploy.env 设置 AI_INTERVIEW_ENABLED=1 后执行
bash scripts/deploy.sh preflight
bash scripts/deploy.sh up
```

浏览器入口固定为 `https://matropic.cn/interview/`。完整的服务器目录、环境变量、备份和验收步骤见 [`docs/AI面试部署指南.md`](docs/AI面试部署指南.md)。

当前业务基线仍使用 SQLite。`extras` 中的 PostgreSQL、Redis、Chroma 是扩展服务，不代表应用已经切换到这些存储。

## 数据库与演示种子

- 本地运行库：`backend/studymate.db`，由 Git 忽略。
- Docker 提交用种子：`backend/resources/seed/studymate.db.gz`。
- 本地裸跑时，如果 `backend/studymate.db` 不存在，会自动从上述种子库初始化；已有数据库不会覆盖。
- 容器首次发现 `/app/data/studymate.db` 不存在时，会解压种子库；已有数据卷不会被镜像更新覆盖。
- 重新生成脱敏种子库：

```bash
python scripts/build_seed_db.py
```

种子生成脚本会只保留获准的演示账号，清空认证会话和验证码，并执行 SQLite 外键与完整性检查；展示用助教会话和学习事件按演示数据保留。详见 [`backend/resources/seed/README.md`](backend/resources/seed/README.md)。

## 常用验证

```bash
# 后端
cd backend
PYTHONPYCACHEPREFIX=/tmp/studymate-pycache python -m compileall -q app scripts
python -m unittest discover -s tests -v
python -m unittest tests.test_safe_offline_mode -v

# 前端
cd ../frontend
npm run lint
npm run build
node --check scripts/capture-page.mjs
node --experimental-strip-types scripts/check-phase2-timeline.mjs
node scripts/check-pptx-export.mjs
node scripts/check-build-budget.mjs
npm run check:phase3
npm run check:e2e
npm run check:universe
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion2.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion3.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion4.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion5.mjs
STUDYMATE_BASE_URL=http://127.0.0.1:5173 node scripts/check-suggestion6.mjs

# Compose
cd ..
docker compose config --quiet

# 工作区结构与文档链接
PYTHONDONTWRITEBYTECODE=1 python scripts/check_workspace_structure.py
```

完整检查清单见 [`docs/开发与验收指南.md`](docs/开发与验收指南.md)。

## 文档导航

- [`docs/系统架构.md`](docs/系统架构.md)：模块、数据流、权限与外部依赖。
- [`docs/接口说明.md`](docs/接口说明.md)：接口分组、认证方式和角色边界。
- [`docs/开发与验收指南.md`](docs/开发与验收指南.md)：开发规范与交付前核查。
- [`docs/Ubuntu部署指南.md`](docs/Ubuntu部署指南.md)：服务器部署、升级、备份和排障。
- [`docs/AI面试部署指南.md`](docs/AI面试部署指南.md)：同域 AI 面试服务部署、验收与备份。
- [`docs/密钥管理指南.md`](docs/密钥管理指南.md)：密钥配置、轮换和泄露处理。
- [`frontend/README.md`](frontend/README.md)：前端开发和截图工具。
- [`backend/README.md`](backend/README.md)：后端模块和运行说明。

## 安全提醒

- 不要提交 `backend/.env`、`.deploy.env`、数据库备份、日志、Cookie 或 API Key 清单。
- 安全巡检统一使用 `backend/scripts/run_safe_offline.py`，不要依赖清空环境变量，也不要从项目 `.env` 所在目录做普通启动。
- 生产环境必须设置随机 `AUTH_SECRET_KEY`，启用 `SESSION_COOKIE_SECURE=true`，并使用 HTTPS。
- 任何曾进入聊天、共享文档或他人设备的 Key 都应在服务商控制台撤销后重新创建。
