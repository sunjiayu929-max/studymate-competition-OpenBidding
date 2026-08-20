# StudyMate 后端

后端基于 FastAPI、SQLAlchemy 和 SQLite，负责认证、学习画像、课程 RAG、多智能体生成、助教对话、测验、报告、外部资源适配与在线代码运行代理。

## 目录结构

```text
backend/
├── app/
│   ├── agents/              # 画像、检索、资源生成和评估 Agent
│   ├── api/                 # FastAPI 路由
│   ├── core/                # 配置与基础设施
│   ├── db/                  # SQLAlchemy 模型与会话
│   ├── integrations/        # 人才呀、阅读直链等公开数据适配器
│   ├── schemas/             # Pydantic 请求与响应结构
│   └── main.py              # 应用入口、路由注册和开发期轻量迁移
├── resources/seed/          # Docker 脱敏压缩种子库
├── scripts/                 # 后端专用维护脚本与容器入口
├── tests/                   # 后端单元测试与请求样例
├── Dockerfile
└── requirements.txt
```

## 启动

```bash
cp ../.env.example .env
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

岗位视频片段合成依赖宿主机的 `ffmpeg`。Ubuntu/Debian 裸跑后端前安装：

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg fonts-noto-cjk
ffmpeg -version
```

使用 `docker compose` 部署时不需要单独安装；`backend/Dockerfile` 会在镜像构建阶段自动安装 `ffmpeg`。

验证：

```bash
curl http://localhost:8000/api/ping
```

安全巡检或接口验收使用专用离线启动器，不读取 `.env`：

```bash
python scripts/run_safe_offline.py \
  --database-path .runtime/studymate-safe.db \
  --private-knowledge-dir .runtime/studymate-safe-private
```

该命令可从 PowerShell、`cmd.exe` 或 bash 调用，路径以当前 `backend/` 目录为基准，也可以传入绝对路径。启动器只绑定 `127.0.0.1`/`::1`。模式在导入 `app` 前设置 `STUDYMATE_SAFE_OFFLINE=1`，因此不会加载项目 `.env`；所有模型、Embedding、语音、视觉 OCR、SMTP、外部资源解析、外部队列和 Piston 均不可用，私库 TXT 明确降级为 `ready_keyword`，进程级 socket 保险丝继续兜底阻止出站连接。不要把该开关写入 `.env`，也不要用 PowerShell 空字符串代替它。

交互式接口文档位于 `http://localhost:8000/docs`。项目维护版接口索引见 [`../docs/接口说明.md`](../docs/接口说明.md)。

## 认证与权限

- 注册流程使用邮箱验证码和密码。
- 登录成功后写入 HttpOnly `sm_session` Cookie，服务端数据库只保存令牌哈希。
- 角色包括 `student`、`judge`、`admin`。
- 普通业务接口要求登录；测试管理、埋点统计和反馈统计允许 `judge`/`admin`；反馈回复只允许系统管理员 `admin`。
- 生产环境必须配置随机 `AUTH_SECRET_KEY`、HTTPS 和 `SESSION_COOKIE_SECURE=true`。

## 数据与检索

- 默认数据库：`sqlite:///./studymate.db`。
- 首次本地裸跑时，缺少 `studymate.db` 会从 `resources/seed/studymate.db.gz` 自动初始化；已有数据库不会被覆盖。
- 当前知识库规模：5 门课程、1709 个知识块。
- 检索链路：BM25 关键词检索 + Qwen `text-embedding-v3` 1024 维语义检索，再通过 RRF 融合。
- 向量以 JSON 形式保存在 SQLite `knowledge_chunks.embedding`；当前主链路不依赖 Chroma。
- 用户私有资料存储在 `user_knowledge_bases`、`user_knowledge_documents`、`user_knowledge_chunks`，每次读写都以登录用户 `user_id` 过滤。原文件保存到 `PRIVATE_KNOWLEDGE_DIR` 的用户隔离目录，上传返回后台任务状态；解析进度、校验和、失败、中断恢复与重试次数持久化。
- 私有库支持 PDF、PPTX、DOCX、Markdown 与 TXT；没有向量服务 Key 时会明确显示 `ready_keyword`，继续提供关键词检索，不伪装向量化完成。
- 扫描 PDF 未配置 OCR 时标记 `required_unconfigured` 并保留原文件供安全重试，不伪装解析成功。当前 OCR 是明确的可插拔状态，不包含内置 OCR 引擎。
- PPT 大纲与单页重写通过受控 Qwen/DeepSeek/讯飞星火/MiMo 路由生成，注入课程 RAG 与当前用户私有库；未配置时只有显式 `allow_local_fallback=true` 才使用确定性策略。
- 数据模型包括用户、验证码、会话、画像、画像快照、课程、内置与私有知识块、资源、学习路径、练习、作答、埋点、反馈、助教会话、评估、文件夹、笔记、测验会话和测试用例。

## 外部服务

| 服务 | 用途 | 无配置时表现 |
| --- | --- | --- |
| DeepSeek / 星火 / MiMo | 主流程 LLM，可由 `LLM_PROVIDER` 选择 | 部分 Agent 使用项目兜底逻辑 |
| Qwen / DashScope | 助教、视觉理解和 Embedding | 相应真实模型能力不可用或降级 |
| 讯飞语音 | ASR 与 TTS | 语音能力返回配置提示 |
| Piston | Python、C、C++ 在线运行 | 代码运行接口不可用 |
| 哔哩哔哩 | 公开视频搜索 | 使用缓存或返回可解释错误 |
| 讯飞人才呀 | 公开课程和岗位目录 | 使用内置兜底目录 |
| arXiv / Crossref | 论文标题解析与 DOI 校验 | 不生成直链，前端保留搜索入口 |
| 豆瓣图书 / CSDN / 掘金 | 图书和博客真实详情页解析 | 不生成直链，前端保留搜索入口 |

安全离线模式下，上表全部外部服务直接视为未配置或不可用；人才呀只返回内置目录，阅读解析返回空，B 站只保留可解释的搜索入口信息，后端不会主动访问这些站点。私库任务当前是进程内 `BackgroundTasks`，没有外部队列实现。

人才呀集成只获取公开目录；知识点推荐仅发送清洗后的技术主题和课程名称。阅读解析只发送公开标题、资源类型、来源名称和语言，不发送用户标识、画像、对话历史或认证信息。岗位匹配在本地完成。

`POST /api/reading/resolve` 每次最多解析 12 个 `paper`、`book` 或 `blog` 项目，只返回经过标题相似度、主机和路径格式校验的 arXiv 摘要页、DOI、豆瓣图书页、CSDN 文章页或掘金文章页。请求并发上限为 4、单次超时 6.5 秒，成功和未命中结果均缓存 6 小时，进程内最多保留 512 项。

## 开发检查

```bash
PYTHONPYCACHEPREFIX=/tmp/studymate-pycache python -m compileall -q app scripts
python -m unittest discover -s tests -v
python -m unittest tests.test_safe_offline_mode -v
```

涉及数据库或 Docker 种子时，还应在应用根目录运行：

```bash
python scripts/build_seed_db.py
gzip -t backend/resources/seed/studymate.db.gz
```

当前 `app/main.py` 中包含 SQLite 开发期轻量迁移。正式长期维护建议引入 Alembic，并逐步移除启动时 `ALTER TABLE`。
