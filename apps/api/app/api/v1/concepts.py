import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept import Concept
from app.models.concept_dependency import ConceptDependency
from app.models.user import User
from app.schemas.concept import ConceptEvaluateResponse
from app.services.formula import (
    FormulaCycleError,
    FormulaEvaluationError,
    evaluate_concept_by_id,
    extract_dependency_graph,
)

router = APIRouter(prefix="/concepts", tags=["concepts"])


@router.get("")
async def list_concepts(current_user: User = Depends(current_active_user)) -> dict:
    """Placeholder – returns empty list until M2 formula engine is wired in."""
    return {"items": [], "user_id": str(current_user.id)}


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

    try:
        dependencies = extract_dependency_graph(concepts)
        value = evaluate_concept_by_id(concept_id, concepts)
    except FormulaCycleError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "formula_cycle", "message": str(exc)},
        ) from exc
    except FormulaEvaluationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
