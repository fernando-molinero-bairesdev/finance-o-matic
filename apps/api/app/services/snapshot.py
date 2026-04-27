import types
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
    """Return the most recent resolved ConceptEntry from a complete snapshot."""
    result = await session.execute(
        select(ConceptEntry)
        .join(Snapshot, ConceptEntry.snapshot_id == Snapshot.id)
        .where(
            Snapshot.user_id == user_id,
            ConceptEntry.concept_id == concept_id,
            Snapshot.status == SnapshotStatus.complete,
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
        status=SnapshotStatus.open,
    )
    session.add(snapshot)
    await session.flush()

    entries: list[ConceptEntry] = []

    for concept in concepts:
        behaviour = concept.carry_behaviour
        value: float | None = None

        if behaviour == ConceptCarryBehaviour.auto:
            # Auto concepts are evaluated later when the user processes the snapshot.
            # Leave value as None until then.
            pass

        elif behaviour in (ConceptCarryBehaviour.copy, ConceptCarryBehaviour.copy_or_manual):
            prior = await _get_prior_entry(session, user_id, concept.id)
            if prior is not None:
                value = prior.value

        entries.append(
            ConceptEntry(
                snapshot_id=snapshot.id,
                concept_id=concept.id,
                value=value,
                currency_code=concept.currency_code,
                carry_behaviour_used=behaviour,
                formula_snapshot=None,
                is_pending=False,
            )
        )

    session.add_all(entries)
    await session.commit()
    await session.refresh(snapshot)
    return snapshot


async def process_snapshot(
    session: AsyncSession,
    snapshot: Snapshot,
    user_id: uuid.UUID,
) -> Snapshot:
    """Run formula engine on all auto entries, transition snapshot to processed."""
    if snapshot.status not in (SnapshotStatus.open, SnapshotStatus.processed):
        raise ValueError(f"Cannot process snapshot in status '{snapshot.status}'")

    # Load ALL user concepts for formula evaluation (not just scoped ones)
    all_concepts_result = await session.execute(
        select(Concept).where(Concept.user_id == user_id)
    )
    all_concepts = list(all_concepts_result.scalars().all())

    # Load the snapshot's entries
    entries_result = await session.execute(
        select(ConceptEntry).where(ConceptEntry.snapshot_id == snapshot.id)
    )
    entries = list(entries_result.scalars().all())

    concept_map = {c.id: c for c in all_concepts}

    # Build a map of concept_id → value from the snapshot's non-auto entries.
    # The formula engine uses concept.literal_value for ConceptKind.value nodes, but
    # the user fills values into snapshot entries (not the concept itself). We create
    # lightweight proxy objects that override literal_value so the engine sees the
    # snapshot-specific values instead of the global concept definition.
    entry_value_map: dict[uuid.UUID, float] = {
        e.concept_id: e.value
        for e in entries
        if e.carry_behaviour_used != ConceptCarryBehaviour.auto and e.value is not None
    }

    def _patched_concepts() -> list:
        patched = []
        for c in all_concepts:
            entry_val = entry_value_map.get(c.id)
            if entry_val is not None and c.kind == ConceptKind.value:
                patched.append(types.SimpleNamespace(
                    id=c.id,
                    name=c.name,
                    kind=c.kind,
                    literal_value=entry_val,
                    expression=c.expression,
                    parent_group_id=c.parent_group_id,
                    aggregate_op=c.aggregate_op,
                ))
            else:
                patched.append(c)
        return patched

    for entry in entries:
        if entry.carry_behaviour_used == ConceptCarryBehaviour.auto:
            try:
                entry.value = evaluate_concept_by_id(entry.concept_id, _patched_concepts())
            except FormulaEvaluationError:
                entry.value = None
            concept = concept_map.get(entry.concept_id)
            if concept:
                entry.formula_snapshot = concept.expression

    snapshot.status = SnapshotStatus.processed
    await session.commit()
    await session.refresh(snapshot)
    return snapshot
