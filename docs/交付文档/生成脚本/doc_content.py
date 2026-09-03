"""Structured content for the 因材智训 deployment documents."""

PROJECT_TITLE = "因材智训：基于大模型的个性化资源生成与学习多智能体系统"
SHORT_TITLE = "因材智训智能学习伙伴"
DOMAIN = "https://matropic.cn"
SERVER_IP = "121.40.64.199"
ICP = "豫ICP备2026028221号"
AUTHORS = "________、________、________、________、________"
SEED_ACCOUNT_COUNT = 34
LIVE_ACCOUNT_COUNT = 38


def h(text, level=1):
    return {"kind": "heading", "text": text, "level": level}


def p(text, bold_prefix=None):
    return {"kind": "paragraph", "text": text, "bold_prefix": bold_prefix}


def bullets(items, ordered=False):
    return {"kind": "bullets", "items": items, "ordered": ordered}


def code(text):
    return {"kind": "code", "text": text.strip("\n")}


def table(
    headers,
    rows,
    widths=None,
    font_size=8.5,
    merge_columns=None,
    center_columns=None,
    width_ratio=1.0,
):
    return {
        "kind": "table",
        "headers": headers,
        "rows": rows,
        "widths": widths,
        "font_size": font_size,
        "merge_columns": list(merge_columns or []),
        "center_columns": list(center_columns or []),
        "width_ratio": width_ratio,
    }


def image(asset, caption, width_cm=15.0, height_cm=None):
    return {
        "kind": "image",
        "asset": asset,
        "caption": caption,
        "width_cm": width_cm,
        "height_cm": height_cm,
    }


def note(text, title="注意事项"):
    return {"kind": "note", "title": title, "text": text}


def spacer(points=8):
    return {"kind": "spacer", "points": points}


LONG_TOC = [
    (1, "1. 项目概述", 1),
    (2, "1.1 项目简介", 1),
    (2, "1.2 技术栈", 1),
    (2, "1.3 架构图", 2),
    (1, "2. 系统要求", 2),
    (2, "2.1 硬件要求", 2),
    (2, "2.2 软件要求", 2),
    (2, "2.3 网络要求", 2),
    (1, "3. 部署前准备", 3),
    (2, "3.1 服务器信息收集", 3),
    (2, "3.2 本地准备", 3),
    (2, "3.3 服务器准备", 3),
    (1, "4. 部署架构说明", 4),
    (2, "4.1 整体部署架构", 4),
    (2, "4.2 各组件职责说明", 5),
    (2, "4.3 部署流程概述", 6),
    (2, "4.4 部署注意事项", 7),
    (1, "5. 详细部署步骤", 8),
    (2, "5.1 环境准备", 8),
    (2, "5.2 项目配置", 12),
    (2, "5.3 Uvicorn 与 Piston 运行环境", 16),
    (2, "5.4 Caddy/Nginx 与 Compose", 18),
    (2, "5.5 自动恢复与一键更新", 24),
    (2, "5.6 防火墙、权限与安全", 28),
    (1, "6. SSL 证书配置", 29),
    (2, "6.1 本地与测试环境访问", 29),
    (2, "6.2 Let's Encrypt 生产证书", 29),
    (2, "6.3 证书切换与域名变更", 30),
    (1, "7. 验证部署", 30),
    (2, "7.1 检查服务状态", 30),
    (2, "7.2 检查端口监听", 31),
    (2, "7.3 测试应用访问", 31),
    (2, "7.4 浏览器访问测试", 32),
    (2, "7.5 运行监控与验收记录", 32),
    (1, "8. 常见问题排查", 32),
    (2, "8.1 应用或容器无法启动", 32),
    (2, "8.2 502 Bad Gateway", 33),
    (2, "8.3 SQLite 数据库异常", 34),
    (2, "8.4 SSE 或语音流异常", 34),
    (2, "8.5 静态文件 404 或缓存旧版", 35),
    (2, "8.6 上传文件失败", 35),
    (2, "8.7 SSL 证书或 Piston 异常", 36),
    (1, "9. 日常运维", 36),
    (2, "9.1 查看日志", 36),
    (2, "9.2 服务管理、更新与备份", 37),
    (2, "9.3 性能与资源优化", 38),
    (1, "10. 附录", 39),
    (2, "10.1 文件说明", 39),
    (2, "10.2 移动端与小程序部署情况", 40),
    (2, "10.3 测试网址与账号", 41),
    (2, "10.4 项目代码与交付清单", 42),
]


LONG_PAGES = [
    [
        h("1. 项目概述"),
        h("1.1 项目简介", 2),
        p("因材智训是面向高校计算机类课程的个性化资源生成与学习多智能体系统，围绕“学习画像—知识检索—资源生成—练习评估—画像更新”构建学习闭环。"),
        p("系统覆盖机器学习、数据结构与算法、操作系统、计算机网络、计算机组成原理五门课程。七个智能体分别负责检索、讲解、导图、测验、阅读、代码和学习路径，并通过课程上下文与七维画像提供个性化内容。"),
        p("平台同时提供可追溯 RAG、SSE 流式助教、图片与文档附件、语音交互、笔记测验、学习报告和 Python/C/C++ 在线运行，生成结果统一保存到工作台。"),
        h("1.2 技术栈", 2),
        table(
            ["层次", "技术/组件", "部署职责"],
            [
                ["基础设施", "Ubuntu 22.04.5、Docker 29.6.1、Compose 5.3.1", "提供容器宿主、网络、卷和自动恢复。"],
                ["基础设施", "Caddy 2 + Frontend Nginx", "负责 HTTPS、静态站点和 /api/SSE 代理。"],
                ["前端", "React 19.2.6、TypeScript 6.0.2、Vite 8.0.12", "构建响应式单页应用和生产资源。"],
                ["前端", "Tailwind、Framer、Monaco、KaTeX、Shiki、Recharts", "实现交互、编辑器、公式和图表。"],
                ["后端", "Python 3.11、FastAPI 0.115、Uvicorn 0.32", "提供认证、课程、助教和资源 API。"],
                ["后端", "Pydantic、SSE-Starlette、HTTPX、OpenAI SDK", "负责校验、流式事件和外部调用。"],
                ["数据", "SQLite、SQLAlchemy 2.0.36、aiosqlite、Named Volume", "保存业务与向量数据，空卷首次播种。"],
                ["检索", "BM25、Qwen text-embedding-v3、RRF", "融合关键词与 1024 维语义召回。"],
                ["智能体", "多模型适配器、7 个资源 Agent、并发编排", "并发生成六类资源与学习路径。"],
                ["多模态", "Qwen-VL、讯飞 ASR/TTS、CosyVoice、pypdf", "支持图片、语音和文档附件。"],
                ["代码沙箱", "Piston、Python 3.10、GCC 10.2、scikit-learn 1.3.2", "隔离运行 Python、C11 和 C++17。"],
                ["用户终端", "PC/手机浏览器、同源 HTTPS", "学生、评委和管理员统一访问。"],
            ],
            widths=[2.4, 6.0, 7.2],
            font_size=6.7,
            merge_columns=[0],
            center_columns=[0, 1],
        ),
    ],
    [
        h("1.3 架构图", 2),
        image("architecture_long.png", "图 1-1 因材智训基本部署架构图", 16.0),
        h("2. 系统要求"),
        h("2.1 硬件要求", 2),
        table(
            ["项目", "最低配置", "推荐配置", "当前服务器"],
            [
                ["CPU", "2 核", "4 核及以上", "4 vCPU"],
                ["内存", "4 GB", "8 GB 及以上", "7.1 GiB"],
                ["磁盘", "30 GB", "60 GB 及以上", "59 GB（约 43 GB 可用）"],
                ["带宽", "5 Mbps", "10 Mbps 及以上", "满足竞赛演示"],
            ],
            widths=[3.0, 3.6, 4.2, 5.0],
        ),
        h("2.2 软件要求", 2),
        table(
            ["对象", "要求/当前版本", "部署说明"],
            [
                ["宿主系统", "Ubuntu 22.04 LTS 64 位；当前 22.04.5", "仅宿主机安装 Docker、SSH、UFW 与维护工具。"],
                ["容器平台", "Docker 24+ / Compose V2+；当前 29.6.1 / v5.3.1", "构建、编排、健康检查、自动重启和命名卷持久化。"],
                ["维护工具", "Git、Rsync、Curl、Skopeo、Gzip", "版本记录、增量上传、接口验证、GHCR 镜像导入和种子校验。"],
                ["应用运行时", "Python 3.11、Node 20、Caddy/Nginx alpine", "全部由镜像提供；Node 只在前端构建阶段存在。"],
                ["客户端", "现代 Chrome/Edge/Firefox/Safari", "需支持 HTTPS、Cookie、SSE、麦克风和响应式页面。"],
            ],
            widths=[3.1, 6.0, 6.5],
            font_size=6.9,
            center_columns=[0],
        ),
        h("2.3 网络要求", 2),
        table(
            ["范围", "端口/网络", "要求"],
            [
                ["公网入口", "80/443", "Caddy 对公网监听；HTTP 用于 ACME 和跳转，HTTPS 提供正式访问。"],
                ["SSH 维护", "22", "仅对维护人员 IP 或可信网络开放。"],
                ["宿主回环", "5173/8000/2000", "前端、后端、Piston 排障端口只绑定 127.0.0.1。"],
                ["Docker 内网", "192.168.242.0/24", "容器通过服务名互访，不使用公网 IP。"],
                ["DNS/域名", "matropic.cn", "A 记录指向 121.40.64.199，备案与证书域名一致。"],
                ["必要出站", "DNS、HTTP、HTTPS", "允许拉镜像、签证书以及调用模型、语音和公开资源。"],
            ],
            widths=[3.2, 4.2, 8.2],
            font_size=6.9,
            center_columns=[0, 1],
        ),
    ],
    [
        h("3. 部署前准备"),
        h("3.1 服务器信息收集", 2),
        table(
            ["信息项", "当前配置", "验证方式/说明"],
            [
                ["公网 IP", SERVER_IP, "云控制台与外网结果一致"],
                ["域名/DNS", "matropic.cn → 121.40.64.199", "公网 DNS 查询确认"],
                ["ICP备案", ICP, "页面底部展示"],
                ["操作系统", "Ubuntu 22.04.5 LTS x86_64", "cat /etc/os-release"],
                ["CPU/内存", "4 vCPU / 7.1 GiB", "nproc、free -h"],
                ["系统盘", "59 GB，约 43 GB 可用", "df -h /"],
                ["SSH", "22/TCP；deploy；studymate-server", "密钥登录"],
                ["Docker", "Engine 29.6.1 / Compose v5.3.1", "版本命令确认"],
                ["端口", "公网 22/80/443；回环 5173/8000/2000", "安全组、UFW 与 ss 核对"],
                ["部署目录", "/home/deploy/studymate", "代码和部署配置目录"],
                ["敏感配置", "backend/.env、.deploy.env（600）", "单独维护，不随代码覆盖"],
                ["持久化", "backend/piston/caddy 命名卷", "更新保留数据、runtime 和证书"],
            ],
            widths=[3.2, 5.3, 7.1],
            font_size=7.0,
            center_columns=[0],
        ),
        h("3.2 本地准备", 2),
        bullets([
            "确认前后端生产构建通过，并重新生成脱敏压缩 SQLite 种子库。",
            "准备 backend/.env，但不得把真实密钥写入文档或提交到代码仓库。",
            "确认域名 A 记录指向服务器公网 IP，备案信息与页面展示一致。",
        ]),
        p("上传前应删除或排除 node_modules、dist、.venv、日志、本地运行库和历史备份，同时确认 backend/resources/seed/studymate.db.gz 仍在项目中。该脱敏压缩文件是首次启动的数据源，包含固定测试账号、五门课程和 938 条课程知识块。"),
        h("3.3 服务器准备", 2),
        code("""ssh studymate-server
uname -a
df -h /
ss -lntp"""),
        p("检查结果应确认系统为 Ubuntu 22.04 x86_64、磁盘空间充足，且 80、443 端口没有被旧版 Nginx、Apache 或其他网关占用。服务器上的日常部署目录统一使用 /home/deploy/studymate。"),
        note("部署用户没有 sudo 权限时，应在云厂商“云助手”中以 root 身份运行一次初始化脚本，不应索要或传播 root 密码。"),
    ],
    [
        h("4. 部署架构说明"),
        h("4.1 整体部署架构", 2),
        p("生产环境采用 Docker Compose 单机容器化架构。Caddy 是唯一公网入口，负责 80/443、TLS 证书和压缩；前端 Nginx 托管 React 静态资源并代理 /api；FastAPI 提供认证、课程、RAG、SSE、上传与代码运行接口。"),
        image("architecture_long.png", "图 4-1 项目整体部署架构图", 16.0),
        table(
            ["网络层次", "地址/端口", "调用关系", "安全边界"],
            [
                ["用户访问", "https://matropic.cn:443", "PC/手机浏览器 → Caddy", "可信 HTTPS；HTTP 自动跳转"],
                ["公网网关", "0.0.0.0:80/443", "Caddy → frontend:80", "唯一公网 Web 入口"],
                ["静态/API 代理", "frontend:80 / 127.0.0.1:5173", "Nginx 静态文件；/api → backend:8000", "5173 仅本机排障"],
                ["业务服务", "backend:8000 / 127.0.0.1:8000", "FastAPI → SQLite、模型、语音、Piston", "8000 不开放安全组"],
                ["代码沙箱", "piston-api:2000 / 127.0.0.1:2000", "backend Docker 内网调用", "2000 不对公网；资源受限"],
                ["容器网络", "192.168.242.0/24；网关 .1", "Compose DNS 通过服务名互访", "固定 bridge，不依赖容器 IP"],
                ["持久化", "backend/piston/caddy volumes", "数据库、runtime、证书跨容器重建保留", "禁止 down -v"],
                ["外部服务", "DNS/HTTPS 出站", "模型、语音、邮件、B站、人才呀、可信阅读", "只发送必要内容，不发送 Cookie/密钥"],
            ],
            widths=[2.7, 4.0, 5.0, 3.9],
            font_size=6.8,
            center_columns=[0, 1],
        ),
    ],
    [
        h("4.2 各组件职责说明", 2),
        p("四个核心容器通过同一 Compose 网络互联，外部请求只允许进入 Caddy。前端、后端和代码沙箱保留宿主机回环端口用于排障，但不在云安全组中开放，从网络边界上减少直接攻击面。"),
        h("4.2.1 Caddy—公网网关", 3),
        bullets(["自动申请和续期 Let's Encrypt 证书。", "HTTP 自动跳转 HTTPS。", "开启 zstd/gzip，SSE 使用低延迟转发。"]),
        h("4.2.2 Frontend Nginx—静态站点", 3),
        bullets(["托管 React/Vite 构建产物。", "支持 SPA 路由回退。", "将 /api 转发到 backend:8000，上传限制 20MB。"]),
        h("4.2.3 FastAPI—业务服务", 3),
        bullets(["用户、角色与安全会话。", "课程、知识库、7 组画像、笔记、测验、报告和就业建议。", "SSE 流式 AI、文件解析、语音、外部公开资源、可信阅读直链解析和代码执行转发。"]),
        h("4.2.4 SQLite 与 Named Volume", 3),
        p("线上数据库位于 backend_data 卷，容器重建不会覆盖；Piston runtime 和 Caddy 证书也分别持久化。"),
        h("4.2.5 Piston—在线代码沙箱", 3),
        p("支持 Python、C、C++；容器整体限制为 2 CPU、2GB、256 PID、2 并发，避免共享测试账号耗尽宿主机资源。"),
        p("上述组件均设置 restart: unless-stopped。宿主机重启后 Docker 服务会自动拉起容器；数据库、语言运行时和证书保存在命名卷中，镜像更新不会改变已有业务数据。"),
        h("4.2.6 与传统部署组件的对应关系", 3),
        table(
            ["参考文档组件", "因材智训等价实现", "说明"],
            [
                ["阿里云/本地服务器", "阿里云 ECS + Ubuntu 22.04.5", "提供计算、存储、公网和备案域名。"],
                ["Nginx", "Caddy + Frontend Nginx", "分别负责 TLS、静态站点和 /api/SSE 代理。"],
                ["Gunicorn", "Uvicorn 0.32", "运行 FastAPI ASGI 应用与 SSE。"],
                ["Supervisor", "restart: unless-stopped + Compose", "负责自动启动、恢复、日志和更新。"],
                ["Docker", "Docker Engine + Compose + Buildx", "构建并编排核心服务、网络和卷。"],
                ["达梦/MySQL", "SQLite + backend_data", "适配单机演示并支持在线备份。"],
                ["Redis", "主链路未启用；extras 预留 Redis 7", "业务状态当前保存在 SQLite。"],
                ["FAISS", "BM25 + SQLite JSON 向量 + RRF", "融合关键词与 Qwen 语义召回。"],
                ["本地/对象存储", "backend_data 命名卷", "保存 SQLite 与上传内容。"],
                ["讯飞星火大模型", "DeepSeek/星火/MiMo + Qwen/Qwen-VL", "支持主模型切换、助教、视觉和向量。"],
                ["LangChain", "并发 Agent 编排 + AI 工程依赖", "检索后并发调度资源智能体。"],
                ["ASR/TTS API", "讯飞 IAT/TTS + 可选 CosyVoice", "支持语音输入与多音色朗读。"],
                ["Python/Flask", "Python 3.11 + FastAPI + Pydantic", "构建异步 REST API 和参数模型。"],
                ["SQLAlchemy", "SQLAlchemy 2.0.36 + aiosqlite", "提供 ORM、异步会话和事务。"],
                ["WebSocket", "POST SSE + 语音 WebSocket/HTTP", "分别承载 AI 事件流与语音通信。"],
                ["HTML/CSS/JS/Three/face", "React/TypeScript/Tailwind + 可视组件", "实现导图、路径和图表，不采集人脸。"],
                ["Web 浏览器/客户端", "PC 与手机响应式 Web", "同一 HTTPS 站点与同源 API。"],
            ],
            widths=[3.2, 4.5, 7.9],
            font_size=6.0,
            center_columns=[0, 1],
        ),
    ],
    [
        h("4.3 部署流程概述", 2),
        image("deployment_flow.png", "图 4-2 因材智训部署流程", 15.5),
        table(
            ["阶段", "主要工作", "阶段输出", "验证成功标志"],
            [
                ["阶段 1：基础环境", "核对系统、资源与端口，安装 Docker、Compose 和 UFW。", "可用容器宿主", "Docker active，端口规则正确。"],
                ["阶段 2：数据与项目", "生成脱敏种子，上传代码，单独维护生产变量。", "代码、种子与 env", "gzip、SQLite 与 Compose 校验通过。"],
                ["阶段 3：镜像与运行时", "构建镜像，导入 Piston 并初始化语言运行时。", "服务镜像与 runtime", "服务 healthy，运行时可用。"],
                ["阶段 4：公网入口", "启动 Caddy，核对 DNS、防火墙和证书。", "可信 HTTPS", "HTTP 跳转，HTTPS 200。"],
                ["阶段 5：业务验收", "复测角色、课程、AI、附件、语音、代码和移动端。", "上线验收记录", "功能与数据正常，端口最小开放。"],
            ],
            widths=[2.7, 5.5, 3.5, 4.8],
            font_size=6.5,
            center_columns=[0],
        ),
        p("首次部署受镜像和 Piston runtime 下载速度影响；后续更新会复用构建缓存和持久化卷，通常明显更快。"),
        p("每个阶段都应达到表格中的成功标志后再继续；若某项失败，应留在当前阶段修复，避免把网络、镜像和业务问题叠加到一起。"),
    ],
    [
        h("4.4 部署注意事项", 2),
        bullets([
            "权限：仅一次性系统初始化需要 root；日常 Compose 操作使用 deploy 用户。",
            "网络：云安全组和 UFW 必须同时开放 80/443，DNS A 记录必须先指向服务器。",
            "密钥：backend/.env 权限为 600，Rsync 时必须排除，禁止写入文档和镜像。",
            "数据：backend_data 是线上数据库，不会因 --build 自动覆盖。",
            "镜像：Docker Hub 走国内加速；GHCR 的 Piston 必要时使用导入脚本。",
            "端口：2000、5173、8000 不对公网开放。",
            "更新：允许 docker compose down，但严禁带 -v。",
            "代码沙箱：Piston 使用 privileged 运行 isolate，因此必须保留资源上限。",
        ]),
        note("严禁执行 docker compose down -v。该命令会删除数据库、Piston runtime 和 Caddy 证书等命名卷。", "数据保护红线"),
        p("建议所有变更遵循“备份—同步—构建—健康检查—业务验收”的顺序。"),
        p("比赛展示前应至少完成一次从公网网络发起的全流程验收，并保留最近一份可恢复数据库备份。变更域名、Cookie、安全组或 Caddyfile 后，必须重新检查 HTTPS、登录状态和 SSE 流式响应。"),
        p("部署记录至少包含当前代码版本、Compose 配置摘要、数据库备份文件和验收结果，使更新失败时能够快速确认回滚范围。"),
    ],
    [
        h("5. 详细部署步骤"),
        h("5.1 环境准备", 2),
        p("目的：准备稳定、可重复的容器宿主环境。宿主机只需安装 Docker、Compose、SSH/Rsync、Curl、Skopeo 和防火墙工具；Python、Node.js、Uvicorn、Nginx、SQLite 客户端及业务依赖均由镜像提供，不在宿主机逐项安装。"),
        h("5.1.1 检查服务器", 3),
        code("""ssh studymate-server
cat /etc/os-release
uname -m
nproc
free -h
df -h /
ss -lntp"""),
        p("验证成功标志：Ubuntu 22.04、x86_64、磁盘剩余空间不少于 15GB，80/443 没有被其他 Web 服务占用。常见问题包括旧版 Nginx/Apache 占用端口、系统时间未同步和出站 HTTPS 被安全策略阻断。"),
        p("建议保存首次检查结果，后续出现资源不足、端口冲突或网络异常时，可直接与部署基线进行比较。"),
        h("5.1.2 上传初始化脚本", 3),
        code("""scp studymate/scripts/bootstrap-ubuntu.sh \\
  studymate-server:/home/deploy/studymate-bootstrap.sh
ssh studymate-server 'chmod 755 ~/studymate-bootstrap.sh'"""),
        note("若 deploy 不在 sudoers 中，请使用阿里云 ECS 云助手，以 root 身份执行下一页的命令。"),
    ],
    [
        h("5.1.3 安装 Docker Engine 与 Compose", 3),
        p("推荐使用项目自带的 Ubuntu 初始化脚本。脚本会自动选择可访问的 Docker CE 软件源，并安装 Docker、Compose plugin、Skopeo 和 UFW。"),
        code("""# 在云助手中以 root 身份执行
DEPLOY_USER=deploy \\
  bash /home/deploy/studymate-bootstrap.sh \\
  2>&1 | tee /home/deploy/studymate-bootstrap.log"""),
        p("看到 Bootstrap complete 后，退出并重新建立 SSH 会话，使 deploy 用户获得 docker 组权限。"),
        p("重新登录后应先确认 docker 组和服务状态，再开始上传项目；不要通过放宽 docker.sock 权限绕过用户组配置。"),
        code("""ssh studymate-server
id -Gn
docker --version
docker compose version
docker info --format 'server={{.ServerVersion}}'"""),
        table(
            ["验证项", "实际验收结果"],
            [
                ["Docker", "29.6.1"],
                ["Docker Compose", "v5.3.1"],
                ["用户组", "deploy docker"],
                ["服务状态", "docker active"],
            ],
            widths=[5.0, 10.6],
        ),
    ],
    [
        h("5.1.4 配置中国大陆镜像源", 3),
        p("初始化脚本将 Docker CE 软件源按“阿里云—腾讯云—中科大—官方源”自动回退，并写入 Docker Hub 镜像加速配置。"),
        code("""{
  \"registry-mirrors\": [
    \"https://docker.m.daocloud.io\",
    \"https://docker.1ms.run\",
    \"https://dockerproxy.net\"
  ],
  \"log-driver\": \"local\",
  \"log-opts\": {\"max-size\": \"100m\", \"max-file\": \"5\"}
}"""),
        code("""sudo dockerd --validate \\
  --config-file /etc/docker/daemon.json
sudo systemctl restart docker
docker info --format '{{json .RegistryConfig.Mirrors}}'"""),
        p("后端镜像构建还会使用阿里云 Debian 源和阿里云 PyPI，前端 npm 使用 npmmirror，避免仅配置 Docker 镜像源后依赖安装仍然卡住。"),
        p("镜像站可用性会随网络变化，若构建再次超时，应根据报错域名切换对应来源，并保留官方源作为最终回退。"),
    ],
    [
        h("5.1.5 配置安全组与 UFW", 3),
        p("云安全组和 Ubuntu 防火墙都需要放行必要端口。配置 UFW 时先允许 SSH，再启用防火墙，避免远程连接被锁断。"),
        code("""sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status numbered"""),
        table(
            ["端口", "用途", "公网策略"],
            [
                ["22/TCP", "SSH 维护", "建议仅维护人员 IP"],
                ["80/TCP", "ACME 验证与 HTTPS 跳转", "开放"],
                ["443/TCP", "HTTPS", "开放"],
                ["2000/TCP", "Piston", "禁止开放"],
                ["5173/TCP", "前端排障", "禁止开放"],
                ["8000/TCP", "后端排障", "禁止开放"],
            ],
            widths=[3.0, 7.2, 5.4],
        ),
        note("安全组是云平台层，UFW 是操作系统层；只配置其中一层并不能保证公网可访问。"),
        p("阿里云安全组入方向建议把 22 端口来源限制为维护人员固定 IP，80、443 允许公网访问；出方向至少允许 DNS、HTTP 和 HTTPS，以便 Docker 拉取镜像、Caddy 申请证书以及后端调用 AI 服务。"),
        p("配置完成后应同时核对安全组、UFW 和 ss 监听结果；只有三者一致，才算完成公网入口与内部排障端口的边界设置。"),
        code("""sudo ufw status verbose
curl -I --max-time 10 https://registry-1.docker.io
curl -I --max-time 10 https://acme-v02.api.letsencrypt.org/directory"""),
    ],
    [
        h("5.2 项目配置", 2),
        h("5.2.1 上传项目文件", 3),
        code("""ssh studymate-server 'mkdir -p ~/studymate'

rsync -az --delete --progress \\
  --exclude '.git/' \\
  --exclude 'frontend/node_modules/' \\
  --exclude 'backend/.venv/' \\
  --exclude 'backend/.env' \\
  --exclude 'backend/backups/' \\
  --exclude 'backend/studymate.db' \\
  --exclude 'backups/' \\
  --exclude '.deploy.env' \\
  --exclude '*.log' \\
  ./studymate/ studymate-server:~/studymate/"""),
        p("backend/resources/seed/studymate.db.gz 是首次启动所需的脱敏演示种子库，应随项目上传。backend/studymate.db 是开发机本地运行库，必须排除。生产 backend/.env 和 .deploy.env 必须单独维护。"),
        p("首次上传完成后应在服务器核对关键文件；后续增量同步仍沿用同一排除清单，避免 --delete 误删生产配置或备份。"),
        code("""scp studymate/backend/.env \\
  studymate-server:~/studymate/backend/.env
ssh studymate-server \\
  'chmod 600 ~/studymate/backend/.env'"""),
    ],
    [
        h("5.2.2 演示数据准备", 3),
        p("公开竞赛环境只保留指定管理员、评委和学生账号，同时保留课程、知识块、画像和必要演示数据。项目通过独立构建脚本从本地运行库生成可提交的脱敏压缩种子，不直接提交本地数据库。"),
        code("""cd studymate
python3 scripts/build_seed_db.py
gzip -t backend/resources/seed/studymate.db.gz"""),
        table(
            ["数据项", "验收基线", "保留/清理规则"],
            [
                ["获准账号总数", "34", "只保留白名单账号，删除其他账号及无用关联数据。"],
                ["管理员", "1：admin@studymate.com", "保留竞赛管理入口，清空认证会话。"],
                ["评委", "10：judge01～judge10", "保留评委测试与只读/验收权限。"],
                ["测试账号", "15：test1～test15", "保留录屏和功能验收使用的学生账号。"],
                ["命名学生", "8 个指定学生账号", "保留必要画像、测验、反馈和工作台演示数据。"],
                ["课程", "5", "五门课程必须全部保留并通过课程隔离检查。"],
                ["知识块", "1709", "正文、来源、页码、链接和元数据必须完整。"],
                ["检索向量", "1709 × 1024 维", "每个知识块均有向量；Embedding JSON 不得为空。"],
                ["认证会话", "user_sessions=0", "清空 Cookie 对应服务端会话，避免发布登录状态。"],
                ["一次性验证码", "email_verification_codes=0", "清空验证码、尝试次数和认证临时状态。"],
                ["SQLite 完整性", "integrity_check=ok", "失败时禁止替换现有压缩种子。"],
                ["外键检查", "foreign_key_check=0", "任何孤儿记录都视为构建失败。"],
            ],
            widths=[3.7, 4.6, 7.3],
            font_size=6.65,
            center_columns=[0, 1],
        ),
        p("构建脚本使用 SQLite backup API 获取一致快照，只修改快照，不修改 backend/studymate.db；随后删除未批准账户及其无用关联记录、清空认证会话和一次性验证码，同时保留五门课程、知识库、必要画像、测验、反馈等有效演示数据，校验外键与完整性后写出可复现的 gzip 文件。"),
        code("""ls -lh backend/resources/seed/studymate.db.gz
python3 - <<'PY'
import gzip, shutil, sqlite3, tempfile
with tempfile.NamedTemporaryFile(suffix='.db') as f:
    with gzip.open('backend/resources/seed/studymate.db.gz', 'rb') as src:
        shutil.copyfileobj(src, f)
    f.flush()
    c = sqlite3.connect(f.name)
    print(c.execute('PRAGMA integrity_check').fetchone())
    print(c.execute('PRAGMA foreign_key_check').fetchall())
PY"""),
        note("不要直接用手工 SQL 批量删除用户，也不要把本地运行库改名后当作种子提交。应始终通过 build_seed_db.py 生成部署产物。"),
    ],
    [
        h("5.2.3 配置生产环境变量", 3),
        code("""cd ~/studymate
cp .deploy.env.example .deploy.env
chmod 600 .deploy.env"""),
        code("""COMPOSE_PROFILES=public,code-runner
SITE_ADDRESS=matropic.cn
HTTP_PORT=80
HTTPS_PORT=443

CADDY_IMAGE=docker.m.daocloud.io/library/caddy:2-alpine
PYTHON_IMAGE=docker.m.daocloud.io/library/python:3.11-slim
NODE_IMAGE=docker.m.daocloud.io/library/node:20-alpine
NGINX_IMAGE=docker.m.daocloud.io/library/nginx:alpine"""),
        p("backend/.env 中至少应确认以下生产项："),
        code("""CORS_ORIGINS=https://matropic.cn
SESSION_COOKIE_SECURE=true
AUTH_SECRET_KEY=<随机强密钥>
DEEPSEEK_API_KEY=<仅服务器保存>
SPARK_API_KEY=<仅服务器保存>"""),
        note("文档只展示变量名与占位符。真实 LLM、语音、邮件、认证密钥不得出现在截图、PDF 或代码仓库中。"),
    ],
    [
        h("5.2.4 校验 Compose 配置", 3),
        code("""cd ~/studymate
docker compose --env-file .deploy.env config --quiet
docker compose --env-file .deploy.env config --services"""),
        p("生产 profile 应包含 backend、frontend、piston-api、caddy 四个核心服务。PostgreSQL、Redis、Chroma 属于 extras 可选 profile，当前生产环境没有启用。"),
        table(
            ["服务", "容器名", "端口映射", "持久化"],
            [
                ["backend", "studymate-backend", "127.0.0.1:8000", "backend_data"],
                ["frontend", "studymate-frontend", "127.0.0.1:5173", "镜像内静态文件"],
                ["piston-api", "studymate-piston", "127.0.0.1:2000", "piston_data"],
                ["caddy", "studymate-caddy", "80、443", "caddy_data/config"],
            ],
            widths=[3.0, 4.3, 4.1, 4.2],
            font_size=8.0,
        ),
        p("默认 Docker bridge 使用 192.168.242.0/24，服务之间通过 Compose 服务名通信。"),
        p("config --quiet 通过只表示语法和变量展开正确，正式启动前仍需确认端口映射、命名卷和生产 Profile 与预期一致。"),
    ],
    [
        h("5.3 Uvicorn 与 Piston 运行环境", 2),
        p("参考文档使用 Gunicorn 承载 Flask；因材智训是 FastAPI ASGI 应用，由 backend 容器内的 Uvicorn 提供 HTTP/SSE 服务，并通过 /api/ping 健康检查。在线编程则由独立 Piston 容器提供隔离运行环境。"),
        h("5.3.1 导入 Piston 镜像", 3),
        p("Piston 镜像位于 GHCR，Docker Hub 镜像加速不能覆盖该仓库。先尝试项目导入脚本："),
        code("""cd ~/studymate
bash scripts/import-piston-image.sh
docker image inspect \\
  ghcr.io/engineer-man/piston:latest"""),
        p("脚本先调用 Docker 原生拉取；超时后使用 Skopeo 写入临时 docker-archive，再由当前 Docker CLI 导入，从而规避 Ubuntu 22.04 旧版 Skopeo 与 Docker 29 API 不兼容的问题。"),
        h("5.3.2 离线镜像传输（备用）", 3),
        code("""docker save ghcr.io/engineer-man/piston:latest \\
  | gzip -1 \\
  | ssh studymate-server 'gzip -dc | docker load'"""),
        note("镜像传输完成后保留原始镜像名，Compose 无需修改。"),
    ],
    [
        h("5.3.3 初始化 Python 与 GCC runtime", 3),
        code("""cd ~/studymate
bash scripts/init-piston.sh
curl http://127.0.0.1:2000/api/v2/runtimes"""),
        p("验收结果应包含 Python 3.10.0，以及由 GCC 10.2.0 提供的 C、C++、D 和 Fortran runtime。项目主要使用 Python、C11、C++17。"),
        table(
            ["语言", "版本", "用途"],
            [
                ["Python", "3.10.0", "解释运行"],
                ["C", "GCC 10.2.0", "-std=c11 -O2"],
                ["C++", "GCC 10.2.0", "-std=c++17 -O2"],
            ],
            widths=[4.2, 4.2, 7.2],
        ),
        p("运行时保存在 piston_data 卷，后续容器重建会复用。初始化脚本会跳过已安装包，并在结束时强制校验 Python 与 C++ 是否存在。"),
        code("""curl -sS http://127.0.0.1:2000/api/v2/runtimes \\
  | python3 -m json.tool

# 预期至少出现 python 3.10.0、c 10.2.0、c++ 10.2.0"""),
        p("运行时初始化只需在首次创建 piston_data 或更换 Piston 基础镜像后执行。正常前后端更新不需要重新下载语言包，因此应优先保留命名卷并复用既有 runtime。"),
        note("境外下载过慢时，可从本机已验证的 piston_data 中迁移 runtime；不要反复删除卷重新下载。"),
    ],
    [
        h("5.4 Caddy/Nginx 与 Compose", 2),
        h("5.4.1 一键部署脚本", 3),
        code("""#!/usr/bin/env bash
set -euo pipefail

docker compose --env-file .deploy.env \\
  up -d --build --remove-orphans

bash scripts/init-piston.sh
docker compose --env-file .deploy.env ps"""),
        p("实际 scripts/deploy.sh 会自动识别 .deploy.env，支持 up、status、logs、down 四种操作。up 使用 --build 构建前后端，等待健康检查后启动 Caddy，并幂等初始化 Piston。"),
        code("""bash scripts/deploy.sh
bash scripts/deploy.sh status
bash scripts/deploy.sh logs
bash scripts/deploy.sh down"""),
        p("down 特意不带 -v，因此只停止并删除容器和网络，不删除业务卷。"),
        p("deploy.sh 可重复执行，已经存在的命名卷和健康服务会被复用；构建失败时应先查看失败步骤，原有健康容器无需立即删除。"),
    ],
    [
        h("5.4.2 前端镜像构建", 3),
        p("前端使用多阶段 Dockerfile：Node 20 安装依赖并执行生产构建，Nginx Alpine 仅保留 dist 静态文件。npm 使用 npmmirror。"),
        code("""ARG NODE_IMAGE=node:20-alpine
ARG NGINX_IMAGE=nginx:alpine
FROM ${NODE_IMAGE} AS build
WORKDIR /app
RUN npm config set registry \\
  https://registry.npmmirror.com
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM ${NGINX_IMAGE} AS runtime
COPY --from=build /app/dist \\
  /usr/share/nginx/html"""),
        p("生产构建已验证 TypeScript、Vite、备案页脚和哈希静态资源。Nginx 健康检查访问 127.0.0.1，避免 Alpine 对 localhost 的 IPv6 解析差异。"),
        p("更新上线后应从公网检查 index.html 引用的新哈希资源，并复测刷新子路由和 /api 代理，避免只看容器状态形成假阳性。"),
    ],
    [
        h("5.4.3 后端镜像构建", 3),
        p("后端基于 Python 3.11 slim，使用阿里云 Debian 与 PyPI 源，安装依赖后复制应用和只读种子库。"),
        code("""ARG PYTHON_IMAGE=python:3.11-slim
ARG DEBIAN_MIRROR=http://mirrors.aliyun.com/debian
ARG PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple

RUN apt-get update \\
 && apt-get install -y --no-install-recommends curl
RUN pip install -r requirements.txt \\
 --index-url "$PIP_INDEX_URL"
"""),
        p("容器入口 scripts/docker_entrypoint.py 在 backend_data 为空时解压只读种子库，之后启动 Uvicorn。若卷已有数据库，重新构建镜像不会覆盖线上数据。"),
        p("这一初始化规则把“首次播种”和“日常更新”明确分开：种子随镜像交付，真实运行数据始终以命名卷中的数据库为准。"),
        code("""DATABASE_URL=sqlite:///./data/studymate.db
PISTON_URL=http://piston-api:2000"""),
        note("真实 backend/.env 不 COPY 到镜像，只通过 env_file 在运行时注入。"),
    ],
    [
        h("5.4.4 Caddy 与前端 Nginx", 3),
        p("Caddyfile 使用 SITE_ADDRESS 作为站点地址，开启压缩、自动 HTTPS 和 SSE 低延迟转发。"),
        code("""{$SITE_ADDRESS:http://localhost} {
  encode zstd gzip
  reverse_proxy frontend:80 {
    flush_interval -1
  }
  header {
    -Server
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
  }
}"""),
        p("前端 Nginx 将 /api/ 转发至 backend:8000，关闭 SSE 缓冲并设置较长超时；其他路径使用 try_files 回退 index.html。"),
        code("""location /api/ {
  proxy_pass http://backend:8000/api/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 600s;
  proxy_send_timeout 600s;
  chunked_transfer_encoding on;
}
location / {
  try_files $uri $uri/ /index.html;
}"""),
    ],
    [
        h("5.4.5 数据持久化", 3),
        table(
            ["命名卷", "容器挂载点", "保存内容"],
            [
                ["studymate_backend_data", "/app/data", "SQLite 与上传文件"],
                ["studymate_piston_data", "/piston", "Python/GCC runtime"],
                ["studymate_caddy_data", "/data", "HTTPS 证书与 ACME 账户"],
                ["studymate_caddy_config", "/config", "Caddy 运行配置"],
            ],
            widths=[5.2, 4.0, 6.4],
        ),
        code("""docker volume ls --format '{{.Name}}' \\
  | grep '^studymate_'"""),
        p("首次启动时 backend_data 从镜像种子库播种；后续更新只替换镜像和容器。Piston 与证书同样跨容器重建持久化。"),
        code("""docker volume inspect studymate_backend_data
docker volume inspect studymate_piston_data
docker volume inspect studymate_caddy_data"""),
        p("检查 Mountpoint、CreatedAt 和 Labels 可确认卷属于当前 Compose 项目。卷内文件由容器用户管理，不需要在宿主机执行 chmod 777，也不要直接进入 /var/lib/docker 修改数据。"),
        note("如确需重置演示数据库，应先备份线上数据，再明确执行数据迁移；不要把 down -v 当作更新手段。", "持久化原则"),
        p("Compose 的 depends_on 与 healthcheck 确保：后端健康后启动前端，前端健康后启动 Caddy。"),
    ],
    [
        h("5.4.6 Piston 资源限制", 3),
        table(
            ["限制项", "配置值", "原因"],
            [
                ["CPU", "2.0 核", "给后端和网关保留计算资源"],
                ["内存", "2 GB", "防止无限申请内存拖垮宿主机"],
                ["PID", "256", "限制进程/线程风暴"],
                ["并发任务", "2", "默认 64 对 7GB 服务器过高"],
                ["单任务进程", "32", "限制 fork 类代码"],
                ["运行/编译超时", "10s / 15s", "避免长时间占用"],
            ],
            widths=[4.0, 3.6, 8.0],
        ),
        code("""docker inspect studymate-piston \\
  --format 'memory={{.HostConfig.Memory}} cpus={{.HostConfig.NanoCpus}} pids={{.HostConfig.PidsLimit}}'"""),
        code("""piston-api:
  privileged: true
  mem_limit: 2g
  cpus: 2.0
  pids_limit: 256
  environment:
    PISTON_MAX_CONCURRENT_JOBS: 2
    PISTON_MAX_PROCESS_COUNT: 32
    PISTON_RUN_TIMEOUT: 10000
    PISTON_COMPILE_TIMEOUT: 15000"""),
        p("这些是 Piston 容器整体硬上限。普通算法题、Python 和 C++17 编译运行已通过实测；如比赛需要较重任务，可按服务器余量谨慎提高，不建议取消。"),
    ],
    [
        h("5.5 自动恢复与一键更新", 2),
        p("参考文档使用 Supervisor 守护应用；因材智训由 Docker 的 restart: unless-stopped 与 Compose 统一承担自动启动、故障恢复、状态查询、日志和版本更新。"),
        h("5.5.1 首次启动", 3),
        code("""ssh studymate-server
cd ~/studymate
bash scripts/deploy.sh"""),
        p("脚本执行期间会显示镜像构建、容器创建、健康检查和 runtime 校验日志。首次构建完成后应看到四个核心容器。"),
        table(
            ["容器", "预期状态", "公网端口"],
            [
                ["studymate-backend", "Up (healthy)", "无"],
                ["studymate-frontend", "Up (healthy)", "无"],
                ["studymate-piston", "Up", "无"],
                ["studymate-caddy", "Up", "80、443"],
            ],
            widths=[5.5, 5.0, 5.1],
        ),
        p("首次部署已在目标服务器实际完成；服务器自主构建前后端、Caddy 证书签发和 Piston runtime 均通过。"),
        code("""curl -fsS http://127.0.0.1:8000/api/ping
curl -fsSI http://127.0.0.1:5173/
curl -fsSI https://matropic.cn/
curl -fsS http://127.0.0.1:2000/api/v2/runtimes"""),
        p("四条命令分别验证后端健康、前端静态站点、公网 HTTPS 和代码运行时。任意一项失败时，应先查看对应容器日志，不要在未定位原因时反复删除容器或数据卷。"),
    ],
    [
        h("5.5.2 服务状态与日志", 3),
        code("""cd ~/studymate
bash scripts/deploy.sh status
bash scripts/deploy.sh logs"""),
        p("如只需要查看最近日志而不持续跟随："),
        code("""docker compose --env-file .deploy.env logs \\
  --tail=200 backend frontend caddy piston-api"""),
        table(
            ["检查对象", "成功标志"],
            [
                ["backend", "health=healthy，/api/ping 200"],
                ["frontend", "health=healthy，首页 200"],
                ["caddy", "certificate obtained successfully"],
                ["piston", "runtimes 包含 Python 与 C++"],
            ],
            widths=[4.5, 11.1],
        ),
        p("Docker 使用 local 日志驱动，单文件最大 100MB、最多 5 个，避免长期运行填满磁盘。"),
        code("""docker logs --tail=100 studymate-backend
docker logs --tail=100 studymate-frontend
docker logs --tail=100 studymate-caddy
docker logs --tail=100 studymate-piston"""),
        p("排查启动问题时先读取最近 100～200 行；复现 AI 流式回答或代码运行问题时再使用 logs -f 实时跟踪，完成后按 Ctrl+C 退出日志，不会停止容器。"),
    ],
    [
        h("5.5.3 仅更新前端", 3),
        p("只修改 React 页面、样式或前端组件时，无需重建后端和 Piston。开发机同步前端："),
        code("""rsync -az --delete --progress \\
  --exclude 'node_modules/' \\
  --exclude 'dist/' \\
  studymate/frontend/ \\
  studymate-server:~/studymate/frontend/"""),
        p("服务器仅重建 frontend："),
        code("""ssh studymate-server \\
 'cd ~/studymate && \\
  docker compose --env-file .deploy.env \\
  up -d --build frontend'"""),
        p("更新过程不会修改 backend_data。Caddy 保持运行，通常只有数秒静态资源切换时间。浏览器若缓存旧资源，可使用 Ctrl+F5。"),
        p("更新完成后先确认 frontend 为 healthy，再从外部浏览器检查首页、登录和一个依赖 /api 的页面，确保静态资源与接口版本匹配。"),
        note("如同时修改 docker-compose.yml、Caddyfile 或后端接口，应走完整更新流程。"),
    ],
    [
        h("5.5.4 完整更新与回滚", 3),
        code("""rsync -az --delete --progress \\
  --exclude '.git/' \\
  --exclude 'frontend/node_modules/' \\
  --exclude 'backend/.venv/' \\
  --exclude 'backend/.env' \\
  --exclude 'backend/backups/' \\
  --exclude 'backend/studymate.db' \\
  --exclude 'backups/' \\
  --exclude '.deploy.env' \\
  --exclude '*.log' \\
  ./studymate/ studymate-server:~/studymate/

ssh studymate-server \\
 'cd ~/studymate && bash scripts/deploy.sh'"""),
        p("更新前建议记录 Git 提交号和备份数据库。回滚时恢复旧代码或旧镜像后重新执行 deploy.sh，命名卷仍保留。"),
        p("代码回滚通常不回退数据；只有确认数据库内容或结构受损时，才应在停止写入、二次备份并校验备份后执行数据恢复。"),
        code("""git rev-parse --short HEAD
docker image ls 'studymate-*' --digests"""),
        note("不要把服务器 backend/.env、.deploy.env 或备份目录通过 --delete 同步掉；必须保留对应 exclude。"),
    ],
    [
        h("5.6 防火墙、权限与安全", 2),
        bullets([
            "deploy 用户使用 SSH 密钥登录，不在文档中保存密码或私钥。",
            "backend/.env 与 .deploy.env 权限为 600。",
            "Docker 组等同较高系统权限，只授予可信维护人员。",
            "FastAPI、前端排障端口和 Piston 仅监听 127.0.0.1。",
            "会话 Cookie 在线上启用 Secure、HttpOnly、SameSite=Lax。",
            "Caddy 移除 Server 头并设置 nosniff、Referrer-Policy。",
            "测试账号仅用于竞赛演示，正式运营前必须更换密码。",
            "Piston 保持容器资源上限，不把 2000 端口暴露公网。",
        ]),
        code("""chmod 600 ~/studymate/.deploy.env
chmod 600 ~/studymate/backend/.env
ss -lnt | grep -E ':(80|443|2000|5173|8000)'"""),
        p("预期只有 80/443 监听公网地址，其他端口显示 127.0.0.1。"),
        p("安全检查还应覆盖环境文件权限、Docker 组成员和测试账号状态，比赛结束后及时轮换测试密码与外部服务凭据。"),
        table(
            ["安全对象", "控制措施"],
            [
                ["SSH", "密钥登录、限制来源 IP、普通 deploy 用户"],
                ["环境变量", "权限 600、Rsync 排除、运行时注入"],
                ["Web", "HTTPS、Secure Cookie、安全响应头"],
                ["代码沙箱", "仅本机端口、容器整体资源与超时限制"],
                ["数据", "命名卷持久化、更新前备份、禁止 down -v"],
            ],
            widths=[4.2, 11.4],
            font_size=8.0,
        ),
    ],
    [
        h("6. SSL 证书配置"),
        h("6.1 Caddy 自动 HTTPS", 2),
        p("本项目不使用自签名证书，也不需要手工安装 Certbot。Caddy 根据 SITE_ADDRESS 自动注册 ACME 账户、完成 HTTP-01 验证并保存证书。"),
        table(
            ["前提条件", "要求"],
            [
                ["DNS", "matropic.cn A 记录指向 121.40.64.199"],
                ["安全组", "80、443 对公网开放"],
                ["UFW", "允许 80/tcp、443/tcp"],
                ["Caddy", "容器正常运行，SITE_ADDRESS=matropic.cn"],
            ],
            widths=[4.2, 11.4],
        ),
        code("""docker logs --tail=120 studymate-caddy"""),
        p("成功日志包含 validations succeeded、certificate obtained successfully。证书存放在 caddy_data 卷中。"),
        code("""getent ahostsv4 matropic.cn
sudo ufw status | grep -E '80|443'
docker port studymate-caddy"""),
        p("申请证书前，域名解析结果必须与服务器公网 IP 一致，Caddy 容器必须实际映射 80 和 443。若 DNS 刚修改，可等待 TTL 到期后再次验证。"),
        note("如果 DNS 尚未生效或 80 端口被安全组阻断，Caddy 会自动重试；不要改用“继续访问不安全站点”的方式绕过。"),
    ],
    [
        h("6.2 证书验证与续期", 2),
        code("""curl -I http://matropic.cn
curl -I https://matropic.cn
openssl s_client \\
  -connect matropic.cn:443 \\
  -servername matropic.cn </dev/null"""),
        table(
            ["验证项", "实际结果"],
            [
                ["HTTP", "308 Permanent Redirect"],
                ["HTTPS", "HTTP/2 200"],
                ["证书颁发", "Let's Encrypt"],
                ["域名", "matropic.cn"],
                ["自动续期", "由 Caddy 管理"],
            ],
            widths=[5.0, 10.6],
        ),
        p("Caddy 会根据证书续期窗口自动更新，无需 cron。应保留 caddy_data 和 caddy_config，并定期检查日志。"),
        code("""docker compose --env-file .deploy.env \\
  logs --tail=100 caddy"""),
        code("""# 预期响应摘要
HTTP/1.1 308 Permanent Redirect
Location: https://matropic.cn/

HTTP/2 200
issuer=Let's Encrypt"""),
        p("验收时还应在手机流量或其他外部网络中打开站点，排除仅服务器本机可访问的假阳性；浏览器证书详情中的域名、有效期和颁发者均应正常。"),
    ],
    [
        h("7. 验证部署"),
        h("7.1 检查服务状态", 2),
        code("""cd ~/studymate
docker compose --env-file .deploy.env ps
docker stats --no-stream"""),
        table(
            ["服务", "实际状态", "说明"],
            [
                ["backend", "healthy", "FastAPI 健康检查通过"],
                ["frontend", "healthy", "Nginx 静态站点正常"],
                ["caddy", "running", "80/443 正常"],
                ["piston-api", "running", "runtime 已加载"],
            ],
            widths=[4.2, 4.0, 7.4],
        ),
        h("7.1.1 检查持久化", 3),
        code("""docker volume ls --format '{{.Name}}' \\
  | grep '^studymate_'"""),
        p("backend、Piston、Caddy 数据卷均应存在。"),
        code("""docker inspect studymate-backend \\
  --format '{{.State.Status}} / {{.State.Health.Status}}'
docker inspect studymate-frontend \\
  --format '{{.State.Status}} / {{.State.Health.Status}}'"""),
        p("若状态为 starting，可等待健康检查的 start_period；若连续变为 unhealthy，则查看容器日志和健康检查输出，而不是只依赖 Compose 的 Up 状态。"),
    ],
    [
        h("7.2 检查端口与公网访问", 2),
        code("""ss -lntp | grep -E \\
  ':(22|80|443|2000|5173|8000)'

curl -I https://matropic.cn
curl https://matropic.cn/api/ping"""),
        table(
            ["端口", "监听地址", "验收"],
            [
                ["80", "0.0.0.0 / ::", "公网 HTTP 跳转"],
                ["443", "0.0.0.0 / ::", "公网 HTTPS"],
                ["5173", "127.0.0.1", "仅本机"],
                ["8000", "127.0.0.1", "仅本机"],
                ["2000", "127.0.0.1", "仅本机"],
            ],
            widths=[3.0, 5.0, 7.6],
        ),
        p("公网首页与 /api/ping 均已返回 200，域名访问不出现浏览器证书警告。"),
        code("""sudo ufw status numbered
curl -I http://matropic.cn
curl -I https://matropic.cn
curl -sS https://matropic.cn/api/ping | python3 -m json.tool"""),
        p("公网测试应从服务器以外的网络执行。5173、8000 和 2000 即使绑定宿主机回环，也不应在阿里云安全组中添加放行规则。"),
    ],
    [
        h("7.3 核心功能验收", 2),
        table(
            ["功能", "验收方法", "结果"],
            [
                ["登录", "评委账号登录并访问 /api/auth/me", "通过"],
                ["Cookie", "检查 Set-Cookie 的 Secure/HttpOnly", "通过"],
                ["课程", "切换五门课程并读取知识库", "通过"],
                ["AI 助教", "SSE 流式回答指定短语", "真实模型、done 事件正常"],
                ["外部资源", "高相关课程与视频、可信阅读直链或稳定搜索兜底", "通过"],
                ["备案页脚", "公网 JS 与页面包含备案号", "通过"],
            ],
            widths=[3.2, 8.2, 4.2],
            font_size=8.0,
        ),
        code("""curl https://matropic.cn/api/ping
# 返回 status=ok、service=studymate-backend"""),
        p("登录响应使用安全 Cookie；SSE 返回 meta、delta、done 事件，meta 中 mock=false。阅读解析只返回经过标题、HTTPS、主机和路径校验的 arXiv、DOI、豆瓣图书、CSDN 或掘金详情页；未命中时由前端保留搜索入口。"),
        p("页面底部显示“豫ICP备2026028221号”，并链接 https://beian.miit.gov.cn/。"),
        bullets([
            "使用 admin、judge 和普通学生三类账号分别登录，确认角色权限边界。",
            "在五门课程之间切换，确认知识库、会话和生成结果不会跨课程串用。",
            "提交 AI 问题后观察内容逐段到达，而不是长时间等待后一次性返回。",
            "上传文本或 PDF，确认文件大小、类型校验与解析提示符合预期。",
            "刷新浏览器后会话仍有效，退出登录后旧 Cookie 不能继续访问受保护接口。",
        ]),
    ],
    [
        h("7.4 数据与代码运行验收", 2),
        table(
            ["项目", "测试内容", "实际结果"],
            [
                ["文件上传", "上传 2MB 文本文件", "HTTP 200，内容截断策略正常"],
                ["Python", "print(6 * 7)", "stdout=42，mock=false"],
                ["C++17", "编译输出 42", "编译/运行退出码 0"],
                ["用户数据", "获准部署种子", "19 个且完全一致"],
                ["课程数据", "课程与知识块", "5 门、1709 块"],
                ["SQLite", "integrity_check/foreign_key_check", "ok / 0"],
            ],
            widths=[3.2, 7.0, 5.4],
            font_size=8.0,
        ),
        p("当前本地质量基线还包括 23 项后端自动化测试，以及建议 2、建议 3、建议 4 三组前端隔离回归；覆盖画像与报告安全写回、未作答兼容、RAG 相对匹配度、外部资源相关性、可信阅读直链和就业雷达更新。"),
        code("""curl http://127.0.0.1:2000/api/v2/runtimes

docker exec -i studymate-backend python <<'PY'
import sqlite3
c = sqlite3.connect('/app/data/studymate.db')
print(c.execute('pragma integrity_check').fetchone())
PY"""),
    ],
    [
        h("7.5 运行监控与验收结论", 2),
        table(
            ["验收维度", "结论"],
            [
                ["可访问性", "HTTP 自动跳 HTTPS，HTTPS 200"],
                ["容器健康", "前后端 healthy，Caddy/Piston running"],
                ["数据完整", "种子 34 用户、5 课程、938 知识块，完整性正常"],
                ["AI 能力", "真实模型流式回复完成"],
                ["在线编程", "Python 与 C++ 真实执行成功"],
                ["安全边界", "仅 22/80/443 公网开放，Cookie Secure"],
                ["资源余量", "59GB 系统盘，验收时约 43GB 可用"],
            ],
            widths=[4.4, 11.2],
        ),
        p("结论：因材智训已在 Ubuntu 22.04 服务器完成可重复 Docker 部署，满足竞赛公网展示、评委账号访问、核心业务演示和后续前端快速更新要求。"),
        p("验收记录应与具体版本绑定，至少保存部署日期、Git 提交号、镜像摘要、数据库备份文件名和测试人员。出现回归时可据此快速判断是代码、配置、数据还是外部模型服务发生变化。"),
        bullets([
            "上线前：备份数据库并记录当前容器、镜像状态。",
            "上线后：检查四个服务、端口、证书和数据卷。",
            "业务侧：复测登录、课程、AI、上传、代码运行与备案信息。",
            "异常时：保留日志与失败请求，不执行 down -v 或手工覆盖数据库。",
        ], ordered=True),
        note("每次重大更新后至少复测首页、登录、/api/ping、AI SSE、上传、Python/C++ 和数据库完整性。", "验收基线"),
    ],
    [
        h("8. 常见问题排查"),
        h("8.1 容器、反向代理与镜像问题", 2),
        table(
            ["症状", "排查与处理"],
            [
                ["docker: command not found", "确认初始化脚本以 root 执行完成；检查安装日志。"],
                ["permission denied docker.sock", "退出 SSH 后重新登录，确认用户属于 docker 组。"],
                ["镜像拉取超时", "检查 daemon.json、重启 Docker，或在 .deploy.env 使用显式代理镜像。"],
                ["502 Bad Gateway", "检查 backend health 与 frontend 日志，确认 backend:8000 可达。"],
                ["前端 unhealthy", "检查 Nginx 配置、构建产物和 healthcheck 的 127.0.0.1。"],
            ],
            widths=[5.1, 10.5],
            font_size=8.0,
        ),
        code("""bash scripts/deploy.sh status
docker compose --env-file .deploy.env \\
  logs --tail=200 backend frontend"""),
    ],
    [
        h("8.2 HTTPS、Piston 与前端缓存问题", 2),
        table(
            ["症状", "排查与处理"],
            [
                ["证书申请失败", "确认 DNS A 记录、安全组 80/443、UFW 与 Caddy 日志。"],
                ["GHCR 拉取停滞", "执行 import-piston-image.sh，必要时从本机 docker save 传输。"],
                ["runtime 为空", "运行 init-piston.sh，并检查 piston_data 卷。"],
                ["代码运行 mock", "检查 backend 到 piston-api:2000 的 Docker 内网连接。"],
                ["前端仍是旧版", "重建 frontend，检查新哈希资源，浏览器 Ctrl+F5。"],
                ["上传 413", "检查前端 Nginx client_max_body_size 与后端 10MB 规则。"],
            ],
            widths=[4.6, 11.0],
            font_size=8.0,
        ),
        code("""docker logs --tail=200 studymate-caddy
curl http://127.0.0.1:2000/api/v2/runtimes
docker volume inspect studymate_piston_data"""),
    ],
    [
        h("9. 日常运维"),
        h("9.1 查看日志与服务管理", 2),
        code("""cd ~/studymate
bash scripts/deploy.sh status
bash scripts/deploy.sh logs

docker compose --env-file .deploy.env restart backend
docker compose --env-file .deploy.env restart frontend
docker compose --env-file .deploy.env restart caddy
docker stats --no-stream
df -h"""),
        p("需要停止整个应用时使用 bash scripts/deploy.sh down；恢复使用 deploy.sh。该 down 不删除卷。"),
        table(
            ["日志对象", "命令"],
            [
                ["后端", "docker logs --tail=200 studymate-backend"],
                ["前端", "docker logs --tail=200 studymate-frontend"],
                ["Caddy", "docker logs --tail=200 studymate-caddy"],
                ["Piston", "docker logs --tail=200 studymate-piston"],
            ],
            widths=[3.8, 11.8],
            font_size=8.0,
        ),
    ],
    [
        h("9.2 数据备份与恢复", 2),
        p("使用 SQLite 在线备份 API 可在不中断写入的情况下生成一致副本："),
        code("""mkdir -p ~/studymate-backups
docker exec studymate-backend python -c '
import sqlite3
s=sqlite3.connect(\"/app/data/studymate.db\")
d=sqlite3.connect(\"/app/data/studymate-backup.db\")
s.backup(d); d.close(); s.close()'
docker cp studymate-backend:/app/data/studymate-backup.db \\
  ~/studymate-backups/studymate-$(date +%F_%H%M%S).db
docker exec studymate-backend rm -f /app/data/studymate-backup.db"""),
        h("9.3 性能与资源管理", 2),
        bullets(["定期检查磁盘与 Docker 镜像缓存。", "Piston 容器整体保持 2CPU、2GB 和 2 并发上限。", "长时间运行后检查日志与容器重启次数。", "扩大并发前先压测 AI、SQLite 与代码沙箱。"]),
        note("恢复数据库前必须先备份当前文件，并停止 backend；恢复后再次执行完整性检查。"),
    ],
    [
        h("10. 附录"),
        h("10.1 文件说明与部署状态", 2),
        code("""studymate/
├── backend/                 # FastAPI、本地运行库与压缩种子资源
├── frontend/                # React、Nginx 配置
├── scripts/                 # 初始化、部署、数据清理
├── docs/                    # 部署说明
├── docker-compose.yml       # 服务、网络、卷、限制
├── Caddyfile                # HTTPS 公网入口
├── .deploy.env.example      # 生产 Compose 示例
└── README.md"""),
        table(
            ["生产项", "当前状态"],
            [
                ["公网地址", DOMAIN],
                ["ICP备案", ICP],
                ["核心容器", "4 个，运行正常"],
                ["HTTPS", "Let's Encrypt，自动续期"],
                ["数据库", "种子 34 用户；线上当前 38 用户；5 课程、938 知识块"],
                ["代码运行", "Python/C/C++ runtime 已安装"],
            ],
            widths=[4.4, 11.2],
        ),
    ],
    [
        h("10.2 测试网址与账号", 2),
        image("site_qr.png", "图 10-1 因材智训公网访问二维码", 5.0),
        p("公网访问地址：https://matropic.cn"),
        p("管理员账号：admin@studymate.com　密码：admin123456"),
        p("评委账号：judge01@studymate.com 至 judge10@studymate.com　统一密码：judge123456"),
        p("学生账号：sunjiayu、baixinyue、yuanshicong、chenzhuo、lijiayi、zhouxiang、tianyixin、liufei，邮箱域均为 @studymate.com，统一密码：user123456。"),
        note("以上账号仅用于竞赛测试环境。文档对外公开或转为正式运营前，应删除密码或执行统一轮换。", "测试账号声明"),
        p("浏览器应直接显示可信 HTTPS，不需要点击“继续访问不安全站点”。"),
    ],
    [
        h("10.3 项目代码与交付清单", 2),
        p("项目代码随竞赛作品压缩包提交，服务器部署目录为 /home/deploy/studymate。部署脚本已包含国内镜像源、Docker Compose 启动和 Piston 初始化逻辑。"),
        table(
            ["交付文件", "用途"],
            [
                ["docker-compose.yml", "生产容器编排"],
                ["Caddyfile", "公网 HTTPS 与反向代理"],
                ["scripts/bootstrap-ubuntu.sh", "服务器一次性初始化"],
                ["scripts/deploy.sh", "一键构建、启动、状态与日志"],
                ["scripts/import-piston-image.sh", "GHCR 受限时导入镜像"],
                ["scripts/init-piston.sh", "幂等安装并校验 runtime"],
                ["scripts/build_seed_db.py", "生成脱敏压缩部署种子"],
                ["scripts/sanitize_demo_db.py", "演示账号数据清理"],
            ],
            widths=[7.0, 8.6],
            font_size=8.0,
        ),
        h("最终验收清单", 3),
        bullets(["域名与 HTTPS 正常", "四个核心容器运行", "19 个种子账号准确", "5 门课程与 1709 知识块完整", "AI SSE 为真实模型", "Python/C++ 运行通过", "备案号可见", "备份与更新命令可执行"]),
        code("""# 交付压缩包和公开仓库必须排除
.git/
frontend/node_modules/
frontend/dist/
backend/.venv/
backend/.env
.deploy.env
backend/backups/
*.log
SSH 私钥与真实 API Key"""),
        note("作者姓名、代码仓库或网盘链接应在正式提交前补齐；公开版本若不需要直接展示测试密码，可将账号密码移至单独的《评委访问说明》。", "提交前检查"),
    ],
]


# The reference deployment document uses code-heavy, nearly full pages. These
# page-specific supplements keep the same visual density while adding useful,
# project-verified commands instead of decorative filler.
LONG_PAGE_SUPPLEMENTS = {
    7: [
        h("4.4.1 变更前检查清单", 3),
        table(
            ["变更对象", "需要保留", "完成后验证"],
            [
                ["前端源码", "backend_data、生产 env", "首页、静态资源、/api"],
                ["后端源码", "数据库卷、密钥", "/api/ping、登录、AI SSE"],
                ["Compose", "四个命名卷", "服务、网络、端口映射"],
                ["Caddyfile", "caddy_data/config", "证书、HTTP 跳转、SSE"],
                ["Piston", "piston_data", "runtime、Python/C++"],
                ["数据库", "当前备份与回滚点", "integrity/FK/核心数量"],
            ],
            widths=[4.0, 5.4, 6.2],
            font_size=8.0,
        ),
    ],
    8: [
        h("5.1.1.1 时间、DNS 与出站连通性", 3),
        code("""timedatectl status
getent ahostsv4 matropic.cn
curl -I --max-time 10 https://mirrors.aliyun.com
curl -I --max-time 10 https://api.deepseek.com

# 预期：系统时间同步、域名解析正确、HTTPS 出站可达"""),
        p("系统时间偏差会导致 TLS 和 Cookie 验证异常；DNS 或 HTTPS 出站受限会同时影响镜像下载、证书签发和模型调用，应在安装软件前排除。"),
    ],
    9: [
        h("5.1.3.1 安装结果复核", 3),
        code("""systemctl is-active docker
systemctl is-enabled docker
docker version --format '{{.Server.Version}}'
docker compose version
docker buildx version
skopeo --version
id deploy"""),
        p("Docker 应为 active/enabled，deploy 的 groups 中应包含 docker。若当前会话仍提示 docker.sock 权限不足，退出 SSH 后重新连接，不要把 socket 权限改成 777。"),
    ],
    10: [
        h("5.1.4.1 构建依赖源验证", 3),
        code("""docker pull alpine:3.20
docker run --rm alpine:3.20 cat /etc/alpine-release

# 前端构建使用
npm config get registry
# 后端构建参数
echo http://mirrors.aliyun.com/debian
echo https://mirrors.aliyun.com/pypi/simple"""),
        p("Docker daemon 镜像加速只处理 Docker Hub；Debian、PyPI、npm 和 GHCR 各自需要独立策略。遇到超时时应根据失败域名定位对应源，而不是反复更换同一项配置。"),
    ],
    12: [
        h("5.2.1.1 上传后核对", 3),
        code("""ssh studymate-server '
  cd ~/studymate
  test -f docker-compose.yml
  test -f Caddyfile
  test -f backend/resources/seed/studymate.db.gz
  test -x scripts/deploy.sh || chmod +x scripts/*.sh
  du -sh .
  find . -maxdepth 2 -type f | sort | sed -n "1,40p"
'"""),
        p("核对时应确认生产 env 未被普通 Rsync 覆盖，压缩种子库和部署脚本存在，且目录所有者仍为 deploy。不要把本地 studymate.db、node_modules、.venv 或历史备份上传到服务器。"),
    ],
    14: [
        h("5.2.3.1 关键变量说明", 3),
        table(
            ["变量", "作用", "生产要求"],
            [
                ["SITE_ADDRESS", "Caddy 站点地址", "matropic.cn"],
                ["COMPOSE_PROFILES", "启用网关/沙箱", "public,code-runner"],
                ["CORS_ORIGINS", "允许浏览器来源", "仅正式 HTTPS 域名"],
                ["SESSION_COOKIE_SECURE", "限制 Cookie 传输", "true"],
                ["AUTH_SECRET_KEY", "会话签名", "随机强密钥，禁止公开"],
                ["PISTON_URL", "后端访问沙箱", "Compose 内网服务名"],
                ["LLM/API Key", "模型与语音能力", "仅服务器保存"],
            ],
            widths=[4.2, 5.2, 6.2],
            font_size=7.8,
        ),
    ],
    15: [
        h("5.2.4.1 服务依赖与内部网络", 3),
        code("""# config --services 的生产输出
backend
piston-api
frontend
caddy

# 固定 Docker bridge
subnet: 192.168.242.0/24
gateway: 192.168.242.1

# 服务间使用 backend:8000、piston-api:2000、frontend:80"""),
        p("内部地址由 Docker DNS 解析，容器不应通过宿主机公网 IP 互相访问。固定子网便于排障，但业务代码仍应优先使用 Compose 服务名，避免依赖变化的容器 IP。"),
    ],
    16: [
        h("5.3.1.1 镜像导入校验", 3),
        code("""docker image inspect ghcr.io/engineer-man/piston:latest \\
  --format '{{.Id}} {{.Architecture}} {{.Os}}'
docker image ls ghcr.io/engineer-man/piston --digests

# 预期：linux / amd64，镜像标签保持原名
# Compose 启动后：
docker inspect studymate-piston --format '{{.State.Status}}'"""),
        p("导入成功的关键是本地镜像名与 Compose 中的 PISTON_IMAGE 一致。若 docker load 后只有镜像 ID 没有标签，应重新 docker tag，而不是修改多处 Compose 配置。"),
    ],
    18: [
        h("5.4.1.1 deploy.sh 操作分支", 3),
        code("""case "${1:-up}" in
  up)
    docker compose --env-file .deploy.env \\
      up -d --build --remove-orphans
    bash scripts/init-piston.sh
    docker compose --env-file .deploy.env ps ;;
  status) docker compose --env-file .deploy.env ps ;;
  logs)   docker compose --env-file .deploy.env \\
            logs -f --tail=200 backend frontend caddy piston-api ;;
  down)   docker compose --env-file .deploy.env down ;;
esac"""),
        p("该脚本不包含 down -v、system prune 或数据库覆盖操作，可作为日常更新入口。遇到构建失败时原有容器通常仍可继续运行，应先读取失败步骤再决定回滚。"),
    ],
    19: [
        h("5.4.2.1 前端运行阶段", 3),
        code("""FROM ${NGINX_IMAGE} AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s \\
  --start-period=5s --retries=3 \\
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]"""),
        p("最终镜像不包含 Node.js、源码和 node_modules，减少体积与攻击面。前端资源文件名带内容哈希，index.html 不应长期缓存，assets 可设置较长缓存。"),
    ],
    20: [
        h("5.4.3.1 后端运行阶段", 3),
        code("""WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \\
    PYTHONUNBUFFERED=1 \\
    PIP_NO_CACHE_DIR=1
COPY app ./app
COPY scripts ./scripts
COPY resources ./resources
COPY run.py .
RUN test -s resources/seed/studymate.db.gz
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=3s \\
  --start-period=20s --retries=5 \\
  CMD curl -fsS http://localhost:8000/api/ping || exit 1
CMD ["python", "scripts/docker_entrypoint.py"]"""),
        p("入口脚本只在 /app/data/studymate.db 不存在时解压并播种数据库。线上卷已存在时，即使镜像内种子库更新，也不会隐式覆盖真实运行数据。"),
    ],
    26: [
        h("5.5.3.1 前端更新验收", 3),
        code("""docker compose --env-file .deploy.env ps frontend
docker logs --tail=80 studymate-frontend
curl -fsSI http://127.0.0.1:5173/
curl -fsSI https://matropic.cn/

# 查看本次构建生成的哈希资源
docker exec studymate-frontend \\
  find /usr/share/nginx/html/assets -maxdepth 1 -type f | sort | tail"""),
        p("更新后先验证容器 healthy，再从公网检查首页。若浏览器仍显示旧内容，应比较 index.html 引用的哈希文件，而不是清理数据库或重启后端。"),
    ],
    27: [
        h("5.5.4.1 回滚记录", 3),
        table(
            ["记录项", "示例", "回滚用途"],
            [
                ["代码版本", "Git short SHA", "恢复对应源码"],
                ["镜像摘要", "RepoDigest/Image ID", "确认实际运行镜像"],
                ["数据库备份", "日期时间.db", "恢复业务数据"],
                ["配置摘要", ".deploy.env 变量名", "恢复域名/profile"],
                ["验收结果", "登录/AI/代码", "判断回归范围"],
            ],
            widths=[3.7, 5.0, 6.9],
            font_size=8.0,
        ),
        p("回滚代码与回滚数据是两件不同的操作。一般代码回滚只替换镜像并保留当前卷；只有确认数据库迁移或数据损坏时，才在停机和二次备份后恢复旧数据库。"),
    ],
    34: [
        h("7.4.1 代码沙箱输入边界", 3),
        table(
            ["项目", "后端限制"],
            [
                ["源码", "最大 50KB"],
                ["标准输入", "最大 10KB"],
                ["命令行参数", "最多 16 个"],
                ["运行超时", "10 秒"],
                ["编译超时", "15 秒"],
                ["并发", "Piston 容器整体最多 2 个任务"],
            ],
            widths=[5.0, 10.6],
            font_size=8.0,
        ),
        code("""# Python 冒烟测试
curl -sS https://matropic.cn/api/run \\
  -H 'Content-Type: application/json' \\
  -d '{"language":"python","source":"print(6*7)"}'"""),
    ],
    36: [
        h("8.1.1 分层定位顺序", 3),
        code("""# 1. 容器与健康状态
docker compose --env-file .deploy.env ps -a
# 2. 后端本机健康
curl -v http://127.0.0.1:8000/api/ping
# 3. 前端容器到后端
docker exec studymate-frontend \\
  wget -qO- http://backend:8000/api/ping
# 4. 前端本机入口
curl -I http://127.0.0.1:5173/
# 5. Caddy 公网入口
curl -Iv https://matropic.cn/"""),
        p("按照后端、Docker 内网、前端、Caddy 的顺序逐层验证，可快速确定 502 出现在请求链路的哪一段。不要只看浏览器报错就直接重装 Docker。"),
    ],
    37: [
        h("8.2.1 证书与沙箱专项检查", 3),
        code("""getent ahostsv4 matropic.cn
docker logs --tail=200 studymate-caddy
openssl s_client -connect matropic.cn:443 \\
  -servername matropic.cn </dev/null 2>/dev/null \\
  | openssl x509 -noout -issuer -dates

docker inspect studymate-piston --format '{{.State.Status}}'
curl -sS http://127.0.0.1:2000/api/v2/runtimes \\
  | python3 -m json.tool"""),
        note("Piston 使用 privileged 提供 isolate 所需 namespace 能力；必须同时保持 127.0.0.1 端口绑定、容器整体资源上限和输入/超时限制。", "沙箱边界"),
    ],
    38: [
        h("9.1.1 自动恢复与重启次数", 3),
        code("""systemctl is-enabled docker
systemctl is-active docker
docker inspect studymate-backend \\
  --format 'restart={{.HostConfig.RestartPolicy.Name}} count={{.RestartCount}}'
docker inspect studymate-frontend \\
  --format 'restart={{.HostConfig.RestartPolicy.Name}} count={{.RestartCount}}'
docker inspect studymate-caddy \\
  --format 'restart={{.HostConfig.RestartPolicy.Name}} count={{.RestartCount}}'"""),
        p("核心容器使用 unless-stopped，服务器重启后会随 Docker 恢复。RestartCount 持续增加通常表示应用崩溃，应先查看日志和资源占用，而不是依赖无限重启掩盖问题。"),
    ],
    39: [
        h("9.2.1 恢复与备份轮换", 3),
        code("""# 恢复前：再次备份当前数据库并停止后端
docker compose --env-file .deploy.env stop backend
docker run --rm \\
  -v studymate_backend_data:/data \\
  -v "$HOME/studymate-backups:/backup:ro" \\
  alpine:3.20 sh -c \\
  'cp /backup/指定备份.db /data/studymate.db && rm -f /data/studymate.db-wal /data/studymate.db-shm'
docker compose --env-file .deploy.env start backend
curl -fsS http://127.0.0.1:8000/api/ping

# 只保留人工确认后的历史备份；删除前先列出
find ~/studymate-backups -type f -name '*.db' -printf '%TY-%Tm-%Td %p\n' | sort"""),
        p("恢复后需要复核用户、课程、知识块和外键完整性。备份应至少保留一份在服务器之外，避免系统盘故障或误操作同时损坏线上卷与本机备份目录。"),
    ],
}

# The compact delivery edition keeps the verified commands in the main chapters
# and omits the optional density supplements, so its body remains only slightly
# richer than the reference rather than becoming a second operations manual.


# The reference allocates pages 29—42 to SSL, verification, seven classes of
# troubleshooting, operations, and four appendix sections. Rebuild that slice
# explicitly so every reference topic has a StudyMate equivalent while keeping
# the original 42 numbered body pages.
LONG_PAGES[28:] = [
    [
        h("6. SSL 证书配置"),
        h("6.1 本地与测试环境访问", 2),
        p("适用场景：开发机、局域网联调或域名尚未生效的临时环境。因材智训默认以 SITE_ADDRESS=http://localhost 启动本地 HTTP，不需要证书，也不会影响生产环境的 Caddy 数据卷。"),
        table(
            ["测试方案", "配置方式", "浏览器表现", "建议"],
            [
                ["本地 HTTP", "SITE_ADDRESS=http://localhost", "无证书提示", "开发联调首选"],
                ["Caddy 内部证书", "站点块加入 tls internal", "首次需信任本地 CA", "仅封闭测试网"],
                ["手工自签名", "自行生成并挂载证书", "默认显示安全警告", "不建议用于本项目"],
            ],
            widths=[3.2, 5.0, 4.0, 3.4],
            font_size=7.7,
        ),
        code("""# 本地基础栈：backend + frontend
docker compose up -d --build
curl -I http://127.0.0.1:5173/
curl http://127.0.0.1:8000/api/ping

# 如需封闭测试网内部 TLS，可在独立 Caddy 配置中使用：
# https://test.studymate.local {
#   tls internal
#   reverse_proxy frontend:80
# }"""),
        note("生产公网不得使用自签名证书或引导评委点击“继续访问”。正式域名应使用受浏览器信任的自动 HTTPS。", "测试环境边界"),
        h("6.2 Let's Encrypt 生产证书", 2),
        p("生产环境由 Caddy 根据 SITE_ADDRESS 自动申请、保存和续期 Let's Encrypt 证书，等价替代参考文档中的 Certbot 与 Nginx SSL 手工配置。"),
        table(
            ["前提条件", "因材智训当前配置"],
            [
                ["DNS", "matropic.cn 的 A 记录指向 121.40.64.199"],
                ["网络", "云安全组与 UFW 同时开放 80、443"],
                ["Compose", "COMPOSE_PROFILES 包含 public"],
                ["Caddy", "SITE_ADDRESS=matropic.cn，caddy_data/config 持久化"],
            ],
            widths=[4.0, 11.6],
            font_size=8.0,
        ),
    ],
    [
        h("6.2 Let's Encrypt 生产证书（续）", 2),
        code("""cd ~/studymate
getent ahostsv4 matropic.cn
docker compose --env-file .deploy.env up -d caddy
docker logs --tail=160 studymate-caddy
curl -I http://matropic.cn
curl -I https://matropic.cn"""),
        p("验证成功标志：Caddy 日志出现证书获取成功信息，HTTP 返回 308 并跳转到 HTTPS，HTTPS 返回 HTTP/2 200；证书保存在 studymate_caddy_data 卷中并由 Caddy 自动续期。"),
        p("证书签发后还应从外部网络核对证书链、域名和有效期，并复测 HTTP 跳转、安全 Cookie 与 SSE，确认业务链路全部处于 HTTPS 下。"),
        h("6.3 证书切换与域名变更", 2),
        p("从本地 HTTP、内部证书或旧域名切换到正式域名时，只修改 .deploy.env 中的 SITE_ADDRESS 和 DNS，不复制旧证书文件，也不安装 Certbot。"),
        code("""# 1. 先把新域名 A 记录解析到服务器
# 2. 修改服务器 .deploy.env：SITE_ADDRESS=新域名
docker compose --env-file .deploy.env config --quiet
docker compose --env-file .deploy.env up -d caddy
docker logs --tail=160 studymate-caddy

openssl s_client -connect 新域名:443 -servername 新域名 \\
  </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates"""),
        note("保留 caddy_data 与 caddy_config；严禁为“重新签证书”而执行 docker compose down -v。", "证书数据保护"),
        h("7. 验证部署"),
        h("7.1 检查服务状态", 2),
        code("""cd ~/studymate
docker compose --env-file .deploy.env ps
docker inspect studymate-backend \\
  --format '{{.State.Status}} / {{.State.Health.Status}}'
docker inspect studymate-frontend \\
  --format '{{.State.Status}} / {{.State.Health.Status}}'"""),
    ],
    [
        h("7.1 检查服务状态（续）", 2),
        table(
            ["服务", "当前状态", "验证成功标志"],
            [
                ["backend", "running / healthy", "/api/ping 返回 status=ok"],
                ["frontend", "running / healthy", "Nginx 首页健康检查通过"],
                ["caddy", "running", "80/443 已映射，HTTPS 正常"],
                ["piston-api", "running", "Python 与 GCC runtime 可查询"],
            ],
            widths=[3.6, 4.4, 7.6],
            font_size=8.0,
        ),
        h("7.2 检查端口监听", 2),
        code("""ss -lntp | grep -E ':(22|80|443|2000|5173|8000)'
sudo ufw status numbered"""),
        table(
            ["端口", "预期监听", "策略"],
            [
                ["22", "服务器公网/受限来源", "SSH 维护"],
                ["80、443", "0.0.0.0 与 ::", "唯一公网 Web 入口"],
                ["5173", "127.0.0.1", "前端本机排障"],
                ["8000", "127.0.0.1", "FastAPI 本机排障"],
                ["2000", "127.0.0.1", "Piston 本机排障"],
            ],
            widths=[3.1, 5.4, 7.1],
            font_size=8.0,
        ),
        h("7.3 测试应用访问", 2),
        code("""curl -I http://matropic.cn
curl -I https://matropic.cn
curl -sS https://matropic.cn/api/ping | python3 -m json.tool
curl -sS http://127.0.0.1:2000/api/v2/runtimes \\
  | python3 -m json.tool"""),
        p("当前公网验收结果为 HTTP 308、HTTPS HTTP/2 200；/api/ping 返回 status=ok、已配置真实模型服务，Piston 可查询 Python 3.10 与 GCC 10.2 运行时。"),
    ],
    [
        h("7.4 浏览器访问测试", 2),
        p("从服务器以外的 PC 浏览器和手机流量网络访问 https://matropic.cn，避免只验证 localhost 形成假阳性。"),
        bullets([
            "首页、登录页、课程页、工作台及静态图片正常加载，地址栏显示可信 HTTPS。",
            "使用管理员、评委、普通学生三类账号登录，角色权限与安全 Cookie 正常。",
            "切换五门课程，RAG 来源与生成资源不跨课程串用。",
            "AI 助教逐段返回 meta、delta、done 事件，语音与附件接口提示正常。",
            "运行 Python、C11、C++17 示例，确认不是 mock 结果。",
            "页面底部显示豫ICP备2026028221号并链接工信部备案系统。",
        ]),
        h("7.5 运行监控与验收记录", 2),
        code("""bash scripts/deploy.sh status
docker stats --no-stream
df -h /
docker volume ls --format '{{.Name}}' | grep '^studymate_'"""),
        table(
            ["验收维度", "2026-07-18 实际结果"],
            [
                ["服务器", "Ubuntu 22.04.5、4 vCPU、7.1 GiB、59G 系统盘/43G 可用"],
                ["服务", "4 个核心容器运行，前后端 healthy"],
                ["数据", "部署种子 34 用户；线上当前 38 用户；5 课程、938 知识块"],
                ["数据库", "integrity_check=ok，foreign_key_check=0"],
                ["公网", "HTTP 308 → HTTPS，HTTPS HTTP/2 200"],
            ],
            widths=[4.0, 11.6],
            font_size=7.8,
        ),
        h("8. 常见问题排查"),
        h("8.1 应用或容器无法启动", 2),
        p("症状：Compose 显示 Exited、unhealthy 或 restart count 持续增加。先保留现场，不删除卷、不重装 Docker。"),
        code("""docker compose --env-file .deploy.env ps -a
docker compose --env-file .deploy.env config --quiet
docker logs --tail=200 studymate-backend
docker logs --tail=200 studymate-frontend"""),
    ],
    [
        h("8.1 应用或容器无法启动（续）", 2),
        table(
            ["常见原因", "排查与处理"],
            [
                ["环境变量缺失", "只核对变量名和 config 输出；不要把真实值写入工单或文档"],
                ["端口被占用", "用 ss -lntp 查 80/443/5173/8000/2000，停止旧服务"],
                ["镜像构建失败", "根据失败域名检查 Docker、Debian、PyPI、npm 或 GHCR 对应镜像源"],
                ["docker.sock 权限", "重新登录 SSH，确认 deploy 属于 docker 组；不要 chmod 777"],
                ["健康检查失败", "直接 curl 容器本机端点并查看 health 日志"],
            ],
            widths=[4.2, 11.4],
            font_size=7.8,
        ),
        h("8.2 502 Bad Gateway", 2),
        p("症状：浏览器或 Caddy 返回 502。因材智训请求链为 Caddy → frontend Nginx → backend:8000，应逐层定位。"),
        code("""# 1. FastAPI 宿主机回环
curl -v http://127.0.0.1:8000/api/ping
# 2. 前端容器访问后端
docker exec studymate-frontend \\
  wget -qO- http://backend:8000/api/ping
# 3. 前端宿主机回环
curl -I http://127.0.0.1:5173/
# 4. 公网网关
curl -Iv https://matropic.cn/"""),
        table(
            ["失败位置", "重点检查"],
            [
                ["步骤 1", "backend 状态、启动迁移、SQLite 卷、backend 日志"],
                ["步骤 2", "Compose 网络、服务名 backend、Nginx upstream"],
                ["步骤 3", "前端构建产物、Nginx 配置与健康检查"],
                ["步骤 4", "Caddyfile、域名、证书、80/443 映射"],
            ],
            widths=[3.5, 12.1],
            font_size=8.0,
        ),
    ],
    [
        h("8.3 SQLite 数据库异常", 2),
        p("症状：后端日志出现 OperationalError、database is locked、no such table 或数据数量异常。SQLite 位于 studymate_backend_data 卷，不存在独立数据库端口和远程密码。"),
        code("""docker exec -i studymate-backend python <<'PY'
import sqlite3
c = sqlite3.connect('/app/data/studymate.db')
print(c.execute('pragma integrity_check').fetchone())
print(c.execute('pragma foreign_key_check').fetchall())
print('users=', c.execute('select count(*) from users').fetchone()[0])
print('courses=', c.execute('select count(*) from courses').fetchone()[0])
print('chunks=', c.execute('select count(*) from knowledge_chunks').fetchone()[0])
PY"""),
        table(
            ["现象", "处理方法"],
            [
                ["新卷没有数据库", "确认镜像含 resources/seed/studymate.db.gz，查看 entrypoint 日志"],
                ["线上仍是旧数据", "这是持久化设计；镜像更新不会覆盖已有 /app/data/studymate.db"],
                ["完整性失败", "停止写入、二次备份，使用最近已验证备份恢复"],
                ["短时 locked", "检查并发写入、长事务和磁盘，不复制正在写入的数据库文件"],
            ],
            widths=[4.2, 11.4],
            font_size=7.8,
        ),
        h("8.4 SSE 或语音流异常", 2),
        p("参考文档的 WebSocket 实时通信在因材智训中对应 AI 助教 SSE 单向流和独立语音 HTTP 接口。SSE 无需 Upgrade 头，但代理必须关闭响应缓冲并保留足够超时。"),
        code("""curl -N https://matropic.cn/api/tutor/chat \\
  -H 'Content-Type: application/json' \\
  -b '有效测试会话 Cookie' \\
  -d '{"course_id":1,"messages":[{"role":"user","content":"请简要解释时间复杂度"}]}'

docker logs --tail=200 studymate-backend
docker logs --tail=200 studymate-frontend"""),
        p("若无 delta 事件，检查模型提供商出站连通性、backend 日志和 Nginx/Caddy 的缓冲设置；若语音失败，检查讯飞变量是否配置，但不得输出其真实值。"),
    ],
    [
        h("8.5 静态文件 404 或缓存旧版", 2),
        p("症状：CSS、JS、图片 404，或服务器已更新但浏览器仍显示旧页面。前端采用 Vite 哈希资源与 Nginx SPA 回退。"),
        code("""docker compose --env-file .deploy.env up -d --build frontend
docker compose --env-file .deploy.env ps frontend
docker exec studymate-frontend \\
  find /usr/share/nginx/html/assets -maxdepth 1 -type f | sort | tail
curl -fsSI http://127.0.0.1:5173/
curl -fsSI https://matropic.cn/"""),
        table(
            ["现象", "处理"],
            [
                ["首页 404", "检查 /usr/share/nginx/html/index.html 与 default.conf"],
                ["子路由 404", "确认 try_files 回退到 /index.html"],
                ["旧版页面", "核对新哈希文件；浏览器 Ctrl+F5，不清理数据库"],
                ["/api 404", "检查 Nginx /api 代理，不要在前端写死公网后端端口"],
            ],
            widths=[4.0, 11.6],
            font_size=8.0,
        ),
        h("8.6 上传文件失败", 2),
        p("症状：413、415、422、解析失败或内容被截断。前端 Nginx 允许最大 20MB，请求到达后端后仍执行 10MB 文件限制、类型校验和最多 16000 字符的提取限制。"),
        code("""docker logs --tail=200 studymate-frontend
docker logs --tail=200 studymate-backend
docker exec studymate-frontend nginx -T 2>/dev/null \\
  | grep -n 'client_max_body_size'"""),
        note("不要使用 chmod -R 777 解决上传问题。上传内容写入 backend_data，应检查卷挂载、容器用户、文件类型和接口限制。", "权限原则"),
    ],
    [
        h("8.7 SSL 证书或 Piston 异常", 2),
        table(
            ["症状", "排查与处理"],
            [
                ["证书申请失败", "检查 DNS A 记录、80/443、安全组、UFW 与 Caddy 日志"],
                ["域名不匹配/过期", "检查 SITE_ADDRESS、系统时间和 caddy_data；让 Caddy自动管理"],
                ["GHCR 镜像失败", "运行 scripts/import-piston-image.sh 或从已验证主机离线导入"],
                ["runtimes 为空", "运行 scripts/init-piston.sh，确认 piston_data 卷未被删除"],
                ["代码返回 mock/502", "检查 backend 到 piston-api:2000 的 Docker 内网连接"],
            ],
            widths=[4.4, 11.2],
            font_size=7.8,
        ),
        code("""getent ahostsv4 matropic.cn
docker logs --tail=200 studymate-caddy
openssl s_client -connect matropic.cn:443 \\
  -servername matropic.cn </dev/null 2>/dev/null \\
  | openssl x509 -noout -issuer -dates

docker inspect studymate-piston --format '{{.State.Status}}'
curl -sS http://127.0.0.1:2000/api/v2/runtimes \\
  | python3 -m json.tool"""),
        h("9. 日常运维"),
        h("9.1 查看日志", 2),
        code("""cd ~/studymate
docker compose --env-file .deploy.env logs -f --tail=200 backend
docker compose --env-file .deploy.env logs -f --tail=200 frontend
docker compose --env-file .deploy.env logs -f --tail=200 caddy
docker compose --env-file .deploy.env logs -f --tail=200 piston-api"""),
        p("Docker daemon 使用 local 日志驱动，单容器日志按 100MB、最多 5 个文件轮换；出现故障时先保存相应时间段日志、请求路径和版本号。"),
    ],
    [
        h("9.2 服务管理、更新与备份", 2),
        code("""cd ~/studymate
bash scripts/deploy.sh status
docker compose --env-file .deploy.env restart backend
docker compose --env-file .deploy.env restart frontend
docker compose --env-file .deploy.env restart caddy

# 仅更新前端
docker compose --env-file .deploy.env up -d --build frontend
# 完整更新
bash scripts/deploy.sh"""),
        p("Docker 的 restart: unless-stopped 与 Compose 命令等价替代参考文档中的 Supervisor：宿主机重启后自动恢复，日常可统一查看状态、日志、重启和更新。停止整个应用可使用 deploy.sh down，该命令不删除卷。"),
        h("9.2.1 SQLite 在线备份与恢复", 3),
        code("""mkdir -p ~/studymate-backups
docker exec studymate-backend python -c '
import sqlite3
s=sqlite3.connect("/app/data/studymate.db")
d=sqlite3.connect("/app/data/studymate-backup.db")
s.backup(d); d.close(); s.close()'
docker cp studymate-backend:/app/data/studymate-backup.db \\
  ~/studymate-backups/studymate-$(date +%F_%H%M%S).db
docker exec studymate-backend rm -f /app/data/studymate-backup.db"""),
        p("恢复前先再次备份当前数据库并停止 backend，再把已验证备份写入 studymate_backend_data；启动后重新执行用户/课程/知识块数量、integrity_check 与 foreign_key_check。至少保留一份异机备份。"),
        note("更新不得执行 docker compose down -v；该命令会删除线上 SQLite、Piston runtime 和 Caddy 证书。", "数据保护红线"),
    ],
    [
        h("9.3 性能与资源优化", 2),
        table(
            ["对象", "当前优化", "扩容前检查"],
            [
                ["Caddy", "HTTP/2、zstd/gzip、自动 TLS", "连接数、证书日志、出口带宽"],
                ["Frontend Nginx", "Vite 哈希资源、静态缓存、SPA 回退", "缓存头、资源 404、镜像体积"],
                ["FastAPI/Uvicorn", "异步接口、SSE、健康检查", "AI 延迟、超时、CPU/内存"],
                ["SQLite/RAG", "命名卷、在线备份、938×1024 向量内存检索", "写锁、慢查询、数据量与并发"],
                ["Piston", "2 CPU、2GB、256 PID、2 并发、10/15 秒超时", "沙箱队列、runtime、磁盘"],
                ["Docker", "构建缓存、local 日志轮换、unless-stopped", "镜像缓存、重启次数、磁盘"],
            ],
            widths=[3.2, 7.2, 5.2],
            font_size=7.5,
        ),
        code("""docker stats --no-stream
docker system df
df -h /
docker inspect studymate-backend \\
  --format 'restart={{.RestartCount}} memory={{.HostConfig.Memory}}'

docker exec -i studymate-backend python <<'PY'
import sqlite3
c=sqlite3.connect('/app/data/studymate.db')
print(c.execute('pragma integrity_check').fetchone())
c.execute('pragma optimize')
PY"""),
        bullets([
            "当前 4 vCPU、7.1 GiB 服务器适合竞赛演示和小规模访问；扩大并发前先压测。",
            "不要缓存鉴权、SSE 或个性化 API 响应；长缓存仅用于带内容哈希的静态资源。",
            "SQLite 适合当前单机规模；只有实际写并发和数据规模超出边界时再评估 PostgreSQL。",
            "清理镜像、备份或日志前先列出对象并确认用途，不在自动脚本中执行破坏性 prune。",
        ]),
    ],
    [
        h("10. 附录"),
        h("10.1 文件说明", 2),
        code("""studymate/
├── backend/                         # FastAPI、Uvicorn、SQLite 与种子资源
│   ├── app/                         # API、模型、智能体、RAG
│   ├── resources/seed/studymate.db.gz
│   ├── scripts/docker_entrypoint.py
│   └── Dockerfile
├── frontend/                        # React、Vite、Nginx
│   ├── src/
│   ├── nginx.conf
│   └── Dockerfile
├── scripts/                         # 初始化、部署、种子和 Piston 工具
├── docs/                            # 应用维护与部署说明
├── docker-compose.yml
├── Caddyfile
├── .env.example                     # 后端运行配置模板
├── .deploy.env.example
└── README.md"""),
        table(
            ["文件/目录", "用途", "是否含敏感值"],
            [
                ["docker-compose.yml", "四个核心服务、网络、卷、资源限制", "否"],
                ["Caddyfile", "公网 HTTPS、压缩、反向代理", "否"],
                [".deploy.env.example", "生产 Compose 变量模板", "否"],
                ["backend/.env", "模型、语音、邮件、认证运行配置", "是，仅服务器"],
                ["backend_data", "线上 SQLite 与上传内容", "是，命名卷"],
                ["resources/seed/studymate.db.gz", "脱敏首次启动基线", "仅获准演示数据"],
            ],
            widths=[5.2, 7.0, 3.4],
            font_size=7.6,
        ),
    ],
    [
        h("10.1 文件说明（续）", 2),
        table(
            ["参考文档部署文件", "因材智训对应文件/机制"],
            [
                ["gunicorn_config.py", "backend 容器内 Uvicorn 启动入口"],
                ["Nginx sites-available", "frontend/nginx.conf + Caddyfile"],
                ["Supervisor 配置", "docker-compose.yml restart: unless-stopped"],
                ["数据库安装/建库脚本", "压缩 SQLite 种子 + backend_data 首次播种"],
                ["monitor.sh", "deploy.sh status、Compose ps/logs、docker stats"],
                ["backup.sh", "SQLite backup API 命令；当前由维护人员按需执行"],
            ],
            widths=[6.1, 9.5],
            font_size=7.8,
        ),
        table(
            ["生产项", "当前状态"],
            [
                ["公网地址", "https://matropic.cn"],
                ["ICP备案", "豫ICP备2026028221号"],
                ["核心容器", "backend/frontend healthy，caddy/piston running"],
                ["部署数据", "种子 34 用户；线上当前 38 用户；5 课程、938 知识块"],
                ["代码运行", "Python 3.10、C11、C++17；Python 含 scikit-learn 1.3.2"],
            ],
            widths=[4.2, 11.4],
            font_size=7.8,
        ),
        h("10.2 移动端与小程序部署情况", 2),
        p("因材智训当前交付形态是响应式 Web，不另行发布微信小程序。手机浏览器可直接通过备案域名访问，复用同一套 HTTPS、账号、课程和后端接口，不存在体验版、审核中或独立小程序服务器。"),
        image("mobile_web.png", "图 10-1 因材智训移动端 Web 访问示意", 7.0),
    ],
    [
        h("10.2 移动端与小程序部署情况（续）", 2),
        table(
            ["终端", "适合功能", "使用建议"],
            [
                ["手机浏览器", "登录、课程浏览、AI 助教、笔记、测验、学习报告", "直接访问 matropic.cn"],
                ["PC 浏览器", "思维导图、复杂可视化、长文档编辑、在线编程", "竞赛完整演示首选"],
                ["微信小程序", "当前未发布", "如后续立项，需单独完成主体、备案、审核与接口适配"],
            ],
            widths=[3.4, 7.0, 5.2],
            font_size=7.8,
        ),
        h("10.3 测试网址与账号", 2),
        image("site_qr.png", "图 10-2 因材智训网页端直达二维码", 5.0),
        p("公网安全访问网址：https://matropic.cn；公网 IP：121.40.64.199。浏览器应直接显示可信 HTTPS。"),
        table(
            ["账号组", "账号范围", "数量", "竞赛测试密码"],
            [
                ["管理员", "admin@studymate.com", "1", "admin123456"],
                ["评委", "judge01@studymate.com ～ judge10@studymate.com", "10", "judge123456"],
                ["命名学生", "8 个指定 @studymate.com 学生账号", "8", "user123456"],
            ],
            widths=[2.8, 7.2, 1.6, 4.0],
            font_size=7.3,
        ),
        note("以上共 19 个账号构成可提交种子基线。线上新增用户属于持久化运行数据，镜像更新不会自动删除。", "账号口径"),
    ],
    [
        h("10.3 测试网址与账号（续）", 2),
        p("8 个命名学生账号为：sunjiayu、baixinyue、yuanshicong、chenzhuo、lijiayi、zhouxiang、tianyixin、liufei，邮箱域均为 @studymate.com。测试账号仅用于竞赛环境，正式运营前应统一轮换密码并重新审计权限。"),
        h("10.4 项目代码与交付清单", 2),
        p("项目代码随竞赛作品源码压缩包提交，服务器部署目录为 /home/deploy/studymate。正式提交时在本节补充代码仓库或网盘链接及对应二维码；当前文档不虚构尚未确定的公开地址。"),
        table(
            ["交付文件", "用途"],
            [
                ["scripts/bootstrap-ubuntu.sh", "Ubuntu、Docker、镜像源和 UFW 一次性初始化"],
                ["scripts/deploy.sh", "一键构建、启动、状态、日志和安全停止"],
                ["scripts/import-piston-image.sh", "GHCR 受限时导入 Piston 镜像"],
                ["scripts/init-piston.sh", "幂等安装 Python/GCC runtime 与 scikit-learn"],
                ["scripts/build_seed_db.py", "生成并校验 34 账号脱敏压缩种子"],
                ["项目部署文档.docx/.pdf", "完整的部署、验收、排障和运维说明"],
                ["系统部署说明书.docx/.pdf", "面向快速交付的系统部署说明"],
            ],
            widths=[7.0, 8.6],
            font_size=7.6,
        ),
        h("最终验收清单", 3),
        bullets([
            "域名、DNS、备案与可信 HTTPS 正常。",
            "四个核心容器及命名卷状态正常。",
            "种子 19 个获准账号准确，线上新增数据已区分。",
            "5 门课程、1709 个知识块及 1709 个检索向量完整。",
            "登录、RAG、AI SSE、语音/附件、Python/C/C++ 通过。",
            "备份、前端快速更新、完整更新和回滚命令可执行。",
            "交付包排除真实密钥、本地数据库、日志、缓存和私钥。",
            "作者姓名、代码链接/二维码在正式提交前补齐。",
        ]),
        note("公开交付包只能包含 .env.example、.deploy.env.example 和脱敏种子库，不包含服务器 backend/.env、.deploy.env 或任何真实 API Key。", "提交前检查"),
    ],
]


SHORT_TOC = [
    (1, "1 系统概述", 1),
    (2, "1.1 项目简介", 1),
    (2, "1.2 环境地址", 1),
    (2, "1.3 核心功能模块", 1),
    (1, "2 技术架构", 2),
    (2, "2.1 系统架构", 2),
    (2, "2.2 技术栈详情", 3),
    (1, "3 环境要求", 3),
    (2, "3.1 硬件配置", 3),
    (2, "3.2 软件环境", 4),
    (2, "3.3 网络与端口", 4),
    (1, "4 部署流程", 4),
    (2, "4.1 部署准备", 4),
    (2, "4.2 详细部署步骤", 5),
    (2, "4.3 部署完成与访问确认", 6),
    (1, "5 运维与监控", 7),
    (2, "5.1 日常维护", 7),
    (2, "5.2 数据备份与恢复", 7),
    (2, "5.3 故障排查", 7),
]


SHORT_PAGES = [
    [
        h("1 系统概述"),
        h("1.1 项目简介", 2),
        p("因材智训是面向高校计算机类课程的个性化资源生成与学习多智能体系统，融合学习画像、混合检索、资源生成、测验评估、语音交互和在线代码执行。"),
        p("系统覆盖五门计算机课程，七个智能体分别负责检索、讲解、导图、测验、阅读、代码和学习路径，生成内容可保存并追溯来源。"),
        h("1.2 环境地址", 2),
        p("开发环境：http://localhost:5173"),
        p("生产环境：https://matropic.cn（已部署，可访问）"),
        p("服务器公网 IP：121.40.64.199；备案号：豫ICP备2026028221号。"),
        p("测试账户：种子库共 19 个账号，包括 1 个管理员、10 个评委和 8 个命名学生。"),
        h("1.3 核心功能模块", 2),
        table(
            ["功能模块", "核心功能点"],
            [
                ["用户与权限", "邮箱认证：支持注册、登录、退出和会话续期。\n角色权限：区分 student、judge、admin。\n安全会话：采用 HttpOnly、SameSite 与 Secure Cookie。"],
                ["学习画像", "七维画像：记录基础、目标、薄弱点和学习偏好。\n证据更新：结合测验、行为和图片识别。\n确认写回：报告经用户确认后更新画像。"],
                ["课程与 RAG", "课程空间：五门课程独立检索与会话。\n混合检索：BM25 与 Qwen 向量经 RRF 融合。\n引用追溯：展示来源、页码和原文片段。"],
                ["多智能体生成", "Retriever：检索课程证据。\nDoc、MindMap、Quiz、Reading、Code：生成学习资源。\nPath：规划渐进学习路径并保存工作台。"],
                ["AI 助教", "课程对话：结合上下文和画像多轮问答。\n学习模式：支持费曼讲解与苏格拉底追问。\n流式与附件：支持 SSE、图片和文档。"],
            ],
            widths=[4.0, 12.0],
            font_size=7.2,
        ),
    ],
    [
        table(
            ["功能模块", "核心功能点"],
            [
                ["学习闭环", "笔记与错题：支持文件夹、标签和课程归档。\n测验报告：记录作答、掌握度和阶段建议。\n画像回写：确认后的结果用于后续生成。"],
                ["可视讲解", "主题资源：五门课程共 300 个可视主题。\n呈现方式：包含动画、黑板、公式、代码和图表。"],
                ["语音与拍照", "语音能力：支持 ASR 输入和多音色 TTS。\n图片能力：支持看图问答、拍照识题和图片转笔记。\n附件能力：支持常用文档与代码文件。"],
                ["拓展与就业", "学习资源：接入公开课程和可信阅读详情页。\n岗位建议：依据画像、课程和测验生成能力差距建议。"],
                ["代码与管理", "在线编程：运行 Python、C11 和 C++17，并限制资源。\n管理功能：支持账号、评委测试、反馈和统计。\n终端访问：PC 与手机共用 HTTPS 站点。"],
            ],
            widths=[4.0, 12.0],
            font_size=7.0,
        ),
        h("2 技术架构"),
        h("2.1 系统架构", 2),
        p("系统采用前后端分离和 Docker Compose 部署：Caddy 提供 HTTPS，Nginx 托管前端并代理 /api，FastAPI 连接 SQLite、课程 RAG、AI 服务和 Piston。"),
        p("业务数据库、Piston runtime 和 HTTPS 证书分别保存在命名卷中，容器重建与前端更新不会覆盖已有运行数据。"),
        image("architecture_short.png", "图 2-1 系统架构图", 11.8, 13.0),
    ],
    [
        h("2.2 技术栈详情", 2),
        table(
            ["分层", "技术/组件", "核心作用及当前状态"],
            [
                ["基础设施层", "阿里云 ECS / Ubuntu 22.04.5", "提供云主机、公网和备案域名。"],
                ["基础设施层", "Docker 29.6.1 / Compose v5.3.1", "编排容器、网络、卷和自动重启。"],
                ["基础设施层", "Caddy 2", "提供 80/443、自动 HTTPS 和压缩。"],
                ["基础设施层", "Node 20 + Frontend Nginx", "完成前端构建、静态托管和 /api 代理。"],
                ["数据与检索层", "SQLite / SQLAlchemy / aiosqlite / Named Volume", "保存业务与向量数据，空卷首次播种。"],
                ["数据与检索层", "BM25 + 中英文分词", "完成课程关键词召回。"],
                ["数据与检索层", "Qwen Embedding + RRF", "融合语义召回与 BM25 排名。"],
                ["数据与检索层", "PostgreSQL / Redis / Chroma", "extras 可选预留，主链路未启用。"],
                ["智能体与模型层", "DeepSeek / 星火 / MiMo / Qwen / Qwen-VL", "提供生成、助教、视觉和向量能力。"],
                ["智能体与模型层", "并发编排 + 7 个资源 Agent", "并发生成学习资源和路径。"],
                ["智能体与模型层", "讯飞 ASR/TTS + 可选 CosyVoice", "提供语音输入与多音色朗读。"],
                ["应用层（后端）", "Python 3.11 + FastAPI 0.115 + Uvicorn 0.32", "提供业务、AI、语音和代码 API。"],
                ["应用层（后端）", "Pydantic + SSE-Starlette + HTTPX / OpenAI SDK", "负责校验、流式事件和外部调用。"],
                ["应用层（后端）", "pypdf + multipart + pwdlib / aiosmtplib", "支持附件、认证和邮箱验证码。"],
                ["应用层（前端）", "React 19.2.6 + TypeScript 6.0.2 + Vite 8.0.12", "构建响应式单页应用。"],
                ["应用层（前端）", "Tailwind + Framer Motion + Monaco", "实现样式、动画和代码编辑。"],
                ["应用层（前端）", "Markdown / KaTeX / Shiki / Markmap / XYFlow / Recharts", "展示文档、公式、导图、路径和图表。"],
                ["代码沙箱层", "Piston isolate", "在 Docker 内网隔离执行代码。"],
                ["代码沙箱层", "Python 3.10 / GCC 10.2 / scikit-learn 1.3.2", "运行 Python、C11 和 C++17。"],
                ["用户层", "PC / 手机 Web 浏览器", "通过同一 HTTPS 域名访问。"],
            ],
            widths=[2.7, 4.4, 8.7],
            font_size=7.9,
            merge_columns=[0],
            center_columns=[0, 1],
            width_ratio=0.93,
        ),
        h("3 环境要求"),
        h("3.1 硬件配置", 2),
        table(
            ["配置级别", "CPU", "内存", "SSD", "带宽", "场景"],
            [
                ["最低", "2 核", "4GB", "30GB", "5Mbps", "开发、功能测试和低并发演示"],
                ["推荐", "4 核", "8GB", "60GB", "10Mbps", "竞赛评委访问与小规模公网使用"],
                ["当前", "4 vCPU", "7.1GiB", "59GB", "公网带宽", "已部署，系统盘约 43GB 可用"],
            ],
            widths=[2.4, 2.0, 2.0, 2.2, 2.3, 5.1],
            font_size=7.5,
        ),
        p("当前配置满足竞赛展示与小规模公网访问。"),
    ],
    [
        h("3.2 软件环境", 2),
        table(
            ["软件/组件", "版本/位置", "作用"],
            [
                ["Ubuntu Server", "22.04.5 / 宿主机", "提供 Docker、SSH 和防火墙环境。"],
                ["Docker + Compose", "29.6.1 / v5.3.1 / 宿主机", "管理镜像、容器、网络、卷和重启。"],
                ["Caddy", "2.x / caddy 容器", "提供公网 HTTPS、跳转和代理。"],
                ["Nginx + Node/Vite", "alpine、20 / frontend", "构建并托管前端，代理 /api/SSE。"],
                ["Python/FastAPI", "3.11 / 0.115 / backend", "由 Uvicorn 运行后端 ASGI 服务。"],
                ["SQLite/SQLAlchemy", "2.0.36 / backend_data", "持久化业务与向量数据。"],
                ["Piston", "latest / piston-api", "隔离运行 Python、C 和 C++。"],
                ["维护工具", "Git/Rsync/Curl/Skopeo/UFW / 宿主机", "上传、检查、镜像导入和防火墙维护。"],
                ["浏览器/DNS/CA", "现代浏览器 / 公网", "通过正式域名和可信证书访问。"],
            ],
            widths=[3.6, 5.0, 7.6],
            font_size=7.0,
            center_columns=[0, 1],
            width_ratio=0.96,
        ),
        h("3.3 网络与端口", 2),
        table(
            ["范围", "端口/网络", "用途", "访问策略"],
            [
                ["SSH", "22/TCP", "远程维护", "仅可信来源"],
                ["公网 Web", "80/443", "ACME、跳转和 HTTPS", "公网开放"],
                ["宿主回环", "5173/8000/2000", "前端、后端和 Piston 排障", "仅 127.0.0.1"],
                ["容器内网", "192.168.242.0/24", "核心服务通过名称互访", "不经公网"],
                ["出站", "DNS/80/443", "镜像、证书、模型和公开资源", "按需允许"],
            ],
            widths=[3.0, 3.5, 5.5, 4.2],
            font_size=7.0,
            center_columns=[0, 1],
            width_ratio=0.97,
        ),
        h("4 部署流程"),
        h("4.1 部署准备", 2),
        bullets(["准备 Ubuntu 22.04 服务器和 deploy 用户", "确认域名解析及 22/80/443 规则", "准备项目、脱敏种子库和服务器环境变量", "真实密钥仅保存在服务器，文件权限设为 600"]),
        p("Uvicorn、Docker restart/Compose、SQLite 命名卷以及 Caddy + Nginx 分别承担应用运行、进程恢复、数据持久化和公网代理，宿主机无需另装业务运行时。"),
        p("部署前确认镜像源可用、生产 Profile 已启用，Compose 配置和压缩种子库校验通过。"),
        p("同时应准备可恢复的数据备份并确认端口边界，避免在缺少回滚点或公网规则不明确时直接上线。"),
    ],
    [
        h("4.2 详细部署步骤", 2),
        p("步骤一：以 root/云助手安装 Docker、Compose、Skopeo 和 UFW，完成后重新登录 SSH："),
        code("""DEPLOY_USER=deploy \\
 bash /home/deploy/studymate-bootstrap.sh
docker --version
docker compose version"""),
        p("确认 Docker 为 active、deploy 属于 docker 组；下载失败时按 Docker Hub、GHCR 或依赖源分别排查。"),
        p("步骤二：生成脱敏 Docker 种子，保留 19 个账号、5 门课程和 1709 个知识块/向量："),
        code("""cd studymate
python3 scripts/build_seed_db.py
gzip -t backend/resources/seed/studymate.db.gz"""),
        p("确认数量正确、integrity_check=ok、foreign_key_check=0，且本地运行库未被修改。"),
        p("步骤三：上传项目，并排除环境变量、本地数据库、依赖、日志和备份："),
        code("""rsync -az --delete --progress \\
 --exclude '.git/' \\
 --exclude 'frontend/node_modules/' \\
 --exclude 'backend/.venv/' \\
 --exclude 'backend/.env' \\
 --exclude 'backend/studymate.db' \\
 --exclude '.deploy.env' \\
 --exclude 'backups/' --exclude '*.log' \\
 ./studymate/ studymate-server:~/studymate/"""),
        p("上传后确认 Compose、Caddyfile、部署脚本和压缩种子存在，服务器环境变量与备份未被覆盖。"),
        p("步骤四：配置 .deploy.env 与 backend/.env，真实值仅保存在服务器："),
        code("""COMPOSE_PROFILES=public,code-runner
SITE_ADDRESS=matropic.cn
CORS_ORIGINS=https://matropic.cn
SESSION_COOKIE_SECURE=true
chmod 600 backend/.env .deploy.env"""),
        note("真实模型、语音、邮件和认证密钥不得进入文档、截图、Git 或镜像。", "配置边界"),
    ],
    [
        h("4.2 详细部署步骤（续）", 2),
        p("步骤五：GHCR 受限时导入 Piston，并初始化 Python/GCC runtime："),
        code("""cd ~/studymate
bash scripts/import-piston-image.sh"""),
        p("Piston 运行时保存在 piston_data，后续更新无需重复下载。"),
        p("步骤六：一键构建、启动核心服务并初始化运行时："),
        code("""cd ~/studymate
bash scripts/deploy.sh
docker compose --env-file .deploy.env config --quiet"""),
        p("步骤七：检查服务、HTTPS、API 与运行时："),
        code("""bash scripts/deploy.sh status
curl -I https://matropic.cn
curl https://matropic.cn/api/ping
curl http://127.0.0.1:2000/api/v2/runtimes
ss -lntp | grep -E ':(80|443|2000|5173|8000)'"""),
        h("4.3 部署完成与访问确认", 2),
        table(
            ["验收对象", "检查方法", "成功标志", "实测"],
            [
                ["域名与 HTTPS", "getent、curl、外网浏览器", "解析正确，HTTP 跳转，HTTPS 200", "通过"],
                ["核心容器", "compose ps", "前后端 healthy，网关/沙箱运行", "通过"],
                ["端口边界", "ss、安全组、UFW", "仅 80/443 公网", "通过"],
                ["数据完整性", "数量、integrity/FK", "19 个种子账号、5 门课、1709 块/向量", "通过"],
                ["角色与会话", "三类账号登录", "权限分离，登录与退出正常", "通过"],
                ["RAG 与 AI", "课程问答、SSE", "引用正确，流式事件完整", "通过"],
                ["附件/语音/代码", "文件、录音、Python/C/C++", "解析、ASR/TTS 和运行正常", "通过"],
                ["备案与移动端", "PC/手机外网访问", "备案可见，页面响应式可用", "通过"],
            ],
            widths=[2.7, 4.2, 5.5, 3.7],
            font_size=6.55,
            center_columns=[0],
            width_ratio=0.97,
        ),
        p("Caddy 自动申请并续期正式证书；最终应从服务器外部网络完成角色、课程、AI、附件、语音、代码和备案验收。"),
        p("验收记录应与本次代码版本和数据库备份对应，便于后续复现问题或执行回滚。"),
    ],
    [
        h("5 运维与监控"),
        h("5.1 日常维护", 2),
        code("""cd ~/studymate
bash scripts/deploy.sh status
bash scripts/deploy.sh logs
docker stats --no-stream
docker system df
df -h
sudo ufw status numbered"""),
        p("仅更新前端：同步 frontend 后执行 docker compose --env-file .deploy.env up -d --build frontend。完整更新：同步代码后执行 bash scripts/deploy.sh。"),
        p("每次更新应记录部署时间和验收结果；即使只修改前端，也要从公网复测首页、登录和 /api 代理。"),
        h("5.2 数据备份与恢复", 2),
        p("线上 SQLite 位于 studymate_backend_data 卷，更新前使用 backup API 生成一致快照："),
        code("""mkdir -p ~/studymate-backups
docker exec studymate-backend python -c '
import sqlite3
s=sqlite3.connect("/app/data/studymate.db")
d=sqlite3.connect("/app/data/backup.db")
s.backup(d); d.close(); s.close()'
docker cp studymate-backend:/app/data/backup.db \\
 ~/studymate-backups/studymate-$(date +%F_%H%M%S).db"""),
        p("恢复前停止 backend 并备份当前库；恢复后检查核心数量、完整性和外键。"),
        note("严禁执行 docker compose down -v，该命令会删除数据库、Piston runtime 和 Caddy 证书。", "数据保护"),
        p("Piston 仅绑定 127.0.0.1，并保留 CPU、内存、PID 和并发限制；日常关注日志、磁盘、容器重启和 SQLite 写锁。"),
        h("5.3 故障排查", 2),
        table(
            ["症状", "定位方法", "处理与禁忌"],
            [
                ["容器无法启动", "config、ps 和容器日志", "修复变量或构建，禁止删除卷。"],
                ["镜像拉取超时", "按 Docker Hub、GHCR、依赖源定位", "切换对应国内源；Piston 使用导入脚本。"],
                ["502 Bad Gateway", "逐层检查 backend、Nginx、Caddy", "修复失败层并重启对应服务。"],
                ["SQLite 异常", "检查数据卷、完整性、外键和写锁", "停止写入并在线备份，禁止 down -v。"],
                ["AI/SSE/语音异常", "检查事件流、日志、出站与配置", "恢复网络或变量，不输出真实密钥。"],
                ["静态或上传异常", "检查哈希缓存、代理和大小格式", "重建前端或调整文件，不使用 777。"],
                ["SSL/Piston 异常", "检查 DNS、端口、Caddy、runtime API", "让 Caddy 重试或重新初始化 runtime。"],
            ],
            widths=[3.0, 5.4, 7.7],
            font_size=6.65,
            center_columns=[0],
            width_ratio=0.97,
        ),
    ],
]


def _insert_before_heading(pages, heading_text, blocks):
    """Insert logical-flow content before the first matching heading."""
    for page in pages:
        for index, block in enumerate(page):
            if block.get("kind") == "heading" and block.get("text") == heading_text:
                page[index:index] = blocks
                return
    raise ValueError(f"Heading not found: {heading_text}")


# Natural-flow additions: these sections intentionally add explanation and
# release criteria rather than more copies of Docker/curl commands.
_insert_before_heading(
    LONG_PAGES,
    "2. 系统要求",
    [
        h("1.4 部署目标、适用范围与非目标", 2),
        p("本方案的目标是在一台已备案的 Ubuntu 服务器上，以可复现、可备份、可回滚的方式运行因材智训，并为竞赛评委和小规模公网用户提供统一 HTTPS 入口。Docker Compose 负责服务编排，命名卷负责业务数据、代码运行时和证书持久化。"),
        table(
            ["边界项", "当前定义", "部署含义"],
            [
                ["适用规模", "竞赛展示、小规模公网访问", "以单机资源和 SQLite 写并发为容量边界，扩容前先压测。"],
                ["核心服务", "Caddy、Frontend、Backend、Piston", "公网只进入 Caddy，其余服务通过回环或 Docker 内网访问。"],
                ["数据权威", "backend_data 中的线上 SQLite", "镜像种子只初始化空卷，日常构建不得覆盖已有数据。"],
                ["外部依赖", "模型、语音、邮件和公开资源平台", "不可用时按能力降级，不把第三方故障误判为数据库或容器故障。"],
                ["非目标", "多机高可用、自动故障转移、多地域容灾", "如业务规模超过单机边界，应单独设计外置数据库、对象存储和负载均衡。"],
            ],
            widths=[3.2, 5.0, 7.4],
            font_size=7.5,
            center_columns=[0],
        ),
        p("因此，本次交付强调的是部署过程可重复、数据可恢复、故障可定位和版本可回退，而不是在竞赛阶段提前引入尚未验证的复杂基础设施。"),
    ],
)

_insert_before_heading(
    LONG_PAGES,
    "4.4 部署注意事项",
    [
        h("4.3.1 关键请求链路、状态归属与故障影响", 3),
        p("理解请求经过的组件和状态实际保存的位置，可以在故障发生时快速判断应检查网关、应用、外部服务还是数据卷。"),
        table(
            ["业务场景", "请求与数据路径", "状态归属", "故障影响与验收重点"],
            [
                ["静态页面", "浏览器 → Caddy → Frontend Nginx", "镜像内 dist 静态资源", "页面 404 或旧缓存不影响数据库；核对首页、子路由和哈希资源。"],
                ["登录与业务", "Nginx /api → FastAPI → SQLite", "backend_data 中的用户、会话和业务表", "后端或数据异常会影响登录和学习记录；检查 Cookie、健康端点和完整性。"],
                ["RAG 与 AI", "FastAPI → 课程检索 → 模型 → SSE", "课程知识在 SQLite，会话和生成记录写入业务库", "模型失败可与检索成功并存；验收应区分引用、事件流和真实模型状态。"],
                ["附件与语音", "浏览器 → /api → 文件解析/语音服务", "上传内容进入 backend_data，语音依赖外部服务", "格式、大小、出站网络或凭据均可能单项失败，不应阻塞无关课程功能。"],
                ["在线代码", "FastAPI → Docker 内网 → Piston", "runtime 保存在 piston_data", "沙箱不可用只影响代码运行；验收语言、超时、资源边界和非 mock 结果。"],
            ],
            widths=[2.6, 4.5, 4.1, 4.8],
            font_size=6.8,
            center_columns=[0],
        ),
        p("排障时应从离用户最近的入口向内逐层验证，同时避免用删除数据卷、清空数据库或重装 Docker 的方式处理单个组件故障。"),
    ],
)

_insert_before_heading(
    LONG_PAGES,
    "5.6 防火墙、权限与安全",
    [
        h("5.5.5 变更分级、上线门禁与回滚边界", 3),
        p("不同变更的风险、验证范围和回滚对象不同。发布前应先判断变更类型，再决定是否需要停机、备份或完整业务回归。"),
        table(
            ["变更类型", "上线前置与影响", "必须验证", "回滚对象"],
            [
                ["仅前端页面/样式", "保留后端、环境变量和全部命名卷；通常短暂切换", "生产构建、首页、登录、/api、关键交互与移动端", "上一版 frontend 镜像或代码"],
                ["后端业务/API", "先备份 SQLite；可能出现短时接口不可用", "/api/ping、登录、目标接口、SSE、权限和数据写入", "backend 镜像与兼容代码"],
                ["环境变量/模型", "记录变量名和配置摘要，禁止输出真实值", "Compose 校验、后端启动及受影响的模型、语音或邮件能力", "上一版配置与后端容器"],
                ["Caddy/Nginx/域名", "确认 DNS、证书卷和 80/443；可能影响全部公网访问", "HTTP 跳转、HTTPS、Cookie、SSE、上传和子路由", "上一版网关配置与镜像"],
                ["种子数据", "只影响未来空卷；不得隐式替换线上卷", "账号白名单、课程/知识块数量、gzip、完整性和外键", "上一版压缩种子"],
                ["数据库结构", "必须备份并提供显式迁移/兼容方案，不按普通镜像更新处理", "备份副本迁移、旧新代码兼容、完整性、外键和回滚演练", "迁移脚本、应用版本；必要时独立恢复数据"],
                ["宿主机/Docker", "需要维护窗口并确认 SSH 退路", "Docker、Compose、防火墙、网络、自动恢复和全部核心业务", "系统配置或已验证主机快照"],
            ],
            widths=[2.7, 4.6, 5.0, 3.3],
            font_size=6.7,
            center_columns=[0],
        ),
        note("缺少可恢复备份、Compose 配置失败、核心容器不健康、数据库完整性异常、权限边界失效或真实主链路只能返回 mock 时，均不得标记为上线完成。", "上线阻断项"),
        p("代码回滚与数据恢复是两项独立决策。通常只回滚镜像并保留当前数据；只有确认数据损坏或迁移不兼容时，才在停止写入和二次备份后恢复数据库。"),
    ],
)

_insert_before_heading(
    LONG_PAGES,
    "8. 常见问题排查",
    [
        h("7.6 验收证据与放行结论", 2),
        p("最终结论不只依据容器是否 running，而要把版本、配置、数据和公网业务操作绑定为一组可复核证据。"),
        table(
            ["结论", "判定条件", "处理方式"],
            [
                ["通过", "核心服务、数据、权限、HTTPS、真实 AI/RAG 和代码链路均达到验收标准", "记录版本与证据后允许展示或发布。"],
                ["限制通过", "非核心外部资源或可选语音能力降级，页面明确提示且学习主链路完整", "记录限制、影响范围和恢复条件，展示时主动说明。"],
                ["不通过", "登录、课程隔离、数据完整性、权限、HTTPS 或核心真实模型链路失败", "停止放行，保留现场并按失败层排查或回滚。"],
            ],
            widths=[2.8, 8.0, 4.8],
            font_size=7.4,
            center_columns=[0],
        ),
        h("7.6.1 近期前端更新验收", 3),
        table(
            ["更新内容", "验收标准", "部署意义"],
            [
                ["助教长内容与截图", "长链接、连续文本和代码不撑宽消息区；/tutor?capture=1 可展开完整对话", "便于评委阅读和录制完整问答证据。"],
                ["学习路径", "每行最多四个节点，按阶段深度蛇形回折；历史直线数据可兼容重排", "减少超宽画布并保持路径顺序清晰。"],
                ["画像与报告雷达", "轴标签保留文字安全区，助教侧栏显示当前值/5，报告图例位于绘图区外", "避免不同分辨率下文字裁切或遮挡。"],
                ["代码标准输入", "输入文字、光标和 stdin 控件在浅色/深色外层均清晰可见", "保证在线编程不仅能运行，也能可靠输入测试数据。"],
                ["浏览器回归", "建议 2～6 五组隔离脚本在生产前端和公网 HTTPS 环境通过", "将关键体验改动转化为可重复的发布门禁。"],
            ],
            widths=[3.3, 7.6, 4.7],
            font_size=7.1,
            center_columns=[0],
        ),
        p("验收记录至少关联 Git 提交、前后端镜像摘要、配置摘要、数据库备份、容器状态、端口/证书结果和外网业务走查；无法复现的口头结论不作为放行依据。"),
    ],
)

_insert_before_heading(
    LONG_PAGES,
    "10. 附录",
    [
        h("9.4 运维责任、恢复口径与外部依赖", 2),
        p("单机部署仍需要明确维护责任和恢复口径，避免发生故障后才临时判断由谁处理、恢复到哪个状态。"),
        table(
            ["维护对象", "主要责任", "最低留痕"],
            [
                ["基础设施", "服务器资源、SSH、安全组、UFW、Docker 和磁盘", "资源基线、端口规则、变更时间和异常日志。"],
                ["应用与配置", "代码版本、镜像、Compose、Caddy/Nginx 和环境变量名称", "提交号、镜像摘要、配置摘要和发布结果。"],
                ["数据", "SQLite 在线备份、完整性、异机副本和恢复演练", "备份时间、校验结果、存放位置和恢复记录。"],
                ["业务验收", "角色、课程、RAG、助教、附件、语音、代码和移动端", "测试账号类型、操作路径、结论和限制项。"],
                ["第三方服务", "模型、Embedding、语音、邮件和公开资源平台", "配置状态、额度/可用性、降级表现和恢复条件。"],
            ],
            widths=[3.2, 7.0, 5.4],
            font_size=7.3,
            center_columns=[0],
        ),
        bullets([
            "RPO 以上一次已通过完整性校验且可从服务器之外取得的备份为上限，不把镜像内种子视为线上备份。",
            "RTO 不写未经演练的固定分钟数，以最近一次恢复演练记录、数据规模和当时网络条件为准。",
            "模型或语音故障若有明确提示且学习主链路完整，可记录为限制通过；登录、数据、权限和 HTTPS 故障属于阻断项。",
            "比赛结束后应轮换公开测试密码和外部服务凭据，并保留最终版本、镜像和数据库备份。",
        ]),
    ],
)

_insert_before_heading(
    SHORT_PAGES,
    "2.2 技术栈详情",
    [
        h("2.1.1 部署形态与适用边界", 3),
        p("生产环境采用单机 Docker Compose：Caddy、Frontend、Backend 和 Piston 通过固定容器网络协作，SQLite、runtime 与证书保存在命名卷中。该形态适合竞赛展示和小规模公网访问，不包含多机高可用或自动数据库故障转移。"),
        table(
            ["对象", "当前边界"],
            [
                ["公网入口", "仅 Caddy 暴露 80/443，其余服务不直接对公网开放。"],
                ["数据", "线上 backend_data 为权威数据源，镜像种子只初始化空卷。"],
                ["外部能力", "模型、语音、邮件和公开资源异常时按能力降级并明确提示。"],
                ["扩容", "出现持续高并发、SQLite 写锁或单机资源不足后再评估外置服务。"],
            ],
            widths=[4.0, 11.6],
            font_size=7.6,
            center_columns=[0],
        ),
    ],
)

_insert_before_heading(
    SHORT_PAGES,
    "5 运维与监控",
    [
        h("4.4 上线判断与变更边界", 2),
        table(
            ["变更类型", "上线前置与必测项", "回滚对象"],
            [
                ["仅前端", "生产构建通过，复测首页、登录、/api、移动端和关键交互。", "上一版 frontend 镜像。"],
                ["应用或配置", "先备份数据库，校验 Compose，复测健康、权限、SSE 和受影响能力。", "后端/网关镜像及上一版配置。"],
                ["数据或结构", "必须有显式迁移、备份副本验证、完整性/外键检查和恢复演练。", "迁移与应用版本；必要时独立恢复数据。"],
            ],
            widths=[3.2, 8.0, 4.4],
            font_size=7.2,
            center_columns=[0],
        ),
        note("缺少可恢复备份、核心容器不健康、数据库异常、权限失效或真实主链路只能返回 mock 时，不得标记为上线完成。", "上线门禁"),
    ],
)

SHORT_PAGES[-1].extend([
    h("5.4 运维边界与验收留痕", 2),
    p("每次发布应记录代码版本、镜像摘要、配置摘要、数据库备份和最终验收结论。RPO 以上一次已校验且可异机取得的备份为上限；RTO 以实际恢复演练为准，不填写未经验证的固定耗时。"),
    bullets([
        "基础设施问题关注服务器、网络、Docker 和磁盘；应用问题关注镜像、配置、接口与日志；数据问题先停止写入并保留现场。",
        "前端更新后复测助教长内容与长截图、四列蛇形路径、雷达标签安全区以及代码标准输入可见性。",
        "模型、语音或公开资源降级必须明确提示；登录、数据完整性、权限和 HTTPS 异常属于上线阻断项。",
    ]),
    h("5.5 发布后观察与结束处理", 2),
    table(
        ["观察对象", "确认内容", "异常处理"],
        [
            ["服务", "容器健康、重启次数、错误日志和磁盘余量", "保留日志并定位具体服务，不删除命名卷。"],
            ["业务", "登录、课程、RAG、SSE、附件、语音和代码运行", "区分核心阻断与可选能力降级，必要时回滚镜像。"],
            ["数据", "用户/课程/知识块数量、完整性、外键和最新备份", "停止写入、二次备份，再决定修复或恢复。"],
            ["安全", "证书、公开端口、环境文件权限和测试账号", "关闭多余入口，比赛结束后轮换密码与外部凭据。"],
        ],
        widths=[3.2, 7.0, 5.4],
        font_size=7.3,
        center_columns=[0],
    ),
    p("发布观察完成后，应把最终代码版本、镜像摘要、验收结论和可恢复备份一并归档，作为下一次更新或故障恢复的基线。"),
    h("5.6 比赛展示与故障兜底", 2),
    table(
        ["展示环节", "正常路径", "异常时处理"],
        [
            ["登录与课程", "使用评委账号进入指定课程并确认画像", "切换备用测试账号，保留错误信息，不修改线上数据。"],
            ["AI 与资源生成", "展示真实 SSE、引用和工作台资源", "明确说明外部模型状态，使用已保存的真实生成记录继续展示。"],
            ["语音与外部资源", "展示已配置能力和可信详情页", "单项降级时保留文字学习主链路并给出可解释提示。"],
            ["在线代码", "运行已验证的 Python/C/C++ 示例", "Piston 异常时停止重复提交，展示既有结果并在演示后排障。"],
        ],
        widths=[3.4, 6.3, 5.9],
        font_size=7.2,
        center_columns=[0],
    ),
    p("比赛前应完成一次无调试操作的完整彩排，并准备已验证截图或录屏作为外部服务临时不可用时的辅助材料；兜底材料只能补充说明，不能把 mock 结果描述为真实运行。"),
])

LONG_PAGES[-1].extend([
    h("10.5 部署交接与复核", 2),
    table(
        ["交接项", "应交付内容", "接收方复核"],
        [
            ["访问与权限", "服务器地址、SSH 账号、维护人员范围和云控制台归属", "能够登录且未共享 root 密码或私钥。"],
            ["代码与镜像", "最终 Git 提交、前后端镜像摘要、回滚标签和构建说明", "版本标识与线上运行容器一致。"],
            ["配置", "环境变量名称、域名、Profile、端口和密钥保管位置", "Compose 校验通过，真实值不进入交付包。"],
            ["数据与备份", "线上数据数量、最近备份、完整性结果和异机副本位置", "备份可读取、可校验，并明确恢复责任人。"],
            ["验收与风险", "公网测试结果、限制通过项、已知风险和后续触发条件", "能够复现核心流程并理解禁止 down -v 等红线。"],
        ],
        widths=[3.2, 7.2, 5.2],
        font_size=7.2,
        center_columns=[0],
    ),
    p("交接完成后，由接收方独立执行一次状态检查、外网访问和数据库完整性核对；只有能够在不依赖原开发者临时操作的情况下完成复核，部署文档才算真正可用。"),
])

_insert_before_heading(
    LONG_PAGES,
    "3. 部署前准备",
    [
        h("2.4 容量规划与资源水位", 2),
        p("当前服务器能够满足竞赛展示和小规模公网访问，但部署完成不代表容量可以无限增长。运维时应同时观察宿主机、容器、数据库和外部依赖，依据持续趋势而不是单次峰值决定是否扩容。"),
        table(
            ["观察对象", "正常关注点", "风险信号", "建议处理"],
            [
                ["CPU", "backend、Piston 与镜像构建的计算占用", "持续高位、接口延迟上升或代码任务长期排队", "区分 AI 等待与本地计算，限制沙箱并发，必要时增加 vCPU。"],
                ["内存", "后端、前端、Piston 和系统可用内存", "频繁回收、OOM、容器重启或可用内存长期过低", "先确认泄漏与任务峰值，再调整容器上限或扩容。"],
                ["磁盘", "镜像缓存、日志、SQLite、上传文件和备份", "构建空间不足、数据库写入失败或备份无法落盘", "清理前先列出对象；优先迁移备份，不自动执行破坏性 prune。"],
                ["网络", "公网带宽、DNS、HTTPS 出站和第三方接口延迟", "证书失败、模型超时、静态资源加载慢或连接重置", "按入口、镜像源、模型和语音域名分层定位。"],
                ["SQLite", "写锁、事务时长、文件增长和完整性", "locked 频发、慢查询或数据量持续超出演示规模", "优化写入与索引；达到单机边界后再评估 PostgreSQL。"],
                ["Piston", "并发作业、runtime、超时、CPU/内存/PID", "队列积压、runtime 缺失或容器资源持续顶满", "保留资源限制，减少并发或迁移到独立执行节点。"],
            ],
            widths=[2.6, 4.3, 4.5, 4.2],
            font_size=6.8,
            center_columns=[0],
        ),
        p("容量调整前应保留一份相同业务路径的基线结果，包括首页、登录、RAG、SSE、代码运行和数据库检查，扩容后使用同一口径复测，避免只比较硬件数字。"),
    ],
)

_insert_before_heading(
    LONG_PAGES,
    "5.3 Uvicorn 与 Piston 运行环境",
    [
        h("5.2.5 配置分级与能力降级", 3),
        p("生产配置应按“入口与安全、核心业务、外部能力、可选扩展”分级维护。这样可以在服务启动或某项能力异常时，快速判断是必须阻断上线还是允许带提示运行。"),
        table(
            ["配置类别", "代表配置", "缺失或错误的影响", "验收要求"],
            [
                ["公网入口", "SITE_ADDRESS、COMPOSE_PROFILES、HTTP/HTTPS_PORT", "Caddy 不启动、域名不匹配或公网入口不可达", "Compose 校验、DNS、80/443、HTTP 跳转和证书均正确。"],
                ["认证安全", "AUTH_SECRET_KEY、CORS_ORIGINS、SESSION_COOKIE_SECURE", "登录失效、来源被拒绝或 Cookie 安全属性错误", "生产 HTTPS 下完成登录、刷新、退出和跨来源检查。"],
                ["核心数据", "DATABASE_URL、种子文件、backend_data", "后端无法启动、空卷无法初始化或写入错误位置", "确认实际数据库路径、播种条件、数据数量和卷挂载。"],
                ["模型与向量", "LLM_PROVIDER、模型名称、LLM/Embedding Key", "资源生成、助教或语义检索降级", "分别验证真实生成、视觉、Embedding 和纯 BM25 兜底。"],
                ["语音与邮件", "讯飞、CosyVoice、SMTP 配置", "ASR/TTS 或注册邮件单项不可用", "页面明确提示配置状态，不影响已登录用户的文字学习主链路。"],
                ["代码沙箱", "COMPOSE profile、PISTON_URL、runtime", "在线代码不可用或返回连接错误", "Python/C/C++ runtime、超时和资源限制通过。"],
                ["扩展服务", "PostgreSQL、Redis、Chroma extras", "当前主链路不受影响", "未启用时不得写成生产依赖；启用后需单独验证持久化和连接。"],
            ],
            widths=[2.7, 4.2, 4.5, 4.2],
            font_size=6.7,
            center_columns=[0],
        ),
        note("配置检查只记录变量名、是否设置和功能结果，不在日志、验收截图或交付文档中展示真实值。", "配置核查原则"),
    ],
)

_insert_before_heading(
    LONG_PAGES,
    "8. 常见问题排查",
    [
        h("7.7 监控指标与验收采样", 2),
        p("验收应保留能够复核的采样结果，既覆盖发布瞬间，也覆盖完成一轮真实业务操作后的状态变化。"),
        table(
            ["维度", "采样内容", "正常表现", "需要跟进的信号"],
            [
                ["容器", "状态、health、RestartCount、资源占用", "核心服务稳定运行，重启次数不持续增长", "反复重启、健康抖动或资源长期触顶。"],
                ["公网", "DNS、HTTP/2、证书、页面与 /api/ping", "域名和证书一致，跳转及接口响应稳定", "证书链异常、偶发 502、连接重置或跨网不可达。"],
                ["业务", "三类角色、五门课程、RAG、SSE、附件、语音与代码", "核心路径均为真实结果，课程和权限不串用", "mock 未说明、流式中断、越权或跨课程引用。"],
                ["数据", "数量、文件大小、完整性、外键和备份", "发布前后数量符合预期，校验通过且备份可取得", "数量异常、锁频发、完整性失败或只有同机备份。"],
                ["外部依赖", "模型、Embedding、语音、邮件和公开资源来源状态", "成功或按设计清晰降级，不阻塞无关功能", "持续超时、额度不足、错误被静默或泄露敏感信息。"],
                ["前端体验", "建议 2～6 回归、移动端、缓存与长截图", "关键界面无溢出、遮挡和旧资源残留", "哈希未更新、截图缺内容、路径或图表文字裁切。"],
            ],
            widths=[2.6, 4.6, 4.6, 3.8],
            font_size=6.8,
            center_columns=[0],
        ),
        p("采样记录应注明测试网络、账号角色、代码版本和执行结果。偶发问题如果无法稳定复现，也应记录发生条件和原始日志，不能简单标注为“已解决”。"),
    ],
)

_insert_before_heading(
    LONG_PAGES,
    "10. 附录",
    [
        h("9.5 备份恢复演练与保留策略", 2),
        p("备份只有在能够被找到、校验并恢复时才有价值。建议把恢复演练放在隔离目录或临时卷中完成，不直接覆盖当前线上数据库。"),
        table(
            ["阶段", "主要工作", "通过标准", "留存证据"],
            [
                ["准备", "确认当前版本、数据库路径、可用空间和目标备份", "来源明确，恢复操作不会写入线上卷", "版本号、文件名、大小与操作者。"],
                ["生成备份", "使用 SQLite backup API 创建一致快照并复制到独立目录", "备份过程无错误，权限受限，线上业务继续可用", "生成时间、哈希、权限和存储位置。"],
                ["异机保存", "将至少一份已校验备份保存到服务器之外", "系统盘故障时仍可取得文件", "外部存储位置与访问责任人。"],
                ["隔离恢复", "把备份恢复到临时数据库或临时卷", "数据库可打开，表结构与版本兼容", "恢复环境、步骤和实际用时。"],
                ["业务校验", "检查用户、课程、知识块、画像、会话、完整性和外键", "核心数量符合备份时点，integrity/FK 通过", "查询结果、异常项和最终结论。"],
                ["清理与归档", "删除临时恢复环境，保留记录并按策略轮换旧备份", "不影响线上卷，不误删唯一有效备份", "保留清单、删除审批和下一次演练条件。"],
            ],
            widths=[2.5, 5.1, 4.8, 3.2],
            font_size=6.8,
            center_columns=[0],
        ),
        bullets([
            "重大更新、数据库结构变化和批量数据操作前必须生成新备份；普通前端更新仍应确认最近备份可用。",
            "保留策略应同时考虑时间跨度、版本节点和异机副本，不能只按文件数量机械删除。",
            "RPO 由最近有效备份的时间点决定；RTO 由实际恢复演练决定，二者都应随数据规模变化重新评估。",
        ]),
    ],
)

LONG_PAGES[-1].extend([
    h("10.6 文档与版本交付矩阵", 2),
    table(
        ["交付对象", "版本标识", "一致性要求"],
        [
            ["源码", "Git 提交或源码包校验值", "与构建镜像所用源码一致。"],
            ["镜像", "前端、后端及可选服务的摘要/标签", "与服务器实际运行容器一致。"],
            ["配置模板", ".env.example、.deploy.env.example", "变量名称与当前代码、Compose 和文档一致，不包含真实值。"],
            ["种子库", "studymate.db.gz 大小与校验值", "只用于空卷初始化，并通过账号、课程、知识块、完整性和外键检查。"],
            ["部署文档", "DOCX/PDF 生成时间与目录", "命令、路径、端口、功能和最终分页与当前实现一致。"],
            ["验收记录", "测试日期、环境、账号角色和结论", "能够关联源码、镜像、配置摘要与备份文件。"],
        ],
        widths=[3.3, 5.0, 7.3],
        font_size=7.1,
        center_columns=[0],
    ),
])

_insert_before_heading(
    SHORT_PAGES,
    "4 部署流程",
    [
        h("3.4 容量与资源水位", 2),
        table(
            ["对象", "关注信号", "处理原则"],
            [
                ["CPU/内存", "持续高占用、OOM、容器反复重启", "区分后端与沙箱负载，保留资源上限后再扩容。"],
                ["磁盘", "镜像、日志、上传、SQLite 和备份持续增长", "清理前先列出对象，优先转移备份，禁止自动破坏性 prune。"],
                ["SQLite", "写锁频发、文件快速增长或完整性异常", "先优化事务和写入；超过单机边界后评估外置数据库。"],
                ["外部网络", "证书、镜像、模型或语音接口超时", "按域名与能力分层定位，不把第三方故障当作数据故障。"],
            ],
            widths=[3.4, 6.3, 5.9],
            font_size=7.2,
            center_columns=[0],
        ),
    ],
)

_insert_before_heading(
    SHORT_PAGES,
    "5 运维与监控",
    [
        h("4.5 配置分级与能力降级", 2),
        table(
            ["配置类别", "影响范围", "上线要求"],
            [
                ["入口与认证", "域名、HTTPS、CORS、会话和全部登录用户", "错误时阻断上线，必须完成登录和 Cookie 验收。"],
                ["数据与种子", "后端启动、线上业务数据和空卷初始化", "核对卷、数量、完整性和外键，不允许隐式覆盖。"],
                ["模型与向量", "资源生成、助教、视觉和语义检索", "分别验证真实能力与明确降级，mock 不得冒充通过。"],
                ["语音/邮件/外部资源", "单项交互或公开资源推荐", "可限制通过，但页面必须清晰提示且文字学习主链路完整。"],
                ["Piston", "在线代码运行", "启用时验证 runtime、超时和资源限制；未启用时明确说明。"],
            ],
            widths=[3.7, 6.0, 5.9],
            font_size=7.2,
            center_columns=[0],
        ),
    ],
)

SHORT_PAGES[-1].extend([
    h("5.7 最终交付验收清单", 2),
    table(
        ["验收项", "通过标准"],
        [
            ["版本", "源码、镜像、配置模板和部署文档能够相互对应。"],
            ["公网", "DNS、证书、80/443、备案和外网 PC/手机访问正常。"],
            ["业务", "三类角色、五门课程、RAG、SSE、附件、语音和代码按启用范围通过。"],
            ["数据", "数量符合预期，integrity_check=ok、foreign_key_check=0，备份可取得。"],
            ["安全", "环境文件权限正确，无真实密钥进入源码、文档、截图或交付包。"],
            ["回滚", "保留上一版镜像或代码，明确代码回滚与数据恢复的不同触发条件。"],
            ["近期界面", "长截图、蛇形路径、雷达文字安全区和标准输入显示均完成浏览器回归。"],
        ],
        widths=[4.2, 11.4],
        font_size=7.3,
        center_columns=[0],
    ),
    p("交付前由未参与本次修改的成员按清单独立复核，并把发现的问题、限制条件和最终结论写入验收记录。"),
    h("5.8 部署交接责任与资料去向", 2),
    table(
        ["交接对象", "资料去向与责任边界", "接收方复核"],
        [
            ["访问与权限", "记录云控制台、SSH、域名/DNS 和证书的维护归属，不在文档中保存私钥。", "确认能够独立登录，且未共享 root 密码或私钥。"],
            ["版本与镜像", "归档最终 Git 提交、镜像摘要、回滚标签以及本次生成的部署文档。", "核对线上容器与交付版本一致。"],
            ["配置与密钥", "仅记录变量名称、服务用途、保管位置和轮换责任人。", "确认真实值未进入源码、截图和交付包。"],
            ["数据与风险", "记录 SQLite 实际路径、最近备份、异机副本位置、限制通过项和已知风险。", "完成完整性检查，并确认备份可读取和可恢复。"],
        ],
        widths=[3.2, 7.2, 5.2],
        font_size=7.1,
        center_columns=[0],
    ),
    p("交接完成后，由接收成员独立执行一次容器状态、公网访问、核心业务和数据库检查；复核通过后再把该版本作为下一次更新的维护基线。"),
])
