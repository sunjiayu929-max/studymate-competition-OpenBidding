# 因材智训从业者端微信小程序

这是因材智训的微信原生小程序端，当前提供从业者的注册、登录和企业任务闭环：

```text
注册/登录 -> 今日任务 -> 任务详情 -> 接受/开始/完成
```

小程序和网页端共用同一个 FastAPI 后端、账号体系、企业关系和任务数据，不需要单独导入数据库。

## 目录位置

导入微信开发者工具时选择下面这个目录，不要选择外层项目目录：

```text
studymate-competition-git/studymate-miniapp
```

## 第一次启动

### 1. 启动后端

在项目根目录打开一个终端：

```bash
cd studymate-competition-git/studymate/backend
cp ../.env.example .env
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -u -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

如果已经安装过依赖，直接执行最后一条命令即可。后端启动后检查：

```bash
curl http://127.0.0.1:8000/api/ping
```

后端 `.env` 是本地配置，不要提交到 Git。

### 2. 导入微信开发者工具

1. 打开“微信开发者工具”，选择“导入项目”。
2. 项目目录选择 `studymate-miniapp`，项目类型选择“小程序”。
3. 开发阶段使用自己的测试号 AppID，或使用团队提供的 AppID。
4. 编译并打开模拟器。

如果提示 AppID 或项目配置不匹配，在项目设置中重新选择当前测试号。开发者工具会修改本地项目配置，这是正常现象。

## 模拟器调试

电脑模拟器可以访问电脑本机后端，`services/config.js` 使用：

```js
const API_BASE_URL = "http://localhost:8000/api"
```

修改后在微信开发者工具中重新编译。本地调试可以在项目设置中关闭“校验合法域名、业务域名、TLS 版本以及 HTTPS 证书”。

## 手机真机调试

真机中的 `localhost` 指向手机自身，不能访问电脑。把 `services/config.js` 改成电脑当前 WLAN IPv4，例如：

```js
const API_BASE_URL = "http://172.20.10.3:8000/api"
```

这个地址只适合当前电脑和当前网络，改动不要提交。操作步骤：

1. Windows 执行 `ipconfig`，找到当前 WLAN 的 IPv4。
2. 手机和电脑连接同一个 Wi-Fi 或手机热点。
3. 后端使用 `--host 0.0.0.0 --port 8000` 启动。
4. Windows PowerShell 执行 `wsl hostname -I`，记下 WSL IPv4。
5. 使用管理员 PowerShell 添加端口转发，把示例地址替换为实际地址：

```powershell
netsh interface portproxy add v4tov4 listenaddress=电脑WLAN_IP listenport=8000 connectaddress=WSL_IP connectport=8000
New-NetFirewallRule -DisplayName "因材智训 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

6. 先在 Windows 浏览器访问 `http://电脑WLAN_IP:8000/api/ping`。
7. 确认电脑能访问后，在微信开发者工具重新编译并进行真机调试。

查看或删除端口转发：

```powershell
netsh interface portproxy show all
netsh interface portproxy delete v4tov4 listenaddress=电脑WLAN_IP listenport=8000
```

WSL 重启后 IP 可能变化，需要重新配置转发。真机仍无法连接时，优先检查后端进程、防火墙、手机与电脑是否同网，以及配置是否重新编译生效。

## 演示流程

1. 使用团队分配的从业者账号登录。
2. 进入“今日任务”，确认企业名称和任务列表已经加载。
3. 点击任务进入详情，依次点击“接受任务”“开始任务”“完成任务”。
4. 返回今日任务页，确认任务状态和统计数字更新。

当前小程序支持岗位训练任务和普通阅读任务的接收与状态流转；岗位训练中心、资源生成、协作审计链和视频生成仍从网页端使用。

## 本地文件不要提交

以下配置与个人环境有关，不要执行全量 `git add .` 把它们提交：

```text
studymate-miniapp/services/config.js
studymate-miniapp/project.config.json
```

其中 `config.js` 的局域网 IP 需要每位开发者按自己的网络修改，`project.config.json` 可能包含个人 AppID 和开发者工具设置。提交代码时只暂存实际改动文件，例如：

```bash
git add studymate-miniapp/pages/home/home.wxss
git commit -m "fix(miniapp): center logout button text"
```

## 常见问题

### Sitemap 报缺少 rules 字段

确认导入的是 `studymate-miniapp` 目录，并检查 `sitemap.json` 至少包含：

```json
{
  "rules": [
    {
      "action": "allow",
      "page": "*"
    }
  ]
}
```

如果仍报错，移除微信开发者工具中的旧项目后重新导入准确目录，单纯清缓存可能不会解决问题。

### 登录提示“暂时无法连接因材智训服务”

先确认后端能返回 `http://127.0.0.1:8000/api/ping`。模拟器使用 `localhost`；真机必须使用电脑 WLAN IP，并完成 Windows 到 WSL 的端口转发。这个错误通常不是 AppID 导致的。

### 登录成功但看不到企业任务

确认当前账号是从业者身份并且已经加入企业；也可以检查后端是否已启动并完成企业数据初始化。

### 修改代码后页面没有变化

在微信开发者工具点击“编译”。修改 `services/config.js` 后建议清除缓存再重新编译；真机调试还要确认手机访问的 IP 与配置文件一致。

## 当前范围

- 已实现：注册、登录、密码显隐、从业者今日任务、企业上下文、邀请码加入、任务详情、接受/开始/完成。
- 暂不包含：企业管理员小程序、完整岗位训练中心、资源生成、协作审计链、视频生成和微信授权登录。
- 正式发布前：接口地址需要切换到 HTTPS 合法域名，并清理本地测试数据。
