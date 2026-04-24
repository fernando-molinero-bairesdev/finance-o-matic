import ast
import re
import uuid
from collections.abc import Iterable
from functools import lru_cache

from app.models.concept import Concept, ConceptKind

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_IF_CALL_RE = re.compile(r"\bif\s*\(")


class FormulaEvaluationError(ValueError):
    pass


class FormulaSyntaxError(FormulaEvaluationError):
    pass


class FormulaCycleError(FormulaEvaluationError):
    def __init__(self, cycle: list[uuid.UUID]) -> None:
        self.cycle = cycle
        super().__init__(f"Cyclic dependency detected: {' -> '.join(str(item) for item in cycle)}")


def _fn_sum(*values: float) -> float:
    return float(sum(values))


def _fn_min(*values: float) -> float:
    if not values:
        raise FormulaEvaluationError("min() requires at least one argument")
    return float(min(values))


def _fn_max(*values: float) -> float:
    if not values:
        raise FormulaEvaluationError("max() requires at least one argument")
    return float(max(values))


def _fn_if(condition: bool, when_true: float, when_false: float) -> float:
    return when_true if condition else when_false


_ALLOWED_FUNCTIONS = {
    "sum": _fn_sum,
    "min": _fn_min,
    "max": _fn_max,
    "if_": _fn_if,
}

_ALLOWED_BINARY_OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow, ast.FloorDiv)
_ALLOWED_UNARY_OPS = (ast.UAdd, ast.USub, ast.Not)
_ALLOWED_BOOL_OPS = (ast.And, ast.Or)
_ALLOWED_CMP_OPS = (ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE)
_ALLOWED_NODE_TYPES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.Call,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.IfExp,
)


def _normalize_expression(expression: str) -> str:
    return _IF_CALL_RE.sub("if_(", expression.strip())


class _FormulaValidator(ast.NodeVisitor):
    def generic_visit(self, node: ast.AST) -> None:
        if not isinstance(node, _ALLOWED_NODE_TYPES):
            raise FormulaSyntaxError(f"Unsupported syntax node: {type(node).__name__}")
        super().generic_visit(node)

    def visit_BinOp(self, node: ast.BinOp) -> None:
        if not isinstance(node.op, _ALLOWED_BINARY_OPS):
            raise FormulaSyntaxError(f"Operator not allowed: {type(node.op).__name__}")
        self.visit(node.left)
        self.visit(node.right)

    def visit_UnaryOp(self, node: ast.UnaryOp) -> None:
        if not isinstance(node.op, _ALLOWED_UNARY_OPS):
            raise FormulaSyntaxError(f"Unary operator not allowed: {type(node.op).__name__}")
        self.visit(node.operand)

    def visit_BoolOp(self, node: ast.BoolOp) -> None:
        if not isinstance(node.op, _ALLOWED_BOOL_OPS):
            raise FormulaSyntaxError(f"Boolean operator not allowed: {type(node.op).__name__}")
        for value in node.values:
            self.visit(value)

    def visit_Compare(self, node: ast.Compare) -> None:
        for op in node.ops:
            if not isinstance(op, _ALLOWED_CMP_OPS):
                raise FormulaSyntaxError(f"Comparison operator not allowed: {type(op).__name__}")
        self.visit(node.left)
        for comparator in node.comparators:
            self.visit(comparator)

    def visit_Call(self, node: ast.Call) -> None:
        if not isinstance(node.func, ast.Name):
            raise FormulaSyntaxError("Only direct function calls are allowed")
        if node.func.id not in _ALLOWED_FUNCTIONS:
            raise FormulaSyntaxError(f"Function not allowed: {node.func.id}")
        if node.keywords:
            raise FormulaSyntaxError("Keyword arguments are not allowed")
        if node.func.id == "if_" and len(node.args) != 3:
            raise FormulaSyntaxError("if() requires exactly three arguments")
        for arg in node.args:
            self.visit(arg)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in _ALLOWED_FUNCTIONS:
            return
        if not _IDENTIFIER_RE.match(node.id):
            raise FormulaSyntaxError(f"Invalid identifier: {node.id}")

    def visit_Constant(self, node: ast.Constant) -> None:
        if not isinstance(node.value, (int, float, bool)):
            raise FormulaSyntaxError("Only numeric and boolean literals are allowed")


@lru_cache(maxsize=512)
def parse_formula(expression: str) -> ast.Expression:
    normalized = _normalize_expression(expression)
    try:
        parsed = ast.parse(normalized, mode="eval")
    except SyntaxError as exc:
        raise FormulaSyntaxError(f"Invalid formula syntax: {exc.msg}") from exc
    _FormulaValidator().visit(parsed)
    return parsed


class _ReferenceExtractor(ast.NodeVisitor):
    def __init__(self) -> None:
        self.references: set[str] = set()

    def visit_Call(self, node: ast.Call) -> None:
        for arg in node.args:
            self.visit(arg)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in _ALLOWED_FUNCTIONS:
            return
        self.references.add(node.id)


def extract_reference_names(expression: str) -> set[str]:
    parsed = parse_formula(expression)
    extractor = _ReferenceExtractor()
    extractor.visit(parsed)
    return extractor.references


def _to_float(value: object) -> float:
    if isinstance(value, bool):
        raise FormulaEvaluationError("Formula result must be numeric, not boolean")
    if not isinstance(value, (int, float)):
        raise FormulaEvaluationError("Formula result must be numeric")
    return float(value)


def _evaluate_expression(expression: str, variables: dict[str, float]) -> float:
    parsed = parse_formula(expression)
    compiled = compile(parsed, "<formula>", "eval")
    context: dict[str, object] = dict(_ALLOWED_FUNCTIONS)
    context.update(variables)
    try:
        value = eval(compiled, {"__builtins__": {}}, context)  # noqa: S307
    except FormulaEvaluationError:
        raise
    except Exception as exc:
        raise FormulaEvaluationError(f"Error while evaluating formula: {exc}") from exc
    return _to_float(value)


def extract_dependency_graph(concepts: Iterable[Concept]) -> dict[uuid.UUID, set[uuid.UUID]]:
    concept_by_name = {concept.name: concept for concept in concepts}
    dependencies: dict[uuid.UUID, set[uuid.UUID]] = {}

    for concept in concept_by_name.values():
        if concept.kind not in (ConceptKind.formula, ConceptKind.aux):
            dependencies[concept.id] = set()
            continue
        if not concept.expression:
            raise FormulaEvaluationError(f"Concept '{concept.name}' has no expression")
        ref_names = extract_reference_names(concept.expression)
        ref_ids: set[uuid.UUID] = set()
        for ref_name in ref_names:
            dependency = concept_by_name.get(ref_name)
            if dependency is None:
                raise FormulaEvaluationError(
                    f"Unknown concept reference '{ref_name}' in '{concept.name}'"
                )
            ref_ids.add(dependency.id)
        dependencies[concept.id] = ref_ids

    return dependencies


def detect_cycles(dependencies: dict[uuid.UUID, set[uuid.UUID]]) -> None:
    state: dict[uuid.UUID, int] = {}
    stack: list[uuid.UUID] = []

    def visit(node: uuid.UUID) -> None:
        node_state = state.get(node, 0)
        if node_state == 1:
            if node in stack:
                start_idx = stack.index(node)
                raise FormulaCycleError(stack[start_idx:] + [node])
            raise FormulaCycleError([node, node])
        if node_state == 2:
            return

        state[node] = 1
        stack.append(node)
        for dep in dependencies.get(node, set()):
            visit(dep)
        stack.pop()
        state[node] = 2

    for current in dependencies:
        visit(current)


def evaluate_concept_by_id(concept_id: uuid.UUID, concepts: Iterable[Concept]) -> float:
    concept_list = list(concepts)
    concepts_by_id = {concept.id: concept for concept in concept_list}
    concepts_by_name = {concept.name: concept for concept in concept_list}
    dependencies = extract_dependency_graph(concept_list)
    detect_cycles(dependencies)

    memo: dict[uuid.UUID, float] = {}
    visiting: list[uuid.UUID] = []

    def evaluate_node(node_id: uuid.UUID) -> float:
        if node_id in memo:
            return memo[node_id]
        if node_id in visiting:
            start_idx = visiting.index(node_id)
            raise FormulaCycleError(visiting[start_idx:] + [node_id])

        concept = concepts_by_id.get(node_id)
        if concept is None:
            raise FormulaEvaluationError(f"Unknown concept id '{node_id}'")

        visiting.append(node_id)
        try:
            if concept.kind == ConceptKind.value:
                if concept.literal_value is None:
                    raise FormulaEvaluationError(f"Concept '{concept.name}' has no literal value")
                result = float(concept.literal_value)
            elif concept.kind in (ConceptKind.formula, ConceptKind.aux):
                if not concept.expression:
                    raise FormulaEvaluationError(f"Concept '{concept.name}' has no expression")
                variables: dict[str, float] = {}
                for ref_name in extract_reference_names(concept.expression):
                    ref_concept = concepts_by_name.get(ref_name)
                    if ref_concept is None:
                        raise FormulaEvaluationError(
                            f"Unknown concept reference '{ref_name}' in '{concept.name}'"
                        )
                    variables[ref_name] = evaluate_node(ref_concept.id)
                result = _evaluate_expression(concept.expression, variables)
            elif concept.kind == ConceptKind.group:
                children = [c for c in concept_list if c.parent_group_id == node_id]
                if not children:
                    raise FormulaEvaluationError(f"Group '{concept.name}' has no children to aggregate")
                op = concept.aggregate_op
                if op is None:
                    raise FormulaEvaluationError(f"Group '{concept.name}' has no aggregate_op set")
                child_values = [evaluate_node(child.id) for child in children]
                if op == "sum":
                    result = float(sum(child_values))
                elif op == "avg":
                    result = float(sum(child_values) / len(child_values))
                elif op == "min":
                    result = float(min(child_values))
                elif op == "max":
                    result = float(max(child_values))
                else:
                    raise FormulaEvaluationError(
                        f"Group '{concept.name}': unknown aggregate op '{op}'"
                    )
            else:
                raise FormulaEvaluationError(
                    f"Concept kind '{concept.kind.value}' is not evaluable yet"
                )
        finally:
            visiting.pop()

        memo[node_id] = result
        return result

    return evaluate_node(concept_id)
