# AI 面试生产部署指南

本文针对当前服务器和域名：`deploy@121.40.64.199`、`matropic.cn`。AI 面试保留独立 Flask + MySQL Compose 项目，但通过 StudyMate 的同一 Caddy 入口发布，不需要新增域名、DNS 记录、证书或公网端口。

> 当前服务器实况（2026-08-27）：Caddy 使用宿主机标准 `80/443` 映射，公网 `https://matropic.cn/`、`/api/ping` 和 `/interview/health` 探针正常。学习者入口是带一次性 ticket 的 `/interview/integrations/studymate/launch?...`，`/interview/` 根路径按白名单返回 `404`，不要把它作为面试首页。生产环境必须关闭固定演示种子（`SEED_DEMO_USERS=0`）。

代码审查期间曾发现一次 Caddy `SITE_ADDRESS` 漂移导致 HTTPS 短时不可用；当前已恢复。部署脚本现在会拒绝 Shell 环境覆盖 `.deploy.env`，并校验最终 Compose 配置。线上验收仍需使用授权学习者账号完成一次完整面试闭环。

## 发布边界

```text
https://matropic.cn/
  ├── /                         StudyMate 前端与 FastAPI
  └── /interview/*               StudyMate 学习者 AI 面试流（由 ticket 启动）
      ├── /integrations/...     一次性启动票据
      ├── /practice/...         面试准备与作答页面
      ├── /api/practice/...     面试会话、答案和报告
      ├── /api/speech/asr-url   短时语音识别凭据
      └── /static/...           面试前端资源

StudyMate backend <--签名 HTTP--> ai-interview <---> 独立 MySQL
```

主项目 Caddy 会拒绝其余 `/interview/*` 请求。原项目保留的求职者/企业 legacy 页面使用根路径和 `/api`，尚未完成命名空间改造，不能在 `matropic.cn` 同域直接公开。这不会影响 StudyMate 中“创建岗位面试 -> 作答 -> 回写能力报告”的学习者流程。

## 服务器目录

生产服务器使用两个并列目录，分别承载独立 Compose 项目：

```text
/home/deploy/
  ├── studymate/       # 主项目：Caddy、frontend、backend、Piston
  └── ai-interview/    # 面试服务：Flask、独立 MySQL、上传卷
```

两个项目仅通过 Docker 网络 `studymate_edge` 互通。面试 MySQL 不加入该共享网络，且不暴露宿主机端口。

## 首次上传

在开发机的 `StudyMate` 父目录执行。以下命令不会上传 Git 元数据、本地数据库、依赖目录或真实环境文件：

```bash
rsync -az --delete --progress \
  --exclude '.git/' \
  --exclude '.agents/' \
  --exclude '.codex/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '*.db' \
  --exclude 'frontend/node_modules/' \
  --exclude 'frontend/test-results/' \
  --exclude 'backend/.venv/' \
  --exclude 'backend/.env' \
  --exclude 'backend/backups/' \
  --exclude 'backend/studymate.db' \
  --exclude 'backups/' \
  --exclude '.deploy.env' \
  --exclude '*.log' \
  ./studymate/ studymate-server:/home/deploy/studymate/

rsync -az --delete --progress \
  --exclude '.git/' \
  --exclude '.idea/' \
  --exclude '.env' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude 'uploads/' \
  --exclude '*.log' \
  ./ai-interview/ studymate-server:/home/deploy/ai-interview/
```

不要用 `rsync --delete` 覆盖服务器上的 `backend/.env`、`.deploy.env` 或 `ai-interview/.env`。首次上传前先在服务器创建目录；后续更新保持相同目录结构即可。

## 生产配置

在服务器创建并收紧环境文件权限：

```bash
cd /home/deploy/studymate
cp .deploy.env.example .deploy.env
cp .env.example backend/.env
cd /home/deploy/ai-interview
cp .env.example .env
chmod 600 /home/deploy/studymate/.deploy.env \
  /home/deploy/studymate/backend/.env \
  /home/deploy/ai-interview/.env
```

`/home/deploy/studymate/.deploy.env` 的关键项：

```dotenv
COMPOSE_PROFILES=public,code-runner
SITE_ADDRESS=matropic.cn
AI_INTERVIEW_ENABLED=1
AI_INTERVIEW_DIR=../ai-interview
SEED_DEMO_USERS=0
# 无 Git 元数据的部署目录必须记录 CI 产物提交号或镜像 digest：
# DEPLOY_SOURCE_REVISION=release-commit-or-image-digest
HTTP_PORT=80
HTTPS_PORT=443
# 服务器无法访问 Docker Hub 时，填写可达的可信镜像或本地镜像名：
# CADDY_IMAGE=...
# PYTHON_IMAGE=...
# NODE_IMAGE=...
# NGINX_IMAGE=...
```

`/home/deploy/studymate/backend/.env` 除现有生产配置外，必须有：

```dotenv
CORS_ORIGINS=https://matropic.cn
SESSION_COOKIE_SECURE=true
AI_INTERVIEW_PUBLIC_URL=https://matropic.cn/interview
AI_INTERVIEW_SERVICE_SECRET=在密码管理器生成的随机长密钥
```

`/home/deploy/ai-interview/.env` 必须有：

```dotenv
FLASK_SECRET_KEY=与主系统不同的随机长密钥
MYSQL_PASSWORD=独立的强密码
MYSQL_ROOT_PASSWORD=另一个独立的强密码
PUBLIC_BASE_PATH=/interview
SESSION_COOKIE_SECURE=1
SESSION_COOKIE_NAME=ai_interview_session
STUDYMATE_API_URL=http://backend:8000
STUDYMATE_SERVICE_SECRET=与 backend/.env 的 AI_INTERVIEW_SERVICE_SECRET 完全相同
LLM_API_KEY=生产模型密钥
PRACTICE_RESUME_ENABLED=0
PRACTICE_AVATAR_MODEL=role_yskg.glb
# 服务器无法访问 Docker Hub 时：
# PYTHON_IMAGE=...
# MYSQL_IMAGE=...
```

保持 `DATABASE_URL` 为空即可由面试 Compose 根据 MySQL 配置生成连接串。应用首版公开的是 StudyMate 学习者的岗位模拟面试、语音交互和评估报告；`PRACTICE_RESUME_ENABLED=0` 时准备页面不显示简历上传入口，但相关表和 API 为兼容性保留。`PRACTICE_AVATAR_MODEL` 可指定经过授权且兼容的静态 GLB 文件名。`LLM_API_KEY` 为空时可以演示问答页面，但不会生成可回写的岗位能力报告。不要将任何真实值写入仓库、Shell 历史、截图或部署日志。

## 部署与健康检查

从主项目目录执行：

```bash
cd /home/deploy/studymate
bash scripts/deploy.sh preflight
bash scripts/deploy.sh up
```

`preflight` 会在不启动或重启容器的前提下检查：目录存在、关键密钥已填写、双方共享密钥相同、公开地址为 `https://matropic.cn/interview`、Cookie 前缀为 `/interview`、AI 服务回调地址为 `http://backend:8000`，以及最终 Compose 配置没有被 Shell 环境覆盖。若部署目录没有 Git 元数据，还必须提供 `DEPLOY_SOURCE_REVISION`。

`up` 先启动主项目以创建共享网络，再启动 AI 面试 Compose 并等待 `studymate-ai-interview` 变为 `healthy`。常用排障命令：

```bash
cd /home/deploy/studymate
bash scripts/deploy.sh status
bash scripts/deploy.sh logs
bash scripts/deploy.sh ai-logs

curl -fsS https://matropic.cn/api/ping
curl -fsS https://matropic.cn/interview/health
curl -s -o /dev/null -w '%{http_code}\n' https://matropic.cn/interview/api/practice/context
curl -s -o /dev/null -w '%{http_code}\n' https://matropic.cn/interview
curl -s -o /dev/null -w '%{http_code}\n' https://matropic.cn/interview/loginView
```

健康检查应返回 JSON；未登录的 `/interview/api/practice/context` 应返回 `401`；`/interview` 应返回 `308` 到 `/interview/`；`/interview/loginView` 应返回 `404`，证明 legacy 路由没有被误公开。静态资源只允许岗位模拟面试所需的 practice 脚本、Three.js 模型加载器、GLB 模型和 UMD 音频处理包。

最后以真实学习者账号进入 AI 面试页面，选择岗位并启动一次会话，确认浏览器落在 `https://matropic.cn/interview/integrations/studymate/launch?...`，且提交作答后主系统的面试记录状态和报告正确更新。

## 更新、备份与回滚

每次更新前先备份主系统 SQLite、私有知识库、AI MySQL 和面试上传文件。主系统 SQLite 备份方式见 [Ubuntu 部署指南](Ubuntu部署指南.md#61-备份-sqlite)。AI 服务可执行：

```bash
mkdir -p /home/deploy/studymate-backups
docker exec studymate-ai-interview-db sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump --single-transaction --routines --events -u root ai_interview' \
  > /home/deploy/studymate-backups/ai-interview-$(date +%F_%H%M%S).sql
docker cp studymate-ai-interview:/app/uploads \
  /home/deploy/studymate-backups/ai-interview-uploads-$(date +%F_%H%M%S)
chmod 600 /home/deploy/studymate-backups/ai-interview-*.sql
chmod -R go-rwx /home/deploy/studymate-backups/ai-interview-uploads-*
```

更新代码后重新执行 `preflight` 和 `up`。两套 Compose 都使用命名卷，普通 `up -d --build` 不会删除数据。不要使用 `docker compose down -v`；`-v` 会删除面试 MySQL、上传文件或主系统 SQLite 数据。应用版本回滚应还原到已验证的源码提交或镜像，而不是删除卷。
