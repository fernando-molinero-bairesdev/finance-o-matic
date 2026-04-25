import uuid
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept_entry import ConceptEntry
from app.models.process import Process, ProcessConceptScope
from app.models.process_schedule import ProcessSchedule
from app.models.snapshot import Snapshot
from app.models.user import User
from app.schemas.process import (
    ProcessCreate,
    ProcessListResponse,
    ProcessRead,
    ProcessUpdate,
)
from app.schemas.snapshot import ConceptEntryRead, SnapshotCreate, SnapshotDetail, SnapshotRead
from app.services.process import (
    build_process_read_data,
    get_selected_concept_ids,
    next_run_date,
    sync_process_concepts,
)
from app.services.snapshot import take_snapshot

router = APIRouter(prefix="/processes", tags=["processes"])


async def _get_owned_process_or_404(
    session: AsyncSession, process_id: uuid.UUID, user_id: uuid.UUID
) -> Process:
    result = await session.execute(
        select(Process).where(Process.id == process_id, Process.user_id == user_id)
    )
    process = result.scalar_one_or_none()
    if process is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Process not found")
    return process


@router.post("", response_model=ProcessRead, status_code=status.HTTP_201_CREATED)
async def create_process(
    body: ProcessCreate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProcessRead:
    process = Process(
        user_id=current_user.id,
        name=body.name,
        cadence=body.cadence,
        concept_scope=body.concept_scope,
    )
    session.add(process)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A process with this name already exists.",
        )

    if body.concept_scope == ProcessConceptScope.selected and body.selected_concept_ids:
        await sync_process_concepts(session, process.id, body.selected_concept_ids)

    from app.models.process import ProcessCadence
    nrd = next_run_date(body.cadence, date_type.today())
    if nrd is not None:
        session.add(ProcessSchedule(process_id=process.id, next_run_at=nrd))

    await session.commit()
    await session.refresh(process)
    data = await build_process_read_data(session, process)
    return ProcessRead.model_validate(data)


@router.get("", response_model=ProcessListResponse)
async def list_processes(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProcessListResponse:
    result = await session.execute(
        select(Process).where(Process.user_id == current_user.id)
    )
    processes = result.scalars().all()
    items = [
        ProcessRead.model_validate(await build_process_read_data(session, p))
        for p in processes
    ]
    return ProcessListResponse(items=items)


@router.get("/{process_id}", response_model=ProcessRead)
async def get_process(
    process_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProcessRead:
    process = await _get_owned_process_or_404(session, process_id, current_user.id)
    data = await build_process_read_data(session, process)
    return ProcessRead.model_validate(data)


@router.put("/{process_id}", response_model=ProcessRead)
async def update_process(
    process_id: uuid.UUID,
    body: ProcessUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProcessRead:
    process = await _get_owned_process_or_404(session, process_id, current_user.id)

    for field, value in body.model_dump(exclude_unset=True, exclude={"selected_concept_ids"}).items():
        setattr(process, field, value)

    if body.selected_concept_ids is not None:
        await sync_process_concepts(session, process.id, body.selected_concept_ids)

    # Recalculate schedule when cadence changes or a deactivated process is re-enabled
    cadence_changed = body.cadence is not None
    reactivated = body.is_active is True
    if cadence_changed or reactivated:
        sched_result = await session.execute(
            select(ProcessSchedule).where(ProcessSchedule.process_id == process.id)
        )
        schedule = sched_result.scalar_one_or_none()
        nrd = next_run_date(process.cadence, date_type.today())
        if schedule is not None:
            schedule.next_run_at = nrd
        elif nrd is not None:
            session.add(ProcessSchedule(process_id=process.id, next_run_at=nrd))

    await session.commit()
    await session.refresh(process)
    data = await build_process_read_data(session, process)
    return ProcessRead.model_validate(data)


@router.delete("/{process_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_process(
    process_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    process = await _get_owned_process_or_404(session, process_id, current_user.id)
    await session.delete(process)
    await session.commit()


@router.post(
    "/{process_id}/snapshots",
    response_model=SnapshotDetail,
    status_code=status.HTTP_201_CREATED,
)
async def take_process_snapshot(
    process_id: uuid.UUID,
    body: SnapshotCreate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> SnapshotDetail:
    process = await _get_owned_process_or_404(session, process_id, current_user.id)

    concept_ids: list[uuid.UUID] | None = None
    if process.concept_scope == ProcessConceptScope.selected:
        concept_ids = await get_selected_concept_ids(session, process.id)

    snapshot = await take_snapshot(
        session=session,
        user_id=current_user.id,
        snapshot_date=body.date,
        label=body.label,
        process_id=process.id,
        concept_ids=concept_ids,
    )

    # Update schedule
    sched_result = await session.execute(
        select(ProcessSchedule).where(ProcessSchedule.process_id == process.id)
    )
    schedule = sched_result.scalar_one_or_none()
    if schedule is not None:
        schedule.last_run_at = body.date
        schedule.next_run_at = next_run_date(process.cadence, body.date)
        await session.commit()

    entries_result = await session.execute(
        select(ConceptEntry).where(ConceptEntry.snapshot_id == snapshot.id)
    )
    entries = list(entries_result.scalars().all())
    return SnapshotDetail(
        **SnapshotRead.model_validate(snapshot).model_dump(),
        entries=[ConceptEntryRead.model_validate(e) for e in entries],
    )
