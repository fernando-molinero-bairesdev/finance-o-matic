from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.currency import Currency
from app.models.user import User

router = APIRouter(prefix="/currencies", tags=["currencies"])


class CurrencyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    code: str
    name: str


class CurrencyListResponse(BaseModel):
    items: list[CurrencyRead]


class CurrencyCreate(BaseModel):
    code: str
    name: str


class CurrencyUpdate(BaseModel):
    name: str


@router.get("", response_model=CurrencyListResponse)
async def list_currencies(
    session: AsyncSession = Depends(get_async_session),
) -> CurrencyListResponse:
    result = await session.execute(select(Currency).order_by(Currency.code))
    return CurrencyListResponse(items=list(result.scalars().all()))


@router.post("", response_model=CurrencyRead, status_code=status.HTTP_201_CREATED)
async def create_currency(
    body: CurrencyCreate,
    _: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> CurrencyRead:
    code = body.code.strip().upper()
    existing = await session.get(Currency, code)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Currency '{code}' already exists.",
        )
    currency = Currency(code=code, name=body.name.strip())
    session.add(currency)
    await session.commit()
    await session.refresh(currency)
    return CurrencyRead.model_validate(currency)


@router.put("/{code}", response_model=CurrencyRead)
async def update_currency(
    code: str,
    body: CurrencyUpdate,
    _: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> CurrencyRead:
    currency = await session.get(Currency, code.upper())
    if currency is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Currency not found.")
    currency.name = body.name.strip()
    await session.commit()
    await session.refresh(currency)
    return CurrencyRead.model_validate(currency)


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_currency(
    code: str,
    _: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    currency = await session.get(Currency, code.upper())
    if currency is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Currency not found.")
    try:
        await session.delete(currency)
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Currency is in use by one or more concepts and cannot be deleted.",
        )
