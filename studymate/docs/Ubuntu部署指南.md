# 因材智训 Ubuntu 公网部署指南

> 最后核对：2026-08-20。本文对应当前 `docker-compose.yml`、压缩种子库、Caddy 和独立 AI 面试服务部署方式。
> 开始前先阅读 [`密钥管理指南.md`](密钥管理指南.md) 和 [`开发与验收指南.md`](开发与验收指南.md)。
>
> 当前服务器实况（2026-08-23）：生产 Caddy 已恢复宿主机标准 `80/443` 映射，公网入口已完成基本验收；历史端口切换和恢复过程见 [`部署说明与更新记录.md`](部署说明与更新记录.md)。

## 方案

生产请求链路：

```text
浏览器 -> Caddy :80/:443 -> frontend nginx -> /api -> FastAPI -> SQLite/Piston
                    └-> /interview/* -> 独立 ai-interview -> 独立 MySQL
                    └-> /oj/* -> 独立 Hydro Web -> HydroJudge/MongoDB
```

Caddy 自动申请、续期 HTTPS 证书。FastAPI、前端排障端口和 Piston 都只绑定
`127.0.0.1`，云安全组无需开放这些端口。

默认业务数据库是 SQLite。PostgreSQL、Redis 和 Chroma 属于 `extras` 扩展服务，当前部署不需要启动。
AI 面试服务也不与主业务数据库共享数据，它使用同域路径 `https://matropic.cn/interview/*` 和独立 Compose 项目，学习者从带 ticket 的启动地址进入。详细配置见 [AI 面试部署指南](AI面试部署指南.md)。
在线判题服务同样不与主业务数据库共享数据，使用 `../oj` Submodule 的独立 Compose 项目。StudyMate 侧栏通过一次性 ticket 进入 `https://matropic.cn/oj/`，Hydro Web 通过 `studymate_edge` 调用 StudyMate 内部兑换接口。OJ 的 MongoDB、HydroJudge 和测试数据只加入 OJ 私有网络。

## 1. DNS 与端口

将备案域名的 A 记录指向服务器公网 IPv4。服务器安全组和 Ubuntu 防火墙只开放：

- `22/tcp`：SSH，建议限制为维护人员公网 IP。
- `80/tcp`：Caddy HTTP 验证和 HTTPS 跳转。
- `443/tcp`：HTTPS。

不要开放 `2000/5173/8000/5432/6379/8001`。

Ubuntu 防火墙示例：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 2. 安装 Docker Engine + Compose

使用 [Docker 官方 Ubuntu 安装说明](https://docs.docker.com/engine/install/ubuntu/)中的 Deb822 软件源格式：

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

退出 SSH 并重新登录，然后确认：

```bash
docker --version
docker compose version
```

### 中国大陆镜像加速

如果 `docker pull` 访问 Docker Hub 超时，优先使用云厂商账号下的专属镜像加速地址。
下面的公共地址只作为候选示例，可用性和供应链可信度会变化，使用前应重新核对；
如果 `/etc/docker/daemon.json` 已有其他配置，需要合并字段，不要直接覆盖：

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1ms.run",
    "https://dockerproxy.net"
  ],
  "log-driver": "local",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5"
  }
}
```

如果阿里云容器镜像服务控制台提供了账号专属的
`https://xxxx.mirror.aliyuncs.com`，应优先只使用该地址。阿里云通用 Registry 地址
不是 Docker Hub 公共加速地址，不能直接替代这个专属 URL。

修改后校验并重启：

```bash
sudo dockerd --validate --config-file /etc/docker/daemon.json
sudo systemctl restart docker
docker info --format '{{json .RegistryConfig.Mirrors}}'
docker pull alpine:3.20
```

这些 mirror 主要解决 Docker Hub。Piston 位于 GHCR；如果 Docker daemon 仍无法访问
GHCR，但宿主机 `curl` 可以联网，可使用项目提供的 Skopeo 导入脚本：

```bash
sudo apt update
sudo apt install -y skopeo
bash scripts/import-piston-image.sh
```

导入完成后 Compose 仍使用原始镜像名，不需要改 `docker-compose.yml`。

## 3. 上传项目

服务器：

```bash
mkdir -p ~/studymate
```

开发机在仓库根目录执行：

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
  ./studymate/ USER@SERVER_IP:~/studymate/
```

`backend/resources/seed/studymate.db.gz` 是镜像所需的脱敏演示种子库，会随项目正常
上传。`backend/studymate.db` 是开发机本地运行库，不应上传。

如果知识库或演示账号发生变化，上传前在开发机的 `studymate/` 目录刷新种子库：

```bash
python scripts/build_seed_db.py
gzip -t backend/resources/seed/studymate.db.gz
```

使用 SCP/SFTP 单独上传生产 `backend/.env`，然后执行：

```bash
chmod 600 ~/studymate/backend/.env
```

上传后核对，不应出现本地运行库、虚拟环境或真实环境文件的多余副本：

```bash
cd ~/studymate
test -f backend/resources/seed/studymate.db.gz
gzip -t backend/resources/seed/studymate.db.gz
test ! -f backend/studymate.db
```

## 4. 设置域名

服务器上：

```bash
cd ~/studymate
cp .deploy.env.example .deploy.env
```

编辑 `.deploy.env`：

```dotenv
COMPOSE_PROFILES=public,code-runner
SITE_ADDRESS=你的备案域名
HTTP_PORT=80
HTTPS_PORT=443
```

编辑 `backend/.env`：

```dotenv
CORS_ORIGINS=https://你的备案域名
AUTH_SECRET_KEY=使用密码管理器生成的高强度随机值
SESSION_COOKIE_SECURE=true
PRIVATE_KNOWLEDGE_DIR=./data/private_knowledge
PRIVATE_KNOWLEDGE_OCR_MODE=unconfigured
```

启用 AI 面试时，再按 [AI 面试部署指南](AI面试部署指南.md) 配置相邻的
`~/ai-interview/.env`，并在 `~/studymate/.deploy.env` 增加：

```dotenv
AI_INTERVIEW_ENABLED=1
AI_INTERVIEW_DIR=../ai-interview
OJ_ENABLED=1
OJ_DIR=../oj
```

如果同时使用主域名和 `www`，将两个 HTTPS 来源都写入 `CORS_ORIGINS`，逗号分隔。
模型、语音、邮件、Piston 和 OJ 变量按各自 `.env.example` 配置；没有启用的服务保持空值，不要复制其他环境中的旧 Key。
私有知识库原文件默认保存在 `/app/data/private_knowledge`，与 SQLite 共用
`studymate_backend_data` 命名卷，因此容器重建不会丢失。未接入 OCR 服务时应保持
`PRIVATE_KNOWLEDGE_OCR_MODE=unconfigured`，扫描版 PDF 会进入可观察的失败状态，
不会被当作解析成功。

安全巡检不要通过清空环境变量启动生产 Compose。需要在服务器上做 0 外联的本地接口检查时，
应停止使用生产入口，改在独立目录中通过 `backend/scripts/run_safe_offline.py` 启动，并显式
传入隔离 SQLite 文件和私有资料目录。`STUDYMATE_SAFE_OFFLINE=1` 必须由该启动器或进程
环境在导入应用前设置，不能写入 `backend/.env`；该模式完全跳过 `.env`、只绑定环回地址，
并禁用模型、Embedding、语音、OCR、SMTP、公开站点解析和 Piston。它是巡检工具，不是生产
部署 Profile。

## 5. 一键部署

```bash
cd ~/studymate
bash scripts/deploy.sh preflight
bash scripts/deploy.sh
```

脚本会构建镜像、启动服务并初始化 Piston 的 Python/C/C++ runtime；启用 OJ 后还会启动 `/home/deploy/oj` 的 Hydro Web、HydroJudge 和 MongoDB。Python runtime 还会按 `scripts/piston_python_libs.txt` 补齐固定版本的 `scikit-learn`、`matplotlib`、`seaborn`、`pillow`、`pandas`、`networkx`，与后端 `/api/run/capabilities` 白名单一致。

如果服务器也无法访问 Docker Hub/GHCR，可先配置可信的 Docker registry mirror，
或者把已经 `docker load` 的镜像名称写入 `.deploy.env` 中的 `CADDY_IMAGE`、
`PISTON_IMAGE`、`PYTHON_IMAGE`、`NODE_IMAGE` 和 `NGINX_IMAGE`。项目 Dockerfile
已支持这些覆盖项，不需要改源码。

检查状态和日志：

```bash
bash scripts/deploy.sh status
bash scripts/deploy.sh logs
```

验证：

```bash
curl -I https://你的备案域名
curl https://你的备案域名/api/ping
curl https://你的备案域名/interview/health
curl -I https://你的备案域名/oj/
```

第一次上线还要手动检查登录、SSE 流式回答、文件上传、语音和在线代码运行。
OJ 首次上线还要检查因材智训侧栏入口、自动登录、HydroJudge 注册和至少一道 Python/C++ 题目的完整提交链路。

还应检查外部资源的降级行为：

- 人才呀课程接口返回 `live`、`cache` 或 `fallback` 来源状态，以及 `exact`、`related`、`course` 或 `fallback` 匹配级别；只有岗位能力点级匹配才展示卡片。
- 岗位推荐返回匹配分数、优势和差距，且服务器日志中不应出现向第三方发送个人画像。
- 哔哩哔哩没有高相关卡片或搜索失败时，只显示精确搜索入口，不应阻塞工作台和可视讲解主流程。

## 6. 更新与数据保护

上传新代码后仍执行：

```bash
bash scripts/deploy.sh
```

脚本使用 `docker compose up` 重建容器，不会删除命名卷。不要执行：

```bash
docker compose down -v
```

`-v` 会删除服务器上的 SQLite 用户数据、私有知识库原文件和 Piston runtime。
更新前必须同时备份 `studymate_backend_data` 卷中的 `/app/data/studymate.db`
与 `/app/data/private_knowledge`；数据库记录与原文件应作为同一恢复点保存。

### 6.1 备份 SQLite

使用 SQLite 在线备份 API，避免直接复制正在写入的数据库：

```bash
mkdir -p ~/studymate-backups
docker exec studymate-backend python -c '
import sqlite3
s = sqlite3.connect("/app/data/studymate.db")
d = sqlite3.connect("/app/data/studymate-backup.db")
s.backup(d)
d.close()
s.close()'
docker cp studymate-backend:/app/data/studymate-backup.db \
  ~/studymate-backups/studymate-$(date +%F_%H%M%S).db
docker exec studymate-backend rm -f /app/data/studymate-backup.db
chmod 600 ~/studymate-backups/studymate-*.db
```

备份文件应另存到独立存储，并定期执行 `PRAGMA integrity_check`。

私有知识库原文件需单独从同一数据卷导出：

```bash
docker cp studymate-backend:/app/data/private_knowledge \
  ~/studymate-backups/private_knowledge-$(date +%F_%H%M%S)
chmod -R go-rwx ~/studymate-backups/private_knowledge-*
```

恢复时应先停止后端，再将数据库与对应时间点的 `private_knowledge` 目录一起恢复，
避免文档任务记录存在但原文件缺失。

### 6.2 恢复或回滚

恢复前先停止后端、再次备份当前数据库，再把目标文件复制进数据卷。恢复属于破坏性操作，不要在普通部署脚本中自动执行。

代码回滚应使用明确的 Git 提交或镜像标签；不要用删除命名卷的方式回滚应用版本。镜像中的 `studymate.db.gz` 只在空数据卷首次启动时解压，不会覆盖已有数据库。

## 7. 备案页脚

上线前将真实 ICP 备案号放到公共页面页脚，并链接至：

```text
https://beian.miit.gov.cn/
```

## 8. 上线验收

```bash
docker compose ps
docker compose logs --tail=200 backend frontend caddy
curl -fsS https://你的备案域名/api/ping
```

浏览器验收：

1. 用学生、评委、管理员分别登录，确认角色边界。
2. 切换 5 门课程，检查检索、助教、笔记、测验和报告不会串课。
3. 检查 `sm_session` Cookie 包含 `HttpOnly`、`Secure`，跨站策略符合部署方式。
4. 检查 SSE 内容逐段到达，刷新后会话仍有效，退出后旧 Cookie 失效。
5. 如启用 Piston，分别运行 Python、C11、C++17，并确认超时与资源限制生效。
6. 从服务器外部网络检查 HTTPS 证书、备案页脚和移动端页面。

## 9. 常见排障

- `502`：先检查 `docker compose ps` 和后端健康日志，再确认前端 Nginx 能解析 `backend:8000`。
- Caddy 证书失败：确认域名已解析、80/443 可达、服务器时间正确，且没有其他服务占用端口。
- 登录后立即失效：核对 `AUTH_SECRET_KEY`、服务器时间、HTTPS 和 `SESSION_COOKIE_SECURE`。
- 空卷未初始化：检查后端日志、压缩种子是否存在，以及 `/app/data` 是否可写。
- 代码无法运行：检查 `piston-api` 状态、runtime 是否初始化、`PISTON_URL=http://piston-api:2000`，并确认已执行 `bash scripts/init-piston.sh` 安装白名单依赖。
- 提示不支持某第三方库：该库不在沙箱白名单内；不要在用户代码中 `pip install`，应更新 `scripts/piston_python_libs.txt` 后重新初始化。
- 外部 AI 调用失败：只检查变量是否已设置、模型和额度状态，不在日志或工单中粘贴真实 Key。
