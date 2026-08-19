# AI 面试服务接入说明

StudyMate 的 AI 面试采用独立服务部署。面试服务代码位于同级目录 `ai-interview/`，来源为 Gitee 项目 `https://gitee.com/uorol123/ai-interview.git`，现已迁移到团队 GitHub 仓库 `https://github.com/studymate-team/ai-interview.git`，并以 Git submodule 接入主仓库。

## 原项目说明

原项目是一个完整的“AI 面试官系统”，不是只有一个聊天页面。它原本包含以下能力：

- 求职者端：简历上传与 AI 简历解析、岗位模拟面试、实时文字/WebSocket 面试、面试评分报告、个人资料和简历管理。
- 企业端：企业资料、职位发布与管理、候选人管理、面试安排、评分权重设置和面试报告查看。
- AI 与语音：OpenAI 兼容的大模型接口、阿里百炼/DeepSeek 等模型接入方式、讯飞语音服务、可选数字人交互资源。
- 技术结构：Flask 应用、Flask-SocketIO 实时通信、SQLAlchemy 数据模型、MySQL 数据库、Jinja 页面、JavaScript/CSS 静态资源。

本次接入保留原项目的路由、模型、模板、实时面试流程、简历分析和企业管理能力；改造重点是部署和边界，而不是删减原功能：

- 配置从源码中的数据库地址和第三方密钥改为环境变量。
- 面试服务拥有独立 MySQL 和上传文件卷，主 StudyMate 不直接访问这些表。
- 增加 Dockerfile、Docker Compose、健康检查和独立服务 README。
- 新注册/修改密码使用哈希，历史明文密码在成功登录时兼容迁移。
- 去除原仓库历史中的敏感信息后，以新的脱敏提交推送到团队 GitHub；原 Gitee 仅作为 `upstream` 参考。

当前主系统已经提供按目标岗位进入面试的入口，会传入岗位名称、岗位能力标签和知识库 ID。一次性登录凭证、面试报告签名回传以及评分写回 StudyMate 岗位画像仍属于下一阶段 API 开发，不通过 URL 传递正式用户身份。

## 当前边界

```text
StudyMate 前端
    │  VITE_AI_INTERVIEW_URL + 岗位名称/能力标签/知识库 ID
    ▼
独立 AI 面试服务（Flask + SocketIO）
    │
    └── 独立 MySQL 与上传文件卷
```

- 两个服务只通过 HTTP/WebSocket API 通信，不共享数据库表或 ORM 模型。
- 面试服务的数据库连接、Flask 会话密钥、大模型密钥和语音密钥全部来自环境变量。
- 主项目的 `VITE_AI_INTERVIEW_URL` 只用于构建前端入口，不承载任何密钥。
- 岗位要求由主系统的目标岗位目录提供，启动面试时通过 `target_role`、`competencies`、`course_id` 传入；后续报告回传后再写入 StudyMate 岗位能力证据。

## 本地管理方式

当前外部目录是独立 Git 仓库，`origin` 指向团队 GitHub，`upstream` 保留原 Gitee。主仓库已经通过 `.gitmodules` 固定到面试服务的脱敏提交：

```bash
git submodule update --init --recursive
git -C ai-interview remote -v
```

面试服务 GitHub 当前使用经过脱敏的独立首个提交，不包含原 Gitee 历史。原历史曾出现数据库和第三方 API 凭据，相关凭据应在服务商后台撤销并重新生成。

## 独立启动

```bash
cd ai-interview
cp .env.example .env
# 编辑 .env 后：
docker compose up -d --build
curl http://localhost:5000/health
```

部署主系统时，在 `studymate/.env`（或构建环境）设置：

```dotenv
VITE_AI_INTERVIEW_URL=http://localhost:5000
```

生产环境应使用 HTTPS 域名，并由反向代理限制面试服务的公开暴露范围。MySQL 端口只允许面试服务所在 Docker 网络访问。

## 后续开发顺序

1. 实现短期启动凭证或一次性会话 token，避免通过 URL 传递用户身份。
2. 实现面试报告签名回传和岗位能力维度映射，再接入 StudyMate 的画像与训练建议。
3. 增加面试服务数据库迁移脚本、备份恢复流程和生产级反向代理配置。
