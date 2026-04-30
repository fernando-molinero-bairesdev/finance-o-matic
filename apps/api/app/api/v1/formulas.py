import uuid
from types import SimpleNamespace

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.config import settings
from app.core.db import get_async_session
from app.models.concept import Concept, ConceptKind
from app.models.fx_rate import FxRate
from app.models.user import User
from app.services.formula import (
    FormulaEvaluationError,
    FormulaSyntaxError,
    evaluate_concept_by_id,
    extract_reference_names,
)

router = APIRouter(prefix="/formulas", tags=["formulas"])


class FormulaPreviewIn(BaseModel):
    expression: str


class FormulaPreviewOut(BaseModel):
    value: float | None
    dependencies: list[str]
    error: str | None


@router.post("/preview", response_model=FormulaPreviewOut)
async def preview_formula(
    body: FormulaPreviewIn,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> FormulaPreviewOut:
    try:
        dep_names = extract_reference_names(body.expression)
    except FormulaSyntaxError as exc:
        return FormulaPreviewOut(value=None, dependencies=[], error=str(exc))

    result = await session.execute(select(Concept).where(Concept.user_id == user.id))
    concepts = result.scalars().all()
    concept_by_name = {c.name: c for c in concepts}

    unknown = [name for name in sorted(dep_names) if name not in concept_by_name]
    if unknown:
        return FormulaPreviewOut(
            value=None, dependencies=[], error=f"Unknown concept: {unknown[0]}"
        )

    fx_result = await session.execute(
        select(FxRate.quote_code, FxRate.rate, FxRate.as_of)
        .where(FxRate.base_code == settings.fx_base_currency)
        .order_by(FxRate.as_of.desc())
    )
    fx_rates: dict[str, float] = {}
    for row in fx_result.all():
        if row.quote_code not in fx_rates:
            fx_rates[row.quote_code] = row.rate

    preview_id = uuid.uuid4()
    fake_concept = SimpleNamespace(
        id=preview_id,
        name="__preview__",
        kind=ConceptKind.formula,
        expression=body.expression,
        literal_value=None,
        currency_code=None,
        aggregate_op=None,
    )

    try:
        value = evaluate_concept_by_id(
            preview_id,
            list(concepts) + [fake_concept],
            fx_rates=fx_rates,
            base_currency=settings.fx_base_currency,
        )
    except (FormulaSyntaxError, FormulaEvaluationError) as exc:
        return FormulaPreviewOut(value=None, dependencies=[], error=str(exc))

    return FormulaPreviewOut(value=value, dependencies=sorted(dep_names), error=None)
