# StudyMate Ubuntu 公网部署指南

> 最后核对：2026-07-17。本文对应当前 `docker-compose.yml`、压缩种子库和 Caddy 部署方式。
> 开始前先阅读 [`密钥管理指南.md`](密钥管理指南.md) 和 [`开发与验收指南.md`](开发与验收指南.md)。

## 方案

生产请求链路：

```text
浏览器 -> Caddy :80/:443 -> frontend nginx -> /api -> FastAPI -> SQLite/Piston
```

Caddy 自动申请、续期 HTTPS 证书。FastAPI、前端排障端口和 Piston 都只绑定
`127.0.0.1`，云安全组无需开放这些端口。

默认业务数据库是 SQLite。PostgreSQL、Redis 和 Chroma 属于 `extras` 扩展服务，当前部署不需要启动。

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
  --exclude 'frontend/node_modules/' \
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
```

如果同时使用主域名和 `www`，将两个 HTTPS 来源都写入 `CORS_ORIGINS`，逗号分隔。
模型、语音、邮件和 Piston 变量按 `.env.example` 配置；没有启用的服务保持空值，不要复制其他环境中的旧 Key。

## 5. 一键部署

```bash
cd ~/studymate
bash scripts/deploy.sh
```

脚本会构建镜像、启动服务并初始化 Piston 的 Python/C/C++ runtime；Python runtime 还会补齐固定兼容版本的 `scikit-learn`，用于机器学习代码案例。

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
```

第一次上线还要手动检查登录、SSE 流式回答、文件上传、语音和在线代码运行。

还应检查外部资源的降级行为：

- 人才呀课程接口返回 `live`、`cache` 或 `fallback` 来源状态，以及 `exact`、`related`、`course` 或 `fallback` 匹配级别；只有知识点级匹配才展示卡片。
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

`-v` 会删除服务器上的 SQLite 用户数据和 Piston runtime。更新前必须备份
`studymate_backend_data` 卷中的 `/app/data/studymate.db`。

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
- 代码无法运行：检查 `piston-api` 状态、runtime 是否初始化、`PISTON_URL=http://piston-api:2000`。
- 外部 AI 调用失败：只检查变量是否已设置、模型和额度状态，不在日志或工单中粘贴真实 Key。
