# AI 面试服务接入说明

StudyMate 的 AI 面试采用独立服务部署。面试服务代码位于同级目录 `ai-interview/`，来源为 Gitee 项目 `https://gitee.com/uorol123/ai-interview.git`，后续应迁移到团队 GitHub 仓库 `https://github.com/studymate-team/ai-interview.git`，并以 Git submodule 接入主仓库。

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

当前外部目录还是独立 Git 仓库，`origin` 保留 Gitee 作为上游。团队仓库建立后，在主仓库根目录执行：

```bash
git submodule add https://github.com/studymate-team/ai-interview.git ai-interview
git commit -m "chore: add AI interview service submodule"
```

新仓库应使用经过脱敏的单独首个提交，不要把原 Gitee 历史直接推送到团队仓库。原历史曾出现数据库和第三方 API 凭据，相关凭据应在服务商后台撤销并重新生成。

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

1. 创建团队 GitHub 面试服务仓库并推送本地脱敏提交。
2. 将主仓库中的目录转换为真实 submodule，固定到可审计 commit。
3. 实现短期启动凭证或一次性会话 token，避免通过 URL 传递用户身份。
4. 实现面试报告签名回传和岗位能力维度映射，再接入 StudyMate 的画像与训练建议。
