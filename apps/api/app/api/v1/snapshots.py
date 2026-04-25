import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept_entry import ConceptEntry
from app.models.snapshot import Snapshot, SnapshotStatus
from app.models.user import User
from app.schemas.snapshot import (
    ConceptEntryRead,
    ConceptEntryResolve,
    SnapshotCreate,
    SnapshotDetail,
    SnapshotListResponse,
    SnapshotRead,
)
from app.services.snapshot import take_snapshot

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
    entries_result = await session.execute(
        select(ConceptEntry).where(ConceptEntry.snapshot_id == snapshot.id)
    )
    entries = list(entries_result.scalars().all())
    return SnapshotDetail(
        **SnapshotRead.model_validate(snapshot).model_dump(),
        entries=[ConceptEntryRead.model_validate(e) for e in entries],
    )


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
    entries_result = await session.execute(
        select(ConceptEntry).where(ConceptEntry.snapshot_id == snapshot.id)
    )
    entries = list(entries_result.scalars().all())
    return SnapshotDetail(
        **SnapshotRead.model_validate(snapshot).model_dump(),
        entries=[ConceptEntryRead.model_validate(e) for e in entries],
    )


@router.patch(
    "/{snapshot_id}/entries/{entry_id}",
    response_model=ConceptEntryRead,
)
async def resolve_entry(
    snapshot_id: uuid.UUID,
    entry_id: uuid.UUID,
    body: ConceptEntryResolve,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptEntryRead:
    snapshot = await _get_owned_snapshot_or_404(session, snapshot_id, current_user.id)

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

    # Update snapshot status if all entries are now resolved
    pending_result = await session.execute(
        select(ConceptEntry).where(
            ConceptEntry.snapshot_id == snapshot.id,
            ConceptEntry.is_pending.is_(True),
            ConceptEntry.id != entry.id,
        )
    )
    remaining_pending = pending_result.scalars().first()
    if remaining_pending is None:
        snapshot.status = SnapshotStatus.complete

    await session.commit()
    await session.refresh(entry)
    return ConceptEntryRead.model_validate(entry)
