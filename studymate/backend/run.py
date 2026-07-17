"""开发启动入口： python run.py"""
import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=False,  # Windows + multiprocessing 在 reload spawn 时会崩，关掉
    )
