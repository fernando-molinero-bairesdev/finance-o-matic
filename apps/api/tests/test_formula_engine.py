import uuid

import pytest

from app.models.concept import Concept, ConceptKind
from app.services.formula import (
    FormulaCycleError,
    FormulaEvaluationError,
    FormulaSyntaxError,
    detect_cycles,
    evaluate_concept_by_id,
    extract_dependency_graph,
    extract_reference_names,
)


def _concept(
    *,
    user_id: uuid.UUID,
    name: str,
    kind: ConceptKind,
    literal_value: float | None = None,
    expression: str | None = None,
) -> Concept:
    return Concept(
        id=uuid.uuid4(),
        user_id=user_id,
        name=name,
        kind=kind,
        currency_code="USD",
        literal_value=literal_value,
        expression=expression,
    )


def test_extract_reference_names() -> None:
    refs = extract_reference_names("sum(income, max(expenses, reserves)) - if(tax > 0, tax, 0)")
    assert refs == {"income", "expenses", "reserves", "tax"}


def test_formula_rejects_disallowed_syntax() -> None:
    with pytest.raises(FormulaSyntaxError):
        extract_reference_names("__import__('os').system('echo x')")


def test_dependency_graph_raises_on_unknown_reference() -> None:
    user_id = uuid.uuid4()
    broken = _concept(
        user_id=user_id,
        name="broken_formula",
        kind=ConceptKind.formula,
        expression="missing_concept + 1",
    )

    with pytest.raises(FormulaEvaluationError):
        extract_dependency_graph([broken])


def test_detect_cycles_raises_for_cyclic_graph() -> None:
    a = uuid.uuid4()
    b = uuid.uuid4()
    with pytest.raises(FormulaCycleError):
        detect_cycles({a: {b}, b: {a}})


def test_evaluate_concept_supports_nested_formulas() -> None:
    user_id = uuid.uuid4()
    income = _concept(user_id=user_id, name="income", kind=ConceptKind.value, literal_value=5000.0)
    expenses = _concept(user_id=user_id, name="expenses", kind=ConceptKind.value, literal_value=3200.0)
    reserves = _concept(user_id=user_id, name="reserves", kind=ConceptKind.value, literal_value=400.0)
    tax = _concept(
        user_id=user_id,
        name="tax",
        kind=ConceptKind.formula,
        expression="if(income > 4500, 500, 0)",
    )
    net = _concept(
        user_id=user_id,
        name="net",
        kind=ConceptKind.formula,
        expression="max(income - expenses - tax, reserves)",
    )

    result = evaluate_concept_by_id(net.id, [income, expenses, reserves, tax, net])
    assert result == pytest.approx(1300.0)


def test_evaluate_concept_detects_cycle() -> None:
    user_id = uuid.uuid4()
    a = _concept(user_id=user_id, name="a", kind=ConceptKind.formula, expression="b + 1")
    b = _concept(user_id=user_id, name="b", kind=ConceptKind.formula, expression="a + 1")

    with pytest.raises(FormulaCycleError):
        evaluate_concept_by_id(a.id, [a, b])

