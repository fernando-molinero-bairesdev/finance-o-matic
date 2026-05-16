"""Async DB resolution for historical formula functions (hist_sum, hist_min, etc.)."""
import calendar
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.concept import Concept
from app.models.concept_entry import ConceptEntry
from app.models.process import Process
from app.models.snapshot import Snapshot, SnapshotStatus
from app.services.formula.engine import HistoricalCallSpec, _hist_key, extract_hist_specs


async def resolve_hist_calls(
    session: AsyncSession,
    user_id: uuid.UUID,
    expression: str,
    as_of_date: date,
) -> dict[str, float]:
    """Pre-resolve all hist_* calls in *expression* and return a key→value dict.

    The returned dict maps `_hist_key(spec)` → resolved float value, ready to be
    passed as *hist_resolved* to `evaluate_concept_by_id`.
    """
    specs = extract_hist_specs(expression)
    result: dict[str, float] = {}
    for spec in specs:
        key = _hist_key(spec)
        if key in result:
            continue
        values = await _query_hist(session, user_id, spec, as_of_date)
        if spec.func_name == "hist_sum":
            result[key] = float(sum(values))
        elif spec.func_name == "hist_min":
            result[key] = float(min(values)) if values else 0.0
        elif spec.func_name == "hist_max":
            result[key] = float(max(values)) if values else 0.0
        elif spec.func_name == "hist_count":
            result[key] = float(len(values))
    return result


async def _query_hist(
    session: AsyncSession,
    user_id: uuid.UUID,
    spec: HistoricalCallSpec,
    as_of_date: date,
) -> list[float]:
    """Query complete snapshot entry values for a concept within the time window."""
    cutoff = _compute_cutoff(as_of_date, spec.period, spec.unit)

    query = (
        select(ConceptEntry.value)
        .join(Snapshot, ConceptEntry.snapshot_id == Snapshot.id)
        .join(Concept, ConceptEntry.concept_id == Concept.id)
        .where(
            Snapshot.user_id == user_id,
            Snapshot.status == SnapshotStatus.complete,
            Snapshot.date >= cutoff,
            Snapshot.date < as_of_date,
            Concept.name == spec.concept_name,
            Concept.user_id == user_id,
            ConceptEntry.value.is_not(None),
            ConceptEntry.entity_id.is_(None),
        )
    )

    if spec.process_names:
        query = (
            query.join(Process, Snapshot.process_id == Process.id)
            .where(Process.name.in_(spec.process_names))
        )

    rows = await session.execute(query)
    return [float(row[0]) for row in rows.all()]


def _compute_cutoff(as_of: date, period: int, unit: str) -> date:
    if unit == "day":
        return as_of - timedelta(days=period)
    if unit == "week":
        return as_of - timedelta(weeks=period)
    if unit == "month":
        month = as_of.month - period
        year = as_of.year
        while month <= 0:
            month += 12
            year -= 1
        max_day = calendar.monthrange(year, month)[1]
        return as_of.replace(year=year, month=month, day=min(as_of.day, max_day))
    if unit == "year":
        try:
            return as_of.replace(year=as_of.year - period)
        except ValueError:
            # Handle Feb 29 in a non-leap year
            return as_of.replace(year=as_of.year - period, day=28)
    raise ValueError(f"Unknown time unit: {unit!r}")
