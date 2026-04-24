from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.models.currency import Currency

router = APIRouter(prefix="/currencies", tags=["currencies"])


class CurrencyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    name: str


class CurrencyListResponse(BaseModel):
    items: list[CurrencyRead]


@router.get("", response_model=CurrencyListResponse)
async def list_currencies(
    session: AsyncSession = Depends(get_async_session),
) -> CurrencyListResponse:
    result = await session.execute(select(Currency).order_by(Currency.code))
    return CurrencyListResponse(items=list(result.scalars().all()))
