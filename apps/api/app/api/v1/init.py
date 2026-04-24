"""Concept initialization endpoint.

POST /api/v1/init/concepts
Creates a standard set of starter concepts for a new user.
Idempotent: already-existing concept names are skipped.
"""
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept import Concept, ConceptCarryBehaviour, ConceptKind
from app.models.user import User
from app.schemas.concept import ConceptRead

router = APIRouter(prefix="/init", tags=["init"])

# ── seed definition ───────────────────────────────────────────────────────────
# Each entry is a dict of Concept constructor kwargs.
# Entries that need a resolved parent_group_id are handled in _DEFERRED below.

_SEED: list[dict] = [
    {
        "name": "rent",
        "kind": ConceptKind.value,
        "currency_code": "USD",
        # carry_behaviour defaults to copy_or_manual for value kind
    },
    {
        "name": "loans",
        "kind": ConceptKind.group,
        "currency_code": "USD",
        "aggregate_op": "sum",
        # carry_behaviour defaults to auto for group kind
    },
    {
        "name": "investments",
        "kind": ConceptKind.value,
        "currency_code": "USD",
    },
    {
        "name": "hourly_rate",
        "kind": ConceptKind.value,
        "currency_code": "USD",
        "carry_behaviour": ConceptCarryBehaviour.copy,
    },
    {
        "name": "hours_per_day",
        "kind": ConceptKind.value,
        "currency_code": "USD",
        "carry_behaviour": ConceptCarryBehaviour.copy,
        "literal_value": 8.0,
    },
    {
        "name": "working_days",
        "kind": ConceptKind.value,
        "currency_code": "USD",
        # copy_or_manual: user fills in each month but prior is carried as default
    },
    {
        "name": "monthly_salary",
        "kind": ConceptKind.formula,
        "currency_code": "USD",
        "expression": "hourly_rate * hours_per_day * working_days",
        # carry_behaviour defaults to auto for formula kind
    },
    # loan_payment is last so that loans.id is available
    {
        "name": "loan_payment",
        "kind": ConceptKind.value,
        "currency_code": "USD",
        # parent_group_id filled in at runtime
    },
]

_PARENT_MAP: dict[str, str] = {
    "loan_payment": "loans",
}


class ConceptInitResponse(BaseModel):
    created: list[ConceptRead]
    skipped: list[str]


@router.post(
    "/concepts",
    response_model=ConceptInitResponse,
    status_code=status.HTTP_201_CREATED,
)
async def init_concepts(
    response: Response,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptInitResponse:
    existing_result = await session.execute(
        select(Concept).where(Concept.user_id == current_user.id)
    )
    existing = {c.name: c for c in existing_result.scalars().all()}

    created: list[Concept] = []
    skipped: list[str] = []

    # First pass — create everything except concepts that need a parent resolved
    created_by_name: dict[str, Concept] = dict(existing)

    for seed in _SEED:
        name: str = seed["name"]
        if name in existing:
            skipped.append(name)
            continue

        kwargs = {k: v for k, v in seed.items()}
        parent_name = _PARENT_MAP.get(name)
        if parent_name:
            parent = created_by_name.get(parent_name)
            if parent is not None:
                kwargs["parent_group_id"] = parent.id

        concept = Concept(user_id=current_user.id, **kwargs)
        session.add(concept)
        await session.flush()
        created_by_name[name] = concept
        created.append(concept)

    await session.commit()
    for c in created:
        await session.refresh(c)

    all_skipped = skipped
    if not created:
        response.status_code = status.HTTP_200_OK
        return ConceptInitResponse(created=[], skipped=all_skipped)

    return ConceptInitResponse(
        created=[ConceptRead.model_validate(c) for c in created],
        skipped=all_skipped,
    )
