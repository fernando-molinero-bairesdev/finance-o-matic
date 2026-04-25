import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.concept import Concept, ConceptCarryBehaviour, ConceptKind
from app.models.concept_entry import ConceptEntry
from app.models.snapshot import Snapshot, SnapshotStatus, SnapshotTrigger
from app.services.formula import FormulaEvaluationError, evaluate_concept_by_id


async def _get_prior_entry(
    session: AsyncSession,
    user_id: uuid.UUID,
    concept_id: uuid.UUID,
) -> ConceptEntry | None:
    """Return the most recent non-pending ConceptEntry for this concept."""
    result = await session.execute(
        select(ConceptEntry)
        .join(Snapshot, ConceptEntry.snapshot_id == Snapshot.id)
        .where(
            Snapshot.user_id == user_id,
            ConceptEntry.concept_id == concept_id,
            ConceptEntry.is_pending.is_(False),
        )
        .order_by(Snapshot.date.desc(), Snapshot.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def take_snapshot(
    session: AsyncSession,
    user_id: uuid.UUID,
    snapshot_date: date,
    label: str | None,
    process_id: uuid.UUID | None = None,
    concept_ids: list[uuid.UUID] | None = None,
    trigger: SnapshotTrigger = SnapshotTrigger.manual,
) -> Snapshot:
    query = select(Concept).where(Concept.user_id == user_id)
    if concept_ids is not None:
        query = query.where(Concept.id.in_(concept_ids))
    concepts_result = await session.execute(query)
    concepts = list(concepts_result.scalars().all())

    snapshot = Snapshot(
        user_id=user_id,
        process_id=process_id,
        date=snapshot_date,
        label=label,
        trigger=trigger,
        status=SnapshotStatus.pending,
    )
    session.add(snapshot)
    await session.flush()  # get snapshot.id

    any_pending = False
    entries: list[ConceptEntry] = []

    for concept in concepts:
        behaviour = concept.carry_behaviour
        value: float | None = None
        is_pending = False
        formula_snapshot: str | None = None

        if behaviour == ConceptCarryBehaviour.auto:
            try:
                value = evaluate_concept_by_id(concept.id, concepts)
            except FormulaEvaluationError:
                value = None
            formula_snapshot = concept.expression

        elif behaviour == ConceptCarryBehaviour.copy:
            prior = await _get_prior_entry(session, user_id, concept.id)
            if prior is not None:
                value = prior.value
            else:
                # No prior entry — treat as pending so user can supply the first value
                is_pending = True
                any_pending = True

        elif behaviour == ConceptCarryBehaviour.copy_or_manual:
            prior = await _get_prior_entry(session, user_id, concept.id)
            if prior is not None:
                value = prior.value
            else:
                is_pending = True
                any_pending = True

        entries.append(
            ConceptEntry(
                snapshot_id=snapshot.id,
                concept_id=concept.id,
                value=value,
                currency_code=concept.currency_code,
                carry_behaviour_used=behaviour,
                formula_snapshot=formula_snapshot,
                is_pending=is_pending,
            )
        )

    session.add_all(entries)

    snapshot.status = SnapshotStatus.pending if any_pending else SnapshotStatus.complete
    await session.commit()
    await session.refresh(snapshot)
    return snapshot
