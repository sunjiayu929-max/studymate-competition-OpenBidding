# Hydro OJ 服务接入说明

StudyMate 的在线判题是独立 Hydro 服务，不复用 StudyMate SQLite，也不替换现有 Piston。Piston 继续处理 StudyMate 的 `/api/run` 代码示例；HydroJudge 负责 OJ 的题目测试点、提交队列和沙箱执行。

## 代码边界

本地开发在主仓库 `yuanshicong` 分支进行，审核通过后快进或合并到部署基线 `merge-competition`；`ai-interview` 使用 `main`，`oj` 使用 `main`。OJ 代码位于主仓库的 `oj/` Git Submodule。修改 OJ 时先在 OJ 仓库提交，再在主仓库提交新的 Submodule revision；服务器不单独拉取子模块。

首次检出或更新 revision 后必须递归初始化子模块，因为 HydroJudge 还锁定了 `testlib` 嵌套子模块：

```bash
git submodule update --init --recursive
```

## 访问与单点登录

浏览器从 StudyMate 侧栏请求 `/api/oj/launch`。StudyMate 后端为当前用户创建短时一次性 ticket，并重定向到 `https://matropic.cn/oj/integrations/studymate/launch?ticket=...`。Hydro 插件通过 `studymate_edge` 调用 StudyMate `/api/internal/oj/tickets/redeem`，使用时间戳和 HMAC 签名兑换用户身份，然后创建或绑定 Hydro 用户会话。

ticket 只保存哈希，兑换成功后原子消费；过期、重复兑换、签名错误和停用用户都会被拒绝。StudyMate 和 Hydro 不共享密码、Cookie、数据库或认证密钥。

## Docker 网络

`hydro-web` 同时加入 `studymate_edge` 和 OJ 私有网络；`hydro-mongo`、`hydro-judge` 和判题临时文件只加入 OJ 私有网络。MongoDB、HydroJudge 不发布宿主机端口。现有 `studymate-piston` 保持在主 Compose 网络，不加入 OJ 网络。

## 服务器配置

服务器只维护 `/home/deploy/oj/.env`，内容参考 `oj/.env.example`。StudyMate 的 `backend/.env` 只保存 `OJ_PUBLIC_URL` 和 `OJ_SERVICE_SECRET`；`OJ_SERVICE_SECRET` 必须与 OJ 的 `STUDYMATE_SERVICE_SECRET` 相同。真实值不得提交到任意仓库。

## 发布与回滚

```bash
cd /home/deploy/studymate
bash scripts/deploy.sh preflight
bash scripts/deploy.sh up
bash scripts/deploy.sh status
```

发布前备份 StudyMate SQLite、AI 面试 MySQL、OJ MongoDB 和 OJ 文件卷。普通升级不得执行 `docker compose down -v`。回滚使用上一组主仓库提交、Submodule revision 和已有命名卷。

验收至少包括：`/oj/` 页面、StudyMate 入口自动登录、ticket 一次性消费、Hydro Web 健康、HydroJudge 注册、Python/C++ 示例题提交，以及 `/api/run` 和 `/interview/health` 无回归。
