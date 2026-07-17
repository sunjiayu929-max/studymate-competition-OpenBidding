from fastapi import APIRouter
from app.core.config import settings
from app.llm import has_llm_key, get_llm_client

router = APIRouter(tags=["health"])


@router.get("/ping")
async def ping():
    client = get_llm_client() if has_llm_key() else None
    return {
        "status": "ok",
        "service": "studymate-backend",
        "llm_provider": settings.LLM_PROVIDER,
        "llm_configured": has_llm_key(),
        "llm_model": client.model if client else None,
    }
