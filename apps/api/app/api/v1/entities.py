import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.entity import Entity
from app.models.entity_property_def import EntityPropertyCardinality, EntityPropertyDef
from app.models.entity_property_value import EntityPropertyValue
from app.models.entity_type import EntityType
from app.models.user import User
from app.schemas.entity import (
    EntityCreate,
    EntityDetail,
    EntityListResponse,
    EntityPropertyDefRead,
    EntityPropertyValueItem,
    EntityPropertyValueRead,
    EntityRead,
    EntityUpdate,
)

router = APIRouter(prefix="/entities", tags=["entities"])


async def _get_owned_entity_or_404(
    session: AsyncSession, entity_id: uuid.UUID, user_id: uuid.UUID
) -> Entity:
    result = await session.execute(
        select(Entity).where(Entity.id == entity_id, Entity.user_id == user_id)
    )
    entity = result.scalar_one_or_none()
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entity not found")
    return entity


async def _load_detail(session: AsyncSession, entity: Entity) -> EntityDetail:
    et_result = await session.execute(
        select(EntityType).where(EntityType.id == entity.entity_type_id)
    )
    et = et_result.scalar_one_or_none()

    props: list[EntityPropertyDef] = []
    values: list[EntityPropertyValue] = []

    if et is not None:
        props_result = await session.execute(
            select(EntityPropertyDef)
            .where(EntityPropertyDef.entity_type_id == et.id)
            .order_by(EntityPropertyDef.display_order, EntityPropertyDef.name)
        )
        props = list(props_result.scalars().all())

        vals_result = await session.execute(
            select(EntityPropertyValue).where(EntityPropertyValue.entity_id == entity.id)
        )
        values = list(vals_result.scalars().all())

    return EntityDetail(
        **EntityRead.model_validate(entity).model_dump(),
        properties=[EntityPropertyDefRead.model_validate(p) for p in props],
        values=[EntityPropertyValueRead.model_validate(v) for v in values],
    )


@router.get("", response_model=EntityListResponse)
async def list_entities(
    entity_type_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityListResponse:
    q = select(Entity).where(Entity.user_id == current_user.id)
    if entity_type_id is not None:
        q = q.where(Entity.entity_type_id == entity_type_id)
    q = q.order_by(Entity.name)
    result = await session.execute(q)
    return EntityListResponse(items=list(result.scalars().all()))


@router.post("", response_model=EntityDetail, status_code=status.HTTP_201_CREATED)
async def create_entity(
    body: EntityCreate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityDetail:
    # Verify the entity type belongs to the user
    et_result = await session.execute(
        select(EntityType).where(
            EntityType.id == body.entity_type_id, EntityType.user_id == current_user.id
        )
    )
    if et_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Entity type not found.",
        )
    entity = Entity(
        user_id=current_user.id,
        entity_type_id=body.entity_type_id,
        name=body.name,
    )
    session.add(entity)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An entity with this name already exists for this type.",
        )
    await session.refresh(entity)
    return await _load_detail(session, entity)


@router.get("/{entity_id}", response_model=EntityDetail)
async def get_entity(
    entity_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityDetail:
    entity = await _get_owned_entity_or_404(session, entity_id, current_user.id)
    return await _load_detail(session, entity)


@router.put("/{entity_id}", response_model=EntityDetail)
async def update_entity(
    entity_id: uuid.UUID,
    body: EntityUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> EntityDetail:
    entity = await _get_owned_entity_or_404(session, entity_id, current_user.id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(entity, field, value)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An entity with this name already exists for this type.",
        )
    await session.refresh(entity)
    return await _load_detail(session, entity)


@router.delete("/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entity(
    entity_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    entity = await _get_owned_entity_or_404(session, entity_id, current_user.id)
    await session.delete(entity)
    await session.commit()


# ── Property values ───────────────────────────────────────────────────────────

@router.put(
    "/{entity_id}/properties/{prop_def_id}",
    response_model=list[EntityPropertyValueRead],
)
async def set_property_values(
    entity_id: uuid.UUID,
    prop_def_id: uuid.UUID,
    body: list[EntityPropertyValueItem],
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[EntityPropertyValueRead]:
    """Replace all values for a property on an entity.
    For cardinality=one, body should contain exactly one item.
    For cardinality=many, any number of items is allowed.
    """
    entity = await _get_owned_entity_or_404(session, entity_id, current_user.id)

    prop_result = await session.execute(
        select(EntityPropertyDef).where(
            EntityPropertyDef.id == prop_def_id,
            EntityPropertyDef.entity_type_id == entity.entity_type_id,
        )
    )
    prop = prop_result.scalar_one_or_none()
    if prop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    if prop.cardinality == EntityPropertyCardinality.one and len(body) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Property cardinality is 'one' — provide exactly one value.",
        )

    # Delete existing values for this property on this entity
    existing = await session.execute(
        select(EntityPropertyValue).where(
            EntityPropertyValue.entity_id == entity_id,
            EntityPropertyValue.property_def_id == prop_def_id,
        )
    )
    for v in existing.scalars().all():
        await session.delete(v)

    new_values = []
    for item in body:
        val = EntityPropertyValue(
            entity_id=entity_id,
            property_def_id=prop_def_id,
            value_decimal=item.value_decimal,
            value_string=item.value_string,
            value_date=item.value_date,
            ref_entity_id=item.ref_entity_id,
        )
        session.add(val)
        new_values.append(val)

    await session.commit()
    for v in new_values:
        await session.refresh(v)
    return [EntityPropertyValueRead.model_validate(v) for v in new_values]


@router.delete(
    "/{entity_id}/properties/{prop_def_id}/{value_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_property_value(
    entity_id: uuid.UUID,
    prop_def_id: uuid.UUID,
    value_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    await _get_owned_entity_or_404(session, entity_id, current_user.id)
    result = await session.execute(
        select(EntityPropertyValue).where(
            EntityPropertyValue.id == value_id,
            EntityPropertyValue.entity_id == entity_id,
            EntityPropertyValue.property_def_id == prop_def_id,
        )
    )
    val = result.scalar_one_or_none()
    if val is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property value not found")
    await session.delete(val)
    await session.commit()
