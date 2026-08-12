# StudyMate 工作区协作规则

本文件是本仓库中供 Codex、Claude Code 等开发代理共同读取的项目规则。`AGENTS.md` 为普通文件；Claude Code 可在同目录下创建 `CLAUDE.md` 软链接或复制本文件，在 Windows 上直接复制即可。

## 项目边界

- 仓库根目录是竞赛工作区，可独立运行的应用根目录是 `studymate/`。
- 赛题、参赛材料、当前项目资料和交付文档放在 `docs/`。
- 运行代码、部署配置和应用维护文档放在 `studymate/`。
- 模块专用工具跟随模块放置：前端工具放 `frontend/scripts/`，后端工具放 `backend/scripts/`，跨服务工具放 `studymate/scripts/`。
- 本仓库根目录即 `studymate/` 的上层目录，其下 `studymate/` 为可独立运行的应用。
- 外层竞赛目录为本仓库的上层目录；`StudyMate-Doc` 等并列目录不在本仓库内。

## 密钥与本地状态

- 不提交、不输出 `.env`、`.deploy.env`、API Key、SMTP 凭据、Cookie 或历史密钥清单中的真实值。
- 只提交 `.env.example` 和 `.deploy.env.example` 这类无真实凭据的示例文件。
- 本地数据库、日志、缓存、构建产物、备份和测试结果必须保持在 Git 忽略范围内。
- `studymate/backend/studymate.db` 是本地运行库，不得直接作为 Docker 镜像中提交的种子库。
- 密钥使用与轮换规则见 `studymate/docs/密钥管理指南.md`。

## 本地裸跑与 Docker 演示种子库

- 提交用种子库是 `studymate/backend/resources/seed/studymate.db.gz`，由 `studymate/scripts/build_seed_db.py` 脱敏、校验并压缩生成。
- 本地裸跑（`python run.py` 或 `uvicorn app.main:app`）首启时，若本地库不存在或课程与知识块为空，会自动从种子库解压播种，clone 后开箱即用；已有数据的库不会被覆盖。
- Docker 后端镜像只复制压缩种子库，容器入口 `docker_entrypoint.py` 在空数据卷首启时解压到 `/app/data/studymate.db`；已有数据库不会被镜像更新隐式覆盖。
- 更新种子库命令：`cd studymate && python scripts/build_seed_db.py`。
- 生成程序必须只保留获准的演示账号、清空认证状态，并通过 SQLite 外键与完整性检查后才替换压缩文件。
- 已部署的 `/app/data/studymate.db` 属于持久化数据，镜像更新不得隐式覆盖；删除数据卷属于破坏性操作，必须由用户明确执行。

## 文档规则

- 当前用法与结构写入各级 `README.md` 和 `studymate/docs/`；已经被现行实现完全取代的文档直接删除，必要的当前结论合并到 `plan.md` 或专题文档。
- 路径、环境变量、Docker 行为或命令变化时，同步更新对应 README、`studymate/docs/Ubuntu部署指南.md` 和相关专题文档。
- `docs/项目开发相关/plan.md` 只记录当前状态和待办，不替代启动、部署或接口说明。
- 项目自有文档优先使用中文；代码、命令、环境变量和标准文件名保留原文。
- 赛事原文、官方模板和外部参考资料属于来源材料，不擅自改写其正文，只在 `docs/README.md` 中说明用途。

## 验证要求

- 后端 Python 变更：至少编译检查改动模块，运行 `python -m unittest discover -s tests -v`，并执行相关接口冒烟测试。
- 前端变更：在工作树允许时运行 ESLint 和 `npm run build`。
- 前端当前未启用 React Compiler；保留 Hooks 调用顺序和 `exhaustive-deps` 检查，不要在没有独立迁移与动画回归验证时重新启用编译器专用规则。
- Docker 或种子库变更：运行种子库生成、`gzip -t`、SQLite 完整性检查以及空数据卷启动验证。
- 文档变更：检查 Markdown 本地链接、失效路径、环境变量名称和生成版 DOCX/PDF。
- 结构收尾：运行 `cd studymate && PYTHONDONTWRITEBYTECODE=1 python scripts/check_workspace_structure.py`。
- 保留脏工作树中与当前任务无关的用户改动，不擅自回退或覆盖。
