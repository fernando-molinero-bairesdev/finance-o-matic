import types
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.concept import Concept, ConceptCarryBehaviour, ConceptKind
from app.models.concept_entry import ConceptEntry
from app.models.concept_group_membership import ConceptGroupMembership
from app.models.entity import Entity
from app.models.fx_rate import FxRate
from app.models.snapshot import Snapshot, SnapshotStatus, SnapshotTrigger
from app.services.formula import FormulaEvaluationError, evaluate_concept_by_id


async def _get_prior_entry(
    session: AsyncSession,
    user_id: uuid.UUID,
    concept_id: uuid.UUID,
    entity_id: uuid.UUID | None = None,
) -> ConceptEntry | None:
    """Return the most recent resolved ConceptEntry from a complete snapshot."""
    query = (
        select(ConceptEntry)
        .join(Snapshot, ConceptEntry.snapshot_id == Snapshot.id)
        .where(
            Snapshot.user_id == user_id,
            ConceptEntry.concept_id == concept_id,
            Snapshot.status == SnapshotStatus.complete,
        )
    )
    if entity_id is not None:
        query = query.where(ConceptEntry.entity_id == entity_id)
    else:
        query = query.where(ConceptEntry.entity_id.is_(None))
    result = await session.execute(
        query.order_by(Snapshot.date.desc(), Snapshot.id.desc()).limit(1)
    )
    return result.scalar_one_or_none()


async def _load_fx_rates(session: AsyncSession) -> dict[str, float]:
    """Return the most recent FX rates keyed by quote_code (base = settings.fx_base_currency)."""
    result = await session.execute(
        select(FxRate.quote_code, FxRate.rate, FxRate.as_of)
        .where(FxRate.base_code == settings.fx_base_currency)
        .order_by(FxRate.as_of.desc())
    )
    rates: dict[str, float] = {}
    for row in result.all():
        if row.quote_code not in rates:
            rates[row.quote_code] = row.rate
    return rates


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

    # Fetch all entities for this user, grouped by entity_type_id
    entities_result = await session.execute(
        select(Entity).where(Entity.user_id == user_id)
    )
    all_entities = list(entities_result.scalars().all())
    entities_by_type: dict[uuid.UUID, list[Entity]] = {}
    for entity in all_entities:
        entities_by_type.setdefault(entity.entity_type_id, []).append(entity)

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

        if concept.entity_type_id is not None:
            # Per-entity concept: create one entry per entity of the bound type.
            bound_entities = entities_by_type.get(concept.entity_type_id, [])
            if not bound_entities:
                # No entities of that type yet — fall back to a single entry
                bound_entities_or_none: list[Entity | None] = [None]
            else:
                bound_entities_or_none = list(bound_entities)  # type: ignore[assignment]
        else:
            bound_entities_or_none = [None]

        for entity in bound_entities_or_none:
            entity_id = entity.id if entity is not None else None
            value: float | None = None

            if behaviour == ConceptCarryBehaviour.auto:
                pass
            elif behaviour in (ConceptCarryBehaviour.copy, ConceptCarryBehaviour.copy_or_manual):
                prior = await _get_prior_entry(session, user_id, concept.id, entity_id=entity_id)
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
                    entity_id=entity_id,
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

    # Load group memberships and build group_id → [member concepts] dict
    concept_ids = [c.id for c in all_concepts]
    mem_result = await session.execute(
        select(ConceptGroupMembership).where(
            ConceptGroupMembership.concept_id.in_(concept_ids)
        )
    )
    concept_map = {c.id: c for c in all_concepts}
    group_members: dict[uuid.UUID, list] = {}
    for m in mem_result.scalars().all():
        if m.concept_id in concept_map:
            group_members.setdefault(m.group_id, []).append(concept_map[m.concept_id])

    # Load the snapshot's entries
    entries_result = await session.execute(
        select(ConceptEntry).where(ConceptEntry.snapshot_id == snapshot.id)
    )
    entries = list(entries_result.scalars().all())

    # Build a map of concept_id → value from the snapshot's non-auto entries.
    # For per-entity concepts (multiple entries with the same concept_id but different
    # entity_ids), sum all entity values so formulas can reference them as a single scalar.
    _raw: dict[uuid.UUID, list[float]] = {}
    for e in entries:
        if e.carry_behaviour_used != ConceptCarryBehaviour.auto and e.value is not None:
            _raw.setdefault(e.concept_id, []).append(e.value)
    entry_value_map: dict[uuid.UUID, float] = {cid: sum(vals) for cid, vals in _raw.items()}

    # For value concepts not present in this snapshot, fall back to their most recent
    # completed entry value so formulas that reference out-of-scope concepts can still
    # evaluate correctly.
    in_snapshot_ids = set(entry_value_map.keys()) | {
        e.concept_id for e in entries if e.carry_behaviour_used == ConceptCarryBehaviour.auto
    }
    needs_prior = [
        c for c in all_concepts
        if c.kind == ConceptKind.value
        and c.id not in in_snapshot_ids
        and c.literal_value is None
    ]
    if needs_prior:
        prior_result = await session.execute(
            select(ConceptEntry.concept_id, ConceptEntry.value, Snapshot.date, Snapshot.id)
            .join(Snapshot, ConceptEntry.snapshot_id == Snapshot.id)
            .where(
                ConceptEntry.concept_id.in_([c.id for c in needs_prior]),
                Snapshot.user_id == user_id,
                Snapshot.status == SnapshotStatus.complete,
                ConceptEntry.entity_id.is_(None),
            )
            .order_by(Snapshot.date.desc(), Snapshot.id.desc())
        )
        seen_prior: set[uuid.UUID] = set()
        for row in prior_result.all():
            if row.concept_id not in seen_prior:
                seen_prior.add(row.concept_id)
                if row.value is not None:
                    entry_value_map[row.concept_id] = row.value

    # Load the latest FX rates for cross-currency formula evaluation
    fx_rates = await _load_fx_rates(session)

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
                    aggregate_op=c.aggregate_op,
                    currency_code=c.currency_code,
                ))
            else:
                patched.append(c)
        return patched

    for entry in entries:
        if entry.carry_behaviour_used == ConceptCarryBehaviour.auto:
            try:
                entry.value = evaluate_concept_by_id(
                    entry.concept_id,
                    _patched_concepts(),
                    group_members,
                    fx_rates=fx_rates,
                    base_currency=settings.fx_base_currency,
                )
            except FormulaEvaluationError:
                entry.value = None
            concept = concept_map.get(entry.concept_id)
            if concept:
                entry.formula_snapshot = concept.expression

    snapshot.status = SnapshotStatus.processed
    await session.commit()
    await session.refresh(snapshot)
    return snapshot
