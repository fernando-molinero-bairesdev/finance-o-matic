import logging
from datetime import date

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.core.db import async_session_maker
from app.models.fx_rate import FxRate
from app.models.process import Process, ProcessConceptScope
from app.models.process_schedule import ProcessSchedule
from app.models.snapshot import SnapshotTrigger
from app.services.process import get_selected_concept_ids, next_run_date
from app.services.snapshot import take_snapshot

logger = logging.getLogger(__name__)


async def run_due_processes() -> None:
    """Fire snapshots for every active process whose next_run_at is today or overdue."""
    today = date.today()
    async with async_session_maker() as session:
        result = await session.execute(
            select(Process, ProcessSchedule)
            .join(ProcessSchedule, ProcessSchedule.process_id == Process.id)
            .where(
                Process.is_active.is_(True),
                ProcessSchedule.next_run_at <= today,
            )
        )
        rows = result.all()

    for process, schedule in rows:
        try:
            async with async_session_maker() as session:
                concept_ids = None
                if process.concept_scope == ProcessConceptScope.selected:
                    concept_ids = await get_selected_concept_ids(session, process.id)

                await take_snapshot(
                    session=session,
                    user_id=process.user_id,
                    snapshot_date=today,
                    label=None,
                    process_id=process.id,
                    concept_ids=concept_ids,
                    trigger=SnapshotTrigger.scheduled,
                )

                # Reload schedule in the same session so we can update it
                sched = await session.get(ProcessSchedule, schedule.id)
                if sched is not None:
                    sched.last_run_at = today
                    sched.next_run_at = next_run_date(process.cadence, today)
                await session.commit()
        except Exception:
            logger.exception("Scheduled snapshot failed for process %s", process.id)


async def fetch_fx_rates() -> None:
    """Fetch latest FX rates from frankfurter.app and upsert into the fx_rates table."""
    base = settings.fx_base_currency
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://api.frankfurter.app/latest",
                params={"from": base},
            )
            resp.raise_for_status()
        data = resp.json()
    except Exception:
        logger.exception("Failed to fetch FX rates from frankfurter.app")
        return

    as_of = date.fromisoformat(data["date"])
    rates: dict[str, float] = data["rates"]

    async with async_session_maker() as session:
        for quote_code, rate in rates.items():
            existing = await session.scalar(
                select(FxRate).where(
                    FxRate.base_code == base,
                    FxRate.quote_code == quote_code,
                    FxRate.as_of == as_of,
                )
            )
            if existing is not None:
                existing.rate = rate
            else:
                session.add(FxRate(base_code=base, quote_code=quote_code, rate=rate, as_of=as_of))
        await session.commit()
    logger.info("Fetched %d FX rates for %s as of %s", len(rates), base, as_of)
