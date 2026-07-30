"""Docker 容器入口：把用户数据落到挂载的命名 volume，保证重部署不丢数据。

机制：
- 镜像里的 `/app/resources/seed/studymate.db.gz` 是**脱敏压缩种子库**
  （1709 chunks + 向量，只读基线）。
- 运行期真正读写的库在 `/app/data/studymate.db`（compose 把命名 volume `backend_data`
  挂到 `/app/data`，compose env 把 `DATABASE_URL` 指到 `./data/studymate.db`）。
- **首次启动**（volume 为空）→ 把种子库解压进 volume；之后每次重部署 volume 已有库 →
  跳过复制，用户数据（笔记/画像/测验历史/反馈）原样保留。

为什么用命名 volume 而不是 bind-mount 宿主文件：SQLite 的 POSIX 文件锁在
Windows/macOS 主机 bind-mount 上不可靠（会损坏 / database is locked），命名 volume
落在 Docker 原生 Linux FS 上，锁正常。

注：本地裸跑（python run.py，无 compose env）走 DATABASE_URL 默认 `./studymate.db`，
不经过本脚本，完全不受影响。
"""
import gzip
import os
import shutil
import sys

DATA_DIR = "/app/data"
LIVE_DB = os.path.join(DATA_DIR, "studymate.db")
SEED_DB_GZ = "/app/resources/seed/studymate.db.gz"


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(LIVE_DB):
        if not os.path.exists(SEED_DB_GZ):
            raise FileNotFoundError(f"部署种子库不存在：{SEED_DB_GZ}")
        with gzip.open(SEED_DB_GZ, "rb") as source, open(LIVE_DB, "wb") as target:
            shutil.copyfileobj(source, target)
        print(f"[entrypoint] 首次启动：已从压缩种子库播种 {LIVE_DB}", flush=True)
    else:
        print(f"[entrypoint] 复用已有数据库 {LIVE_DB}（保留用户数据）", flush=True)
    # 交棒给真正的服务进程（execv 替换当前进程，信号/优雅关闭直达 uvicorn）
    os.execv(sys.executable, [sys.executable, "run.py"])


if __name__ == "__main__":
    main()
