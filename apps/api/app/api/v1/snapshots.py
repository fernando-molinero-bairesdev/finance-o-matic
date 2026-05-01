import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept_entry import ConceptEntry
from app.models.entity import Entity
from app.models.snapshot import Snapshot, SnapshotStatus
from app.models.snapshot_fx_rate import SnapshotFxRate
from app.models.user import User
from app.schemas.snapshot import (
    ConceptEntryRead,
    ConceptEntryResolve,
    SnapshotCreate,
    SnapshotDetail,
    SnapshotFxRateRead,
    SnapshotListResponse,
    SnapshotRead,
)
from app.services.snapshot import carry_forward_snapshot, process_snapshot, take_snapshot

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


async def _get_owned_snapshot_or_404(
    session: AsyncSession, snapshot_id: uuid.UUID, user_id: uuid.UUID
) -> Snapshot:
    result = await session.execute(
        select(Snapshot).where(Snapshot.id == snapshot_id, Snapshot.user_id == user_id)
    )
    snapshot = result.scalar_one_or_none()
    if snapshot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")
    return snapshot


async def _load_detail(session: AsyncSession, snapshot: Snapshot) -> SnapshotDetail:
    entries_result = await session.execute(
        select(ConceptEntry).where(ConceptEntry.snapshot_id == snapshot.id)
    )
    entries = list(entries_result.scalars().all())

    fx_result = await session.execute(
        select(SnapshotFxRate)
        .where(SnapshotFxRate.snapshot_id == snapshot.id)
        .order_by(SnapshotFxRate.quote_code)
    )
    fx_rates = list(fx_result.scalars().all())

    return SnapshotDetail(
        **SnapshotRead.model_validate(snapshot).model_dump(),
        entries=[ConceptEntryRead.model_validate(e) for e in entries],
        fx_rates=[SnapshotFxRateRead.model_validate(r) for r in fx_rates],
    )


@router.post("", response_model=SnapshotDetail, status_code=status.HTTP_201_CREATED)
async def create_snapshot(
    body: SnapshotCreate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> SnapshotDetail:
    snapshot = await take_snapshot(
        session=session,
        user_id=current_user.id,
        snapshot_date=body.date,
        label=body.label,
    )
    return await _load_detail(session, snapshot)


@router.get("", response_model=SnapshotListResponse)
async def list_snapshots(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> SnapshotListResponse:
    result = await session.execute(
        select(Snapshot)
        .where(Snapshot.user_id == current_user.id)
        .order_by(Snapshot.date.desc(), Snapshot.id.desc())
    )
    return SnapshotListResponse(items=list(result.scalars().all()))


@router.get("/{snapshot_id}", response_model=SnapshotDetail)
async def get_snapshot(
    snapshot_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> SnapshotDetail:
    snapshot = await _get_owned_snapshot_or_404(session, snapshot_id, current_user.id)
    return await _load_detail(session, snapshot)


@router.post("/{snapshot_id}/process", response_model=SnapshotDetail)
async def process_snapshot_endpoint(
    snapshot_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> SnapshotDetail:
    snapshot = await _get_owned_snapshot_or_404(session, snapshot_id, current_user.id)
    if snapshot.status not in (SnapshotStatus.open, SnapshotStatus.processed):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only open or processed snapshots can be re-processed.",
        )
    snapshot = await process_snapshot(session=session, snapshot=snapshot, user_id=current_user.id)
    return await _load_detail(session, snapshot)


@router.post("/{snapshot_id}/complete", response_model=SnapshotRead)
async def complete_snapshot(
    snapshot_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> SnapshotRead:
    snapshot = await _get_owned_snapshot_or_404(session, snapshot_id, current_user.id)
    if snapshot.status != SnapshotStatus.processed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only processed snapshots can be completed.",
        )
    snapshot.status = SnapshotStatus.complete
    await session.commit()
    await session.refresh(snapshot)
    return SnapshotRead.model_validate(snapshot)


@router.post("/{snapshot_id}/carry-forward", response_model=SnapshotDetail)
async def carry_forward(
    snapshot_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> SnapshotDetail:
    snapshot = await _get_owned_snapshot_or_404(session, snapshot_id, current_user.id)
    if snapshot.status == SnapshotStatus.complete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot modify a completed snapshot.",
        )
    await carry_forward_snapshot(session=session, snapshot=snapshot, user_id=current_user.id)
    return await _load_detail(session, snapshot)


@router.patch(
    "/{snapshot_id}/entries/{entry_id}",
    response_model=ConceptEntryRead,
)
async def update_entry(
    snapshot_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: ConceptEntryResolve,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptEntryRead:
    snapshot = await _get_owned_snapshot_or_404(session, snapshot_id, current_user.id)
    if snapshot.status == SnapshotStatus.complete:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot edit entries of a completed snapshot.",
        )

    entry_result = await session.execute(
        select(ConceptEntry).where(
            ConceptEntry.id == entry_id,
            ConceptEntry.snapshot_id == snapshot.id,
        )
    )
    entry = entry_result.scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")

    entry.value = body.value
    entry.is_pending = False

    if body.entity_id is not None:
        # Validate the entity belongs to the same user
        entity_result = await session.execute(
            select(Entity).where(
                Entity.id == body.entity_id, Entity.user_id == current_user.id
            )
        )
        if entity_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Entity not found.",
            )
        entry.entity_id = body.entity_id
    # else: leave entry.entity_id unchanged; entity_id is managed by take_snapshot

    await session.commit()
    await session.refresh(entry)
    return ConceptEntryRead.model_validate(entry)
