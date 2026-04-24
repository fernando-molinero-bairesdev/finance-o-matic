import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.users import current_active_user
from app.core.db import get_async_session
from app.models.concept import Concept
from app.models.concept_dependency import ConceptDependency
from app.models.currency import Currency
from app.models.user import User
from app.schemas.concept import (
    ConceptCreate,
    ConceptEvaluateResponse,
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


@router.get("", response_model=ConceptListResponse)
async def list_concepts(
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptListResponse:
    result = await session.execute(
        select(Concept).where(Concept.user_id == current_user.id)
    )
    return ConceptListResponse(items=list(result.scalars().all()))


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
    kwargs = body.model_dump(exclude_none=True)
    concept = Concept(user_id=current_user.id, **kwargs)
    session.add(concept)
    try:
        await session.commit()
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
    await session.refresh(concept)
    return ConceptRead.model_validate(concept)


@router.get("/{concept_id}", response_model=ConceptRead)
async def get_concept(
    concept_id: uuid.UUID,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptRead:
    concept = await _get_owned_concept_or_404(session, concept_id, current_user.id)
    return ConceptRead.model_validate(concept)


@router.put("/{concept_id}", response_model=ConceptRead)
async def update_concept(
    concept_id: uuid.UUID,
    body: ConceptUpdate,
    current_user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
) -> ConceptRead:
    concept = await _get_owned_concept_or_404(session, concept_id, current_user.id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(concept, field, value)
    await session.commit()
    await session.refresh(concept)
    return ConceptRead.model_validate(concept)


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

    try:
        dependencies = extract_dependency_graph(concepts)
        value = evaluate_concept_by_id(concept_id, concepts)
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
