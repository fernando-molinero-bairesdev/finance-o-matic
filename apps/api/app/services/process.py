import calendar
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.process import Process, ProcessCadence, ProcessConceptScope
from app.models.process_concept import ProcessConcept
from app.models.process_schedule import ProcessSchedule


def next_run_date(cadence: ProcessCadence, from_date: date) -> date | None:
    if cadence == ProcessCadence.manual:
        return None
    if cadence == ProcessCadence.daily:
        return from_date + timedelta(days=1)
    if cadence == ProcessCadence.weekly:
        return from_date + timedelta(weeks=1)
    if cadence in (ProcessCadence.monthly, ProcessCadence.quarterly):
        months = 1 if cadence == ProcessCadence.monthly else 3
        year, month = from_date.year, from_date.month + months
        while month > 12:
            month -= 12
            year += 1
        day = min(from_date.day, calendar.monthrange(year, month)[1])
        return date(year, month, day)
    return None


async def build_process_read_data(
    session: AsyncSession, process: Process
) -> dict:
    """Assemble the extra fields (schedule, selected_concept_ids) for ProcessRead."""
    schedule_result = await session.execute(
        select(ProcessSchedule).where(ProcessSchedule.process_id == process.id)
    )
    schedule = schedule_result.scalar_one_or_none()

    concept_ids: list[uuid.UUID] = []
    if process.concept_scope == ProcessConceptScope.selected:
        pc_result = await session.execute(
            select(ProcessConcept).where(ProcessConcept.process_id == process.id)
        )
        concept_ids = [pc.concept_id for pc in pc_result.scalars().all()]

    return {
        "id": process.id,
        "user_id": process.user_id,
        "name": process.name,
        "cadence": process.cadence,
        "concept_scope": process.concept_scope,
        "is_active": process.is_active,
        "schedule": schedule,
        "selected_concept_ids": concept_ids,
    }


async def get_selected_concept_ids(
    session: AsyncSession, process_id: uuid.UUID
) -> list[uuid.UUID]:
    result = await session.execute(
        select(ProcessConcept).where(ProcessConcept.process_id == process_id)
    )
    return [pc.concept_id for pc in result.scalars().all()]


async def sync_process_concepts(
    session: AsyncSession,
    process_id: uuid.UUID,
    concept_ids: list[uuid.UUID],
) -> None:
    existing_result = await session.execute(
        select(ProcessConcept).where(ProcessConcept.process_id == process_id)
    )
    existing = {pc.concept_id: pc for pc in existing_result.scalars().all()}
    desired = set(concept_ids)

    for cid in desired - existing.keys():
        session.add(ProcessConcept(process_id=process_id, concept_id=cid))
    for cid, pc in existing.items():
        if cid not in desired:
            await session.delete(pc)
