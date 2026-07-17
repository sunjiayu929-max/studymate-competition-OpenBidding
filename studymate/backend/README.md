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

验证：

```bash
curl http://localhost:8000/api/ping
```

交互式接口文档位于 `http://localhost:8000/docs`。项目维护版接口索引见 [`../docs/接口说明.md`](../docs/接口说明.md)。

## 认证与权限

- 注册流程使用邮箱验证码和密码。
- 登录成功后写入 HttpOnly `sm_session` Cookie，服务端数据库只保存令牌哈希。
- 角色包括 `student`、`judge`、`admin`。
- 普通业务接口要求登录；测试管理、埋点统计和反馈统计允许 `judge`/`admin`；反馈回复只允许系统管理员 `admin`。
- 生产环境必须配置随机 `AUTH_SECRET_KEY`、HTTPS 和 `SESSION_COOKIE_SECURE=true`。

## 数据与检索

- 默认数据库：`sqlite:///./studymate.db`。
- 当前知识库规模：5 门课程、938 个知识块。
- 检索链路：BM25 关键词检索 + Qwen `text-embedding-v3` 1024 维语义检索，再通过 RRF 融合。
- 向量以 JSON 形式保存在 SQLite `knowledge_chunks.embedding`；当前主链路不依赖 Chroma。
- 数据模型包括用户、验证码、会话、画像、画像快照、课程、知识块、资源、学习路径、练习、作答、埋点、反馈、助教会话、评估、文件夹、笔记、测验会话和测试用例。

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

人才呀集成只获取公开目录；知识点推荐仅发送清洗后的技术主题和课程名称。阅读解析只发送公开标题、资源类型、来源名称和语言，不发送用户标识、画像、对话历史或认证信息。岗位匹配在本地完成。

`POST /api/reading/resolve` 每次最多解析 12 个 `paper`、`book` 或 `blog` 项目，只返回经过标题相似度、主机和路径格式校验的 arXiv 摘要页、DOI、豆瓣图书页、CSDN 文章页或掘金文章页。请求并发上限为 4、单次超时 6.5 秒，成功和未命中结果均缓存 6 小时，进程内最多保留 512 项。

## 开发检查

```bash
PYTHONPYCACHEPREFIX=/tmp/studymate-pycache python -m compileall -q app scripts
python -m unittest discover -s tests -v
```

涉及数据库或 Docker 种子时，还应在应用根目录运行：

```bash
python scripts/build_seed_db.py
gzip -t backend/resources/seed/studymate.db.gz
```

当前 `app/main.py` 中包含 SQLite 开发期轻量迁移。正式长期维护建议引入 Alembic，并逐步移除启动时 `ALTER TABLE`。
