import pytest

from app.services.formula import FormulaEvaluationError, FormulaSyntaxError
from app.services.formula.engine import _evaluate_expression, parse_formula


# ── case() ────────────────────────────────────────────────────────────────────

class TestCaseFunction:
    def test_returns_first_matching_value(self) -> None:
        result = _evaluate_expression("case(1, 100, 0, 200, 999)", {})
        assert result == 100.0

    def test_returns_second_matching_value(self) -> None:
        result = _evaluate_expression("case(0, 100, 1, 200, 999)", {})
        assert result == 200.0

    def test_returns_default_when_no_condition_matches(self) -> None:
        result = _evaluate_expression("case(0, 100, 0, 200, 999)", {})
        assert result == 999.0

    def test_uses_concept_variable_in_condition(self) -> None:
        result = _evaluate_expression("case(x > 10, 1, x > 5, 2, 3)", {"x": 8.0})
        assert result == 2.0

    def test_uses_concept_variable_as_output(self) -> None:
        result = _evaluate_expression("case(1, salary, 0, bonus, 0)", {"salary": 5000.0, "bonus": 500.0})
        assert result == 5000.0

    def test_three_args_minimum(self) -> None:
        result = _evaluate_expression("case(1, 42, 0)", {})
        assert result == 42.0

    def test_three_args_default(self) -> None:
        result = _evaluate_expression("case(0, 42, 0)", {})
        assert result == 0.0

    def test_even_number_of_args_raises(self) -> None:
        with pytest.raises(FormulaEvaluationError, match="case\\(\\)"):
            _evaluate_expression("case(1, 2, 3, 4)", {})

    def test_fewer_than_three_args_raises(self) -> None:
        with pytest.raises(FormulaEvaluationError, match="case\\(\\)"):
            _evaluate_expression("case(1, 2)", {})

    def test_zero_args_raises(self) -> None:
        with pytest.raises(FormulaEvaluationError, match="case\\(\\)"):
            _evaluate_expression("case()", {})

    def test_validator_accepts_case_call(self) -> None:
        parse_formula("case(x > 0, x, 0)")

    def test_validator_rejects_if_missing_case_not_in_allowed(self) -> None:
        # case should be in allowed functions (this just confirms parse succeeds)
        tree = parse_formula("case(1, 1, 0)")
        assert tree is not None


# ── bracket() ─────────────────────────────────────────────────────────────────

class TestBracketFunction:
    def test_first_range_match(self) -> None:
        result = _evaluate_expression("bracket(5, 0, 10, 0.1, 10, 20, 0.2, 0.3)", {})
        assert result == pytest.approx(0.1)

    def test_second_range_match(self) -> None:
        result = _evaluate_expression("bracket(15, 0, 10, 0.1, 10, 20, 0.2, 0.3)", {})
        assert result == pytest.approx(0.2)

    def test_default_when_no_range_matches(self) -> None:
        result = _evaluate_expression("bracket(25, 0, 10, 0.1, 10, 20, 0.2, 0.3)", {})
        assert result == pytest.approx(0.3)

    def test_lower_bound_inclusive(self) -> None:
        result = _evaluate_expression("bracket(0, 0, 10, 0.1, 10, 20, 0.2, 0.3)", {})
        assert result == pytest.approx(0.1)

    def test_upper_bound_exclusive(self) -> None:
        # value == hi of first range → falls to second range
        result = _evaluate_expression("bracket(10, 0, 10, 0.1, 10, 20, 0.2, 0.3)", {})
        assert result == pytest.approx(0.2)

    def test_negative_value(self) -> None:
        result = _evaluate_expression("bracket(-5, -10, 0, 1.0, 0, 10, 2.0, 3.0)", {})
        assert result == pytest.approx(1.0)

    def test_uses_variable_as_value(self) -> None:
        result = _evaluate_expression("bracket(income, 0, 50000, 0.2, 50000, 100000, 0.3, 0.4)", {"income": 75000.0})
        assert result == pytest.approx(0.3)

    def test_single_triplet_minimum(self) -> None:
        result = _evaluate_expression("bracket(5, 0, 10, 99, 0)", {})
        assert result == pytest.approx(99.0)

    def test_single_triplet_default(self) -> None:
        result = _evaluate_expression("bracket(15, 0, 10, 99, 0)", {})
        assert result == pytest.approx(0.0)

    def test_too_few_args_raises(self) -> None:
        # value + default = 2 args, no triplets
        with pytest.raises(FormulaEvaluationError, match="bracket\\(\\)"):
            _evaluate_expression("bracket(5, 0)", {})

    def test_wrong_triplet_count_raises(self) -> None:
        # value + 2 args (not a full triplet) + default = 4 args total
        with pytest.raises(FormulaEvaluationError, match="bracket\\(\\)"):
            _evaluate_expression("bracket(5, 0, 10, 0)", {})

    def test_validator_accepts_bracket_call(self) -> None:
        parse_formula("bracket(x, 0, 10, 0.1, 10, 20, 0.2, 0.3)")

    def test_string_literal_rejected_by_validator(self) -> None:
        with pytest.raises(FormulaSyntaxError):
            parse_formula("bracket('hello', 0, 10, 1, 0)")
