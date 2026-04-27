import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.entity import Entity
from app.models.entity_property_def import EntityPropertyDef
from app.models.entity_type import EntityType
from app.models.user import User
from app.schemas.entity import (
    EntityPropertyDefCreate,
    EntityPropertyDefRead,
    EntityPropertyDefUpdate,
    EntityTypeCreate,
    EntityTypeDetail,
    EntityTypeListResponse,
    EntityTypeRead,
    EntityTypeUpdate,
)

router = APIRouter(prefix="/entity-types", tags=["entity-types"])


async def _get_owned_type_or_404(
    session: AsyncSession, entity_type_id: uuid.UUID, user_id: uuid.UUID
) -> EntityType:
    result = await session.execute(
        select(EntityType).where(
            EntityType.id == entity_type_id, EntityType.user_id == user_id
        )
    )
    et = result.scalar_one_or_none()
    if et is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity type not found")
    return et


async def _load_detail(session: AsyncSession, et: EntityType) -> EntityTypeDetail:
    props_result = await session.execute(
        select(EntityPropertyDef)
        .where(EntityPropertyDef.entity_type_id == et.id)
        .order_by(EntityPropertyDef.display_order, EntityPropertyDef.name)
    )
    props = list(props_result.scalars().all())
    return EntityTypeDetail(
        **EntityTypeRead.model_validate(et).model_dump(),
        properties=[EntityPropertyDefRead.model_validate(p) for p in props],
    )


@router.get("", response_model=EntityTypeListResponse)
async def list_entity_types(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityTypeListResponse:
    result = await session.execute(
        select(EntityType).where(EntityType.user_id == current_user.id).order_by(EntityType.name)
    )
    entity_types = list(result.scalars().all())
    details = [await _load_detail(session, et) for et in entity_types]
    return EntityTypeListResponse(items=details)


@router.post("", response_model=EntityTypeDetail, status_code=status.HTTP_201_CREATED)
async def create_entity_type(
    body: EntityTypeCreate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityTypeDetail:
    et = EntityType(user_id=current_user.id, name=body.name)
    session.add(et)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An entity type with this name already exists.",
        )
    await session.refresh(et)
    return await _load_detail(session, et)


@router.get("/{entity_type_id}", response_model=EntityTypeDetail)
async def get_entity_type(
    entity_type_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityTypeDetail:
    et = await _get_owned_type_or_404(session, entity_type_id, current_user.id)
    return await _load_detail(session, et)


@router.put("/{entity_type_id}", response_model=EntityTypeDetail)
async def update_entity_type(
    entity_type_id: uuid.UUID,
    body: EntityTypeUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityTypeDetail:
    et = await _get_owned_type_or_404(session, entity_type_id, current_user.id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(et, field, value)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An entity type with this name already exists.",
        )
    await session.refresh(et)
    return await _load_detail(session, et)


@router.delete("/{entity_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity_type(
    entity_type_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    et = await _get_owned_type_or_404(session, entity_type_id, current_user.id)
    entities_exist = await session.execute(
        select(Entity.id).where(Entity.entity_type_id == entity_type_id).limit(1)
    )
    if entities_exist.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete entity type while entities of this type exist.",
        )
    await session.delete(et)
    await session.commit()


# ── Property definitions ──────────────────────────────────────────────────────

@router.post(
    "/{entity_type_id}/properties",
    response_model=EntityPropertyDefRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_property(
    entity_type_id: uuid.UUID,
    body: EntityPropertyDefCreate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityPropertyDefRead:
    await _get_owned_type_or_404(session, entity_type_id, current_user.id)
    prop = EntityPropertyDef(entity_type_id=entity_type_id, **body.model_dump())
    session.add(prop)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A property with this name already exists on this entity type.",
        )
    await session.refresh(prop)
    return EntityPropertyDefRead.model_validate(prop)


@router.put(
    "/{entity_type_id}/properties/{prop_id}",
    response_model=EntityPropertyDefRead,
)
async def update_property(
    entity_type_id: uuid.UUID,
    prop_id: uuid.UUID,
    body: EntityPropertyDefUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityPropertyDefRead:
    await _get_owned_type_or_404(session, entity_type_id, current_user.id)
    result = await session.execute(
        select(EntityPropertyDef).where(
            EntityPropertyDef.id == prop_id,
            EntityPropertyDef.entity_type_id == entity_type_id,
        )
    )
    prop = result.scalar_one_or_none()
    if prop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    await session.commit()
    await session.refresh(prop)
    return EntityPropertyDefRead.model_validate(prop)


@router.delete(
    "/{entity_type_id}/properties/{prop_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_property(
    entity_type_id: uuid.UUID,
    prop_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    await _get_owned_type_or_404(session, entity_type_id, current_user.id)
    result = await session.execute(
        select(EntityPropertyDef).where(
            EntityPropertyDef.id == prop_id,
            EntityPropertyDef.entity_type_id == entity_type_id,
        )
    )
    prop = result.scalar_one_or_none()
    if prop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    await session.delete(prop)
    await session.commit()
