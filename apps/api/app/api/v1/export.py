"""Export endpoints.

GET /api/v1/export/concepts  — user's concepts as portable name-based JSON
GET /api/v1/export/processes — user's processes as portable name-based JSON
"""
from collections import defaultdict

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept import Concept, ConceptCarryBehaviour, ConceptKind
from app.models.concept_group_membership import ConceptGroupMembership
from app.models.entity_type import EntityType
from app.models.process import Process, ProcessCadence, ProcessConceptScope
from app.models.user import User
from app.services.process import get_selected_concept_ids

router = APIRouter(prefix="/export", tags=["export"])


class ConceptExportItem(BaseModel):
    name: str
    kind: ConceptKind
    currency_code: str
    carry_behaviour: ConceptCarryBehaviour
    literal_value: float | None = None
    expression: str | None = None
    aggregate_op: str | None = None
    entity_type_name: str | None = None
    group_names: list[str] = []


class ConceptExportResponse(BaseModel):
    concepts: list[ConceptExportItem]


class ProcessExportItem(BaseModel):
    name: str
    cadence: ProcessCadence
    concept_scope: ProcessConceptScope
    selected_concept_names: list[str] = []


class ProcessExportResponse(BaseModel):
    processes: list[ProcessExportItem]


@router.get("/concepts", response_model=ConceptExportResponse)
async def export_concepts(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptExportResponse:
    concepts_result = await session.execute(
        select(Concept).where(Concept.user_id == user.id)
    )
    concepts = list(concepts_result.scalars().all())

    concept_by_id = {c.id: c for c in concepts}

    # group membership: concept_id → list of group names
    group_names_by_concept: dict = defaultdict(list)
    if concepts:
        mem_result = await session.execute(
            select(ConceptGroupMembership).where(
                ConceptGroupMembership.concept_id.in_(list(concept_by_id))
            )
        )
        for m in mem_result.scalars().all():
            group = concept_by_id.get(m.group_id)
            if group:
                group_names_by_concept[m.concept_id].append(group.name)

    # entity type names
    et_result = await session.execute(
        select(EntityType).where(EntityType.user_id == user.id)
    )
    et_by_id = {et.id: et.name for et in et_result.scalars().all()}

    items = [
        ConceptExportItem(
            name=c.name,
            kind=c.kind,
            currency_code=c.currency_code,
            carry_behaviour=c.carry_behaviour,
            literal_value=c.literal_value,
            expression=c.expression,
            aggregate_op=c.aggregate_op,
            entity_type_name=et_by_id.get(c.entity_type_id) if c.entity_type_id else None,
            group_names=sorted(group_names_by_concept.get(c.id, [])),
        )
        for c in concepts
    ]

    return ConceptExportResponse(concepts=items)


@router.get("/processes", response_model=ProcessExportResponse)
async def export_processes(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ProcessExportResponse:
    processes_result = await session.execute(
        select(Process).where(Process.user_id == user.id)
    )
    processes = list(processes_result.scalars().all())

    concepts_result = await session.execute(
        select(Concept).where(Concept.user_id == user.id)
    )
    concept_by_id = {c.id: c.name for c in concepts_result.scalars().all()}

    items: list[ProcessExportItem] = []
    for p in processes:
        selected_names: list[str] = []
        if p.concept_scope == ProcessConceptScope.selected:
            selected_ids = await get_selected_concept_ids(session, p.id)
            selected_names = sorted(
                concept_by_id[cid] for cid in selected_ids if cid in concept_by_id
            )
        items.append(ProcessExportItem(
            name=p.name,
            cadence=p.cadence,
            concept_scope=p.concept_scope,
            selected_concept_names=selected_names,
        ))

    return ProcessExportResponse(processes=items)
