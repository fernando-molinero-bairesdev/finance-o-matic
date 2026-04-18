from fastapi import APIRouter

from app.api.v1 import concepts

router = APIRouter(prefix="/api/v1")
router.include_router(concepts.router)
