# Hydro OJ 服务接入说明

StudyMate 的在线判题是独立 Hydro 服务，不复用 StudyMate SQLite，也不替换现有 Piston。Piston 继续处理 StudyMate 的 `/api/run` 代码示例；HydroJudge 负责 OJ 的题目测试点、提交队列和沙箱执行。

## 代码边界

本地开发在主仓库 `yuanshicong` 分支进行，审核通过后快进或合并到部署基线 `merge-competition`；`ai-interview` 使用 `main`，`oj` 使用 `main`。OJ 代码位于主仓库的 `oj/` Git Submodule。修改 OJ 时先在 OJ 仓库提交，再在主仓库提交新的 Submodule revision；服务器不单独拉取子模块。

首次检出或更新 revision 后必须递归初始化子模块，因为 HydroJudge 还锁定了 `testlib` 嵌套子模块：

```bash
git submodule update --init --recursive
```

## 访问与单点登录

浏览器从 StudyMate 侧栏请求 `/api/oj/entry`。未登录用户会先回到 StudyMate `/login`，登录成功后携带安全校验过的 `return_to` 回到 OJ 入口。StudyMate 后端为当前用户创建短时一次性 ticket，并重定向到 `https://matropic.cn/oj/integrations/studymate/launch?ticket=...`。Hydro 插件通过 `studymate_edge` 调用 StudyMate `/api/internal/oj/tickets/redeem`，使用时间戳和 HMAC 签名兑换用户身份，然后创建或复用同一 Hydro 技术用户会话。

ticket 只保存哈希和受限的 `/oj/...` 回跳路径，兑换成功后原子消费；过期、重复兑换、签名错误和停用用户都会被拒绝。Hydro 生产环境关闭内置登录、注册、找回密码和公开 OAuth，用户只能使用 StudyMate 身份。StudyMate `subject` 是唯一稳定映射键，不能用邮箱变更 Hydro UID，因此提交、练习、竞赛和历史记录会在重新登录后继续保留。StudyMate 和 Hydro 不共享密码、Cookie、数据库或认证密钥。

### SSO-only 边界

`STUDYMATE_SSO_ONLY=1` 时，Hydro 只保留一个不可见的技术投影用户，用于关联提交、训练、比赛和历史记录；它不是用户可以注册、登录、改密码或管理资料的第二套账号。Hydro 普通页面在未识别到有效会话时，会将当前 `/oj/...` 路径和查询参数回跳到 StudyMate 登录；非页面 API 返回 `401` 并给出同一个入口地址。

Hydro 的登录、注册、找回密码、OAuth、个人设置、安全、域管理和旧登出路径均不可用于管理账号。页面导航只显示 StudyMate 身份和统一退出入口；默认的 Hydro 注册引导和欢迎公告会替换为 StudyMate OJ 说明，但管理员已经自定义的公告不会被覆盖。HydroJudge 使用独立的技术账号，不参与 StudyMate 用户映射。

## Docker 网络

`hydro-web` 同时加入 `studymate_edge` 和 OJ 私有网络；`hydro-mongo`、`hydro-judge` 和判题临时文件只加入 OJ 私有网络。MongoDB、HydroJudge 不发布宿主机端口。现有 `studymate-piston` 保持在主 Compose 网络，不加入 OJ 网络。

## 服务器配置

服务器只维护 `/home/deploy/oj/.env`，内容参考 `oj/.env.example`。StudyMate 的 `backend/.env` 只保存 `OJ_PUBLIC_URL` 和 `OJ_SERVICE_SECRET`；`OJ_SERVICE_SECRET` 必须与 OJ 的 `STUDYMATE_SERVICE_SECRET` 相同。`STUDYMATE_OJ_NAME` 可选，默认是 `StudyMate OJ`。真实值不得提交到任意仓库。

## 发布与回滚

```bash
cd /home/deploy/studymate
bash scripts/deploy.sh preflight
bash scripts/deploy.sh up
bash scripts/deploy.sh status
```

发布前使用 `scripts/backup-db.sh` 备份 StudyMate SQLite，并使用 `scripts/backup-oj.sh` 备份 OJ MongoDB 与文件卷。备份即使发现外键异常也会保留快照并输出审计报告；普通升级不得执行 `docker compose down -v`。回滚使用上一组主仓库提交、Submodule revision 和已有命名卷。

验收至少包括：未登录访问 `/oj/`、题目、训练和比赛页面均回到 StudyMate 登录并在登录后回到原路径；同一 `subject` 重复进入得到同一 Hydro UID；提交后退出再登录历史仍存在；线上 HTML 不出现 Hydro 注册、找回密码和默认欢迎公告；ticket 一次性消费、Hydro Web 健康、HydroJudge 注册、Python/C++ 示例题提交，以及 `/api/run` 和 `/interview/health` 无回归。

## StudyMate 面试题集目录

OJ 插件 `@studymate/oj-catalog` 使用 `oj/packages/studymate-oj/catalog.yaml` 维护学习者入口。目录目前包含五个入口：面试经典 150 题、面试必考 75 题、面试经典题变式、秋招冲刺百题计划和题库；前四个入口共引用 30 道官方题包中的精选题，题目允许在多个入口复用并共享 Hydro 提交进度。题库入口保留 Hydro 原生题库总览，便于管理员继续导入和维护题目。

插件只改造入口和学习路径页面，不删除 Hydro 比赛、作业、讨论、排名等后端模型。普通学习者访问这些旧路径时会收到功能替代提示，系统管理员仍可访问原生管理页面。题目详情、提交编辑器和判题链路继续使用 Hydro 原生实现与 HydroJudge；JavaScript 使用 Judge 镜像内 Node 的 PATH，Go 使用镜像内 Go 工具链。

发布或更新题包后，在 OJ Compose 项目目录执行：

```bash
./scripts/validate-official-problemsets.sh
./scripts/validate-interview-catalog.sh
```

第二个命令通过 Hydro CLI 只读检查目录中的精选题号是否已存在于 `system` 域，不会写入题目或提交数据。
