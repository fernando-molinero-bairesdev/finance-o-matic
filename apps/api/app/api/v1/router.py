from fastapi import APIRouter

from app.api.v1 import concepts, currencies, init, processes, snapshots

router = APIRouter(prefix="/api/v1")
router.include_router(concepts.router)
router.include_router(currencies.router)
router.include_router(snapshots.router)
router.include_router(processes.router)
router.include_router(init.router)
