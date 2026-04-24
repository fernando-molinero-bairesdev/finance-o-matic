from fastapi import APIRouter

from app.api.v1 import concepts, currencies, snapshots

router = APIRouter(prefix="/api/v1")
router.include_router(concepts.router)
router.include_router(currencies.router)
router.include_router(snapshots.router)
