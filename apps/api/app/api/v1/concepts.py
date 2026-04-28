import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept import Concept, ConceptKind
from app.models.concept_dependency import ConceptDependency
from app.models.concept_entry import ConceptEntry
from app.models.concept_group_membership import ConceptGroupMembership
from app.models.currency import Currency
from app.models.snapshot import Snapshot, SnapshotStatus
from app.models.user import User
from app.schemas.concept import (
    ConceptCreate,
    ConceptEvaluateResponse,
    ConceptHistoryPoint,
    ConceptListResponse,
    ConceptRead,
    ConceptUpdate,
)
from app.services.formula import (
    FormulaCycleError,
    FormulaEvaluationError,
    evaluate_concept_by_id,
    extract_dependency_graph,
)

router = APIRouter(prefix="/concepts", tags=["concepts"])


async def _get_owned_concept_or_404(
    session: AsyncSession, concept_id: uuid.UUID, user_id: uuid.UUID
) -> Concept:
    result = await session.execute(
        select(Concept).where(Concept.id == concept_id, Concept.user_id == user_id)
    )
    concept = result.scalar_one_or_none()
    if concept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Concept not found")
    return concept


async def _validate_group_ids(
    session: AsyncSession,
    group_ids: list[uuid.UUID],
    user_id: uuid.UUID,
) -> None:
    """Raise 409 if any group_id does not refer to a group-kind concept owned by the user."""
    if not group_ids:
        return
    result = await session.execute(
        select(Concept).where(
            Concept.id.in_(group_ids),
            Concept.user_id == user_id,
            Concept.kind == ConceptKind.group,
        )
    )
    found = {c.id for c in result.scalars().all()}
    missing = set(group_ids) - found
    if missing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"group_ids contains invalid or non-group concept ids: {[str(i) for i in missing]}",
        )


async def _build_group_ids_map(
    session: AsyncSession, concept_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[uuid.UUID]]:
    if not concept_ids:
        return {}
    mem_result = await session.execute(
        select(ConceptGroupMembership).where(
            ConceptGroupMembership.concept_id.in_(concept_ids)
        )
    )
    group_ids_by_concept: dict[uuid.UUID, list[uuid.UUID]] = defaultdict(list)
    for m in mem_result.scalars().all():
        group_ids_by_concept[m.concept_id].append(m.group_id)
    return group_ids_by_concept


def _to_concept_read(concept: Concept, group_ids: list[uuid.UUID]) -> ConceptRead:
    data = ConceptRead.model_validate(concept)
    data.group_ids = group_ids
    return data


@router.get("", response_model=ConceptListResponse)
async def list_concepts(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptListResponse:
    result = await session.execute(
        select(Concept).where(Concept.user_id == current_user.id)
    )
    concepts = list(result.scalars().all())
    group_ids_map = await _build_group_ids_map(session, [c.id for c in concepts])
    items = [_to_concept_read(c, group_ids_map.get(c.id, [])) for c in concepts]
    return ConceptListResponse(items=items)


@router.post("", response_model=ConceptRead, status_code=status.HTTP_201_CREATED)
async def create_concept(
    body: ConceptCreate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptRead:
    currency = await session.get(Currency, body.currency_code)
    if currency is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown currency code: {body.currency_code}",
        )
    await _validate_group_ids(session, body.group_ids, current_user.id)

    kwargs = body.model_dump(exclude_none=True, exclude={"group_ids"})
    concept = Concept(user_id=current_user.id, **kwargs)
    session.add(concept)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        orig = str(exc.orig).lower()
        if "uq_concept_user_name" in orig or "unique" in orig and "name" in orig:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A concept with this name already exists.",
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid field value (e.g. unknown currency code).",
        ) from exc

    for gid in body.group_ids:
        session.add(ConceptGroupMembership(concept_id=concept.id, group_id=gid))

    await session.commit()
    await session.refresh(concept)
    return _to_concept_read(concept, body.group_ids)


@router.get("/{concept_id}", response_model=ConceptRead)
async def get_concept(
    concept_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptRead:
    concept = await _get_owned_concept_or_404(session, concept_id, current_user.id)
    group_ids_map = await _build_group_ids_map(session, [concept.id])
    return _to_concept_read(concept, group_ids_map.get(concept.id, []))


@router.put("/{concept_id}", response_model=ConceptRead)
async def update_concept(
    concept_id: uuid.UUID,
    body: ConceptUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptRead:
    concept = await _get_owned_concept_or_404(session, concept_id, current_user.id)

    updates = body.model_dump(exclude_unset=True)
    new_group_ids: list[uuid.UUID] | None = updates.pop("group_ids", None)

    for field, value in updates.items():
        setattr(concept, field, value)

    if new_group_ids is not None:
        await _validate_group_ids(session, new_group_ids, current_user.id)
        await session.execute(
            delete(ConceptGroupMembership).where(
                ConceptGroupMembership.concept_id == concept.id
            )
        )
        for gid in new_group_ids:
            session.add(ConceptGroupMembership(concept_id=concept.id, group_id=gid))

    await session.commit()
    await session.refresh(concept)

    if new_group_ids is not None:
        final_group_ids = new_group_ids
    else:
        group_ids_map = await _build_group_ids_map(session, [concept.id])
        final_group_ids = group_ids_map.get(concept.id, [])

    return _to_concept_read(concept, final_group_ids)


@router.delete("/{concept_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_concept(
    concept_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> None:
    concept = await _get_owned_concept_or_404(session, concept_id, current_user.id)
    await session.delete(concept)
    await session.commit()


@router.post("/{concept_id}/evaluate", response_model=ConceptEvaluateResponse)
async def evaluate_concept(
    concept_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptEvaluateResponse:
    concepts_result = await session.execute(
        select(Concept).where(Concept.user_id == current_user.id)
    )
    concepts = list(concepts_result.scalars().all())

    concept = next((item for item in concepts if item.id == concept_id), None)
    if concept is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Concept not found")

    # Build group_members for evaluation
    concept_ids = [c.id for c in concepts]
    mem_result = await session.execute(
        select(ConceptGroupMembership).where(
            ConceptGroupMembership.concept_id.in_(concept_ids)
        )
    )
    concept_map = {c.id: c for c in concepts}
    group_members: dict[uuid.UUID, list] = {}
    for m in mem_result.scalars().all():
        if m.concept_id in concept_map:
            group_members.setdefault(m.group_id, []).append(concept_map[m.concept_id])

    try:
        dependencies = extract_dependency_graph(concepts)
        value = evaluate_concept_by_id(concept_id, concepts, group_members)
    except FormulaCycleError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "formula_cycle", "message": str(exc)},
        ) from exc
    except FormulaEvaluationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "formula_invalid", "message": str(exc)},
        ) from exc

    direct_dependencies = sorted(dependencies.get(concept_id, set()))
    await session.execute(delete(ConceptDependency).where(ConceptDependency.concept_id == concept_id))
    session.add_all(
        [
            ConceptDependency(concept_id=concept_id, depends_on_concept_id=dependency_id)
            for dependency_id in direct_dependencies
        ]
    )
    await session.commit()

    return ConceptEvaluateResponse(
        concept_id=concept.id,
        kind=concept.kind,
        currency_code=concept.currency_code,
        value=value,
        direct_dependencies=direct_dependencies,
    )


@router.get("/{concept_id}/history", response_model=list[ConceptHistoryPoint])
async def get_concept_history(
    concept_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> list[ConceptHistoryPoint]:
    await _get_owned_concept_or_404(session, concept_id, current_user.id)

    result = await session.execute(
        select(
            ConceptEntry.snapshot_id,
            Snapshot.date,
            ConceptEntry.value,
            ConceptEntry.currency_code,
        )
        .join(Snapshot, ConceptEntry.snapshot_id == Snapshot.id)
        .where(
            ConceptEntry.concept_id == concept_id,
            Snapshot.user_id == current_user.id,
            Snapshot.status == SnapshotStatus.complete,
        )
        .order_by(Snapshot.date.asc())
    )

    return [
        ConceptHistoryPoint(
            snapshot_id=row.snapshot_id,
            date=row.date,
            value=row.value,
            currency_code=row.currency_code,
        )
        for row in result.all()
    ]
