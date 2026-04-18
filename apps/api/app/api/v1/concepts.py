from fastapi import APIRouter, Depends

from app.auth.users import current_active_user
from app.models.user import User

router = APIRouter(prefix="/concepts", tags=["concepts"])


@router.get("")
async def list_concepts(current_user: User = Depends(current_active_user)) -> dict:
    """Placeholder – returns empty list until M2 formula engine is wired in."""
    return {"items": [], "user_id": str(current_user.id)}
