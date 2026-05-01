"""Import endpoints.

POST /api/v1/import/concepts  — bulk upsert concepts from portable name-based JSON
POST /api/v1/import/processes — bulk upsert processes from portable name-based JSON
"""
import uuid
from datetime import date as date_type

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept import Concept, ConceptCarryBehaviour, ConceptKind
from app.models.concept_group_membership import ConceptGroupMembership
from app.models.entity_type import EntityType
from app.models.process import Process, ProcessCadence, ProcessConceptScope
from app.models.process_schedule import ProcessSchedule
from app.models.user import User
from app.services.process import next_run_date, sync_process_concepts

router = APIRouter(prefix="/import", tags=["import"])


class ImportResult(BaseModel):
    created: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []


class ConceptImportItem(BaseModel):
    name: str
    kind: ConceptKind
    currency_code: str
    carry_behaviour: ConceptCarryBehaviour | None = None
    literal_value: float | None = None
    expression: str | None = None
    aggregate_op: str | None = None
    entity_type_name: str | None = None
    group_names: list[str] = []


class ConceptImportPayload(BaseModel):
    concepts: list[ConceptImportItem]


class ProcessImportItem(BaseModel):
    name: str
    cadence: ProcessCadence
    concept_scope: ProcessConceptScope
    selected_concept_names: list[str] = []


class ProcessImportPayload(BaseModel):
    processes: list[ProcessImportItem]


@router.post("/concepts", response_model=ImportResult)
async def import_concepts(
    body: ConceptImportPayload,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportResult:
    result = ImportResult()

    concepts_result = await session.execute(
        select(Concept).where(Concept.user_id == user.id)
    )
    concept_by_name: dict[str, Concept] = {c.name: c for c in concepts_result.scalars().all()}

    et_result = await session.execute(
        select(EntityType).where(EntityType.user_id == user.id)
    )
    et_by_name = {et.name: et for et in et_result.scalars().all()}

    # Pass 1: upsert concept rows (without group memberships)
    errored_names: set[str] = set()
    for item in body.concepts:
        entity_type_id: uuid.UUID | None = None
        if item.entity_type_name is not None:
            et = et_by_name.get(item.entity_type_name)
            if et is None:
                result.errors.append(
                    f"{item.name}: unknown entity_type_name '{item.entity_type_name}'"
                )
                errored_names.add(item.name)
                continue
            entity_type_id = et.id

        if item.name in concept_by_name:
            c = concept_by_name[item.name]
            c.kind = item.kind
            c.currency_code = item.currency_code
            if item.carry_behaviour is not None:
                c.carry_behaviour = item.carry_behaviour
            c.literal_value = item.literal_value
            c.expression = item.expression
            c.aggregate_op = item.aggregate_op
            c.entity_type_id = entity_type_id
            result.updated.append(item.name)
        else:
            kwargs: dict = dict(
                user_id=user.id,
                name=item.name,
                kind=item.kind,
                currency_code=item.currency_code,
                literal_value=item.literal_value,
                expression=item.expression,
                aggregate_op=item.aggregate_op,
                entity_type_id=entity_type_id,
            )
            if item.carry_behaviour is not None:
                kwargs["carry_behaviour"] = item.carry_behaviour
            c = Concept(**kwargs)
            session.add(c)
            concept_by_name[item.name] = c
            result.created.append(item.name)

        await session.flush()

    # Pass 2: resolve group memberships
    for item in body.concepts:
        if item.name in errored_names or not item.group_names:
            continue

        c = concept_by_name.get(item.name)
        if c is None:
            continue

        new_group_ids: list[uuid.UUID] = []
        had_error = False
        for gname in item.group_names:
            group = concept_by_name.get(gname)
            if group is None:
                result.errors.append(f"{item.name}: unknown group '{gname}'")
                had_error = True
                break
            if group.kind != ConceptKind.group:
                result.errors.append(f"{item.name}: '{gname}' is not a group concept")
                had_error = True
                break
            new_group_ids.append(group.id)

        if had_error:
            continue

        await session.execute(
            delete(ConceptGroupMembership).where(
                ConceptGroupMembership.concept_id == c.id
            )
        )
        for gid in new_group_ids:
            session.add(ConceptGroupMembership(concept_id=c.id, group_id=gid))

    await session.commit()
    return result


@router.post("/processes", response_model=ImportResult)
async def import_processes(
    body: ProcessImportPayload,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ImportResult:
    result = ImportResult()

    processes_result = await session.execute(
        select(Process).where(Process.user_id == user.id)
    )
    process_by_name: dict[str, Process] = {p.name: p for p in processes_result.scalars().all()}

    concepts_result = await session.execute(
        select(Concept).where(Concept.user_id == user.id)
    )
    concept_by_name = {c.name: c for c in concepts_result.scalars().all()}

    for item in body.processes:
        selected_ids: list[uuid.UUID] = []
        had_error = False
        if item.concept_scope == ProcessConceptScope.selected:
            for cname in item.selected_concept_names:
                c = concept_by_name.get(cname)
                if c is None:
                    result.errors.append(f"{item.name}: unknown concept '{cname}'")
                    had_error = True
                    break
                selected_ids.append(c.id)

        if had_error:
            continue

        if item.name in process_by_name:
            p = process_by_name[item.name]
            p.cadence = item.cadence
            p.concept_scope = item.concept_scope
            await session.flush()
            if item.concept_scope == ProcessConceptScope.selected:
                await sync_process_concepts(session, p.id, selected_ids)
            result.updated.append(item.name)
        else:
            p = Process(
                user_id=user.id,
                name=item.name,
                cadence=item.cadence,
                concept_scope=item.concept_scope,
            )
            session.add(p)
            await session.flush()
            if item.concept_scope == ProcessConceptScope.selected and selected_ids:
                await sync_process_concepts(session, p.id, selected_ids)
            nrd = next_run_date(item.cadence, date_type.today())
            if nrd is not None:
                session.add(ProcessSchedule(process_id=p.id, next_run_at=nrd))
            result.created.append(item.name)

    await session.commit()
    return result
