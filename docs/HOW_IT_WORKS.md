# How finance-o-matic Works

finance-o-matic is a personal finance graph modelling tool. You define financial quantities — a salary, a list of bank accounts, a loan balance, a net-worth figure — as named **concepts**, wire them together with formulas and group aggregations, and then take periodic **snapshots** to measure your actual numbers through that model. Every snapshot freezes a point-in-time set of values that can be compared across time, charted, and replayed.

Two mechanisms drive everything:

- **The concept DAG** — your financial model, defined once and reused across every snapshot. Concepts reference each other, forming a directed acyclic graph (DAG).
- **The snapshot lifecycle** — a three-stage run (open → processed → complete) that fills the DAG with real numbers and evaluates every formula.

This document walks through both from scratch.

---

## Table of Contents

1. [Core Concepts: Building Your Financial Model](#1-core-concepts-building-your-financial-model)
2. [Snapshot Lifecycle](#2-snapshot-lifecycle)
3. [Formula Evaluation](#3-formula-evaluation)
4. [End-to-End Flow](#4-end-to-end-flow)
5. [Quick Example: Income, Expenses, Net Worth](#5-quick-example-income-expenses-net-worth)
6. [Reference](#6-reference)

---

## 1. Core Concepts: Building Your Financial Model

### 1.1 What Is a Concept?

A `Concept` is a named node in the DAG. Every concept has:

| Field | Description |
|---|---|
| `name` | Unique per user; used as the variable name in formulas |
| `kind` | One of four types — see below |
| `currency_code` | e.g. `USD`, `EUR`; used for FX conversion |
| `carry_behaviour` | Controls how values move between snapshots — see §2.2 |

Concepts are scoped to a single user. Two users can have a concept called `salary` without conflict.

---

### 1.2 The Four Concept Kinds

| Kind | What it represents | How its value is determined |
|---|---|---|
| `value` | A user-supplied number (bank balance, rent, etc.) | Entered manually per snapshot, or carried forward from the prior one |
| `formula` | An expression that references other concepts | Computed by the formula engine at process time |
| `group` | An aggregate of child concepts | Sum, average, min, or max of its members, evaluated recursively |
| `aux` | An auxiliary/helper quantity | Evaluated exactly like `formula`; the distinction is semantic — aux concepts are supporting values rather than top-level reported figures |

**value** concepts optionally store a `literal_value` on the model itself, but this is always overridden by the per-snapshot entry value. Think of `literal_value` as a permanent default, not the live number.

**formula** and **aux** concepts store their expression in the `expression` field (e.g. `income - expenses`).

**group** concepts store no expression — they pull their value from their members via the `ConceptGroupMembership` junction table, using `aggregate_op` (`sum`, `avg`, `min`, or `max`).

---

### 1.3 Default Carry Behaviours

Each kind has a sensible default that can be overridden per concept:

| Kind | Default carry behaviour |
|---|---|
| `value` | `copy_or_manual` |
| `formula` | `auto` |
| `group` | `auto` |
| `aux` | `copy` |

These defaults come from `_CARRY_DEFAULTS` in `app/models/concept.py` and are applied automatically if `carry_behaviour` is not explicitly set when a concept is created.

The three carry behaviours are explained in detail in §2.2.

---

### 1.4 Groups and Membership

A `group` concept aggregates child concepts via the `ConceptGroupMembership` junction table (`concept_id`, `group_id`). Membership is **many-to-many**: one concept can belong to multiple groups, and a group can have arbitrarily many members.

When a group is evaluated:
1. Each child concept is evaluated recursively.
2. Each child value is currency-converted to the group's `currency_code` (if different).
3. The values are reduced using `aggregate_op`: `sum`, `avg`, `min`, or `max`.

The `group_members` dict (`dict[UUID, list[Concept]]`) is built by the snapshot service at process time from the junction table rows and passed into the formula engine.

---

### 1.5 Per-Entity Concepts

A concept can be bound to an `EntityType` (e.g. Account, Loan, Asset) by setting `entity_type_id`. This enables tracking one value *per instance* of that entity type.

**How it works:**
- When a snapshot is taken, one `ConceptEntry` is created **per entity** of the bound type, each with its own `entity_id`.
- When a per-entity concept is referenced in a formula or group, all its entity-scoped entry values are **summed** before being passed to the evaluator — so formulas always see a single scalar.

**Example:** `account_balance` is bound to the `Account` entity type. You have three accounts: Savings, Checking, Brokerage. Each snapshot creates three entries for `account_balance`. In the formula `total_assets = account_balance + investments`, the engine sees `account_balance = sum(savings_value, checking_value, brokerage_value)`.

---

### 1.6 The Concept DAG

Below is an example DAG for a simple income / expenses / net-worth model. Arrows point from a concept to the concepts it **depends on** (i.e. reads values from).

```
  [value]  salary ──────────────────────┐
  [value]  freelance ───────────────────┤
                                        ▼
                               [group]  income   (aggregate_op: sum)
                                        │
                                        │ referenced by formula
                                        ▼
                               [formula] net_worth   expression: income - expenses
                                        ▲
                                        │ referenced by formula
                               [group]  expenses  (aggregate_op: sum)
                                        ▲
  [value]  rent ───────────────────────┤
  [value]  groceries ──────────────────┘
```

The formula engine evaluates from the leaves upward (depth-first). `net_worth` cannot be computed until both `income` and `expenses` are resolved, and those in turn wait on their member `value` concepts.

---

## 2. Snapshot Lifecycle

### 2.1 What Is a Snapshot?

A snapshot is a point-in-time measurement run. It has:

| Field | Description |
|---|---|
| `date` | The date the snapshot represents |
| `label` | Optional human-readable name (e.g. "May 2026") |
| `trigger` | `manual` or `scheduled` |
| `status` | `open`, `processed`, or `complete` (see §2.3) |

Each snapshot contains a `ConceptEntry` for every in-scope concept. The entries are the actual numbers — the concepts are only the schema. A `ConceptEntry` records the `value`, the `currency_code`, which `carry_behaviour_used` was applied, and (after processing) the `formula_snapshot` — a frozen copy of the expression string at evaluation time.

---

### 2.2 The Three Carry Behaviours

Carry behaviour controls how a concept's value is initialised when a new snapshot is taken.

**`auto`** — The entry starts with `value = None` and is filled entirely by the formula engine during `process_snapshot()`. The user never touches these entries. All `formula` and `group` concepts default to this.

**`copy`** — The entry is silently pre-filled from the most recent **complete** snapshot's entry for the same `(concept_id, entity_id)` pair. No user action is needed. `aux` concepts default to this.

**`copy_or_manual`** — Identical to `copy` at snapshot-creation time (pre-fill from prior), but the value is treated as editable: the user can update it via `PATCH /snapshots/{id}/entries/{entry_id}` if the real-world value has changed. `value` concepts default to this.

---

### 2.3 Status Machine

```
             POST /api/v1/snapshots
                       │
                       ▼
                 ┌──────────┐
                 │   open   │  ◄── entries editable via PATCH
                 └──────────┘
                       │
       POST /api/v1/snapshots/{id}/process
                       │
                       ▼
               ┌────────────┐
          ┌───►│ processed  │◄──┐  (idempotent: can re-process)
          │    └────────────┘   │
          └────────────────────-┘
                       │
       POST /api/v1/snapshots/{id}/complete
                       │
                       ▼
                 ┌──────────┐
                 │ complete │  ◄── immutable; used as carry-forward source
                 └──────────┘
```

`complete` snapshots are the source of truth for all carry-forward logic. An `open` snapshot cannot be completed directly — it must pass through `processed` first.

---

### 2.4 `take_snapshot()` — What Happens on `POST /snapshots`

1. Load all in-scope `Concept` rows for the user (or a scoped subset if `concept_ids` is provided).
2. Load all `Entity` rows, grouped by `entity_type_id`.
3. Create the `Snapshot` row with `status = open`.
4. For each concept × entity combination, create a `ConceptEntry`:
   - If `carry_behaviour == auto`: `value = None` (the formula engine will fill this later).
   - If `carry_behaviour in (copy, copy_or_manual)`: call `_get_prior_entry()` — query the most recent `ConceptEntry` from a `complete` snapshot for this `(concept_id, entity_id)` pair and pre-fill `value` from it, if found.
5. The `formula_snapshot` field is `None` at this stage — it is set during processing.
6. Commit and return the snapshot with all entries.

The snapshot is now `open`. Manual-entry concepts have their prior values (or `None` on the first ever snapshot). Computed concepts are `None`, waiting for the formula engine.

---

### 2.5 `process_snapshot()` — What Happens on `POST /snapshots/{id}/process`

This is the core computation step.

1. **Guard:** snapshot must be `open` or `processed`. Re-processing is allowed and idempotent.
2. **Load concepts** — all user concepts (full scope) and all `ConceptGroupMembership` rows.
3. **Build `entry_value_map`** — a `dict[concept_id → float]` from all non-`auto` entries that have a non-null value.
   - For per-entity concepts: all entity-scoped values for the same `concept_id` are **summed** into a single scalar.
   - For in-scope value concepts with no current entry (e.g. a concept added to the model after this snapshot was created), the most recent complete entry is fetched as a fallback.
4. **Freeze FX rates:**
   - If `SnapshotFxRate` rows already exist for this snapshot (re-process path), reload them.
   - Otherwise, fetch the current rates from the `FxRate` table and write `SnapshotFxRate` rows. This freezes the exchange rates at evaluation time so the snapshot is reproducible even when live rates change later.
5. **Patch concepts** — create temporary `Concept` objects with `literal_value` set to each entry's value from `entry_value_map`. This allows the formula engine to treat user-provided values as `value`-kind literals.
6. **Evaluate auto entries** — for each `ConceptEntry` with `carry_behaviour_used == auto`, call `evaluate_concept_by_id()`.
   - On success: store `entry.value` and set `entry.formula_snapshot = concept.expression`.
   - On `FormulaEvaluationError`: set `entry.value = None` (graceful degradation — one bad formula does not block the rest).
7. Transition `snapshot.status → processed`. Commit.

---

### 2.6 Completing a Snapshot — `POST /snapshots/{id}/complete`

- Allowed only from `processed` status.
- Sets `status = complete`. The snapshot is now immutable.
- `complete` snapshots become the baseline for carry-forward in all future snapshots — `_get_prior_entry()` only ever queries `complete` snapshots.

---

### 2.7 Carry-Forward Helper — `POST /snapshots/{id}/carry-forward`

An optional convenience endpoint. It iterates all non-`auto` entries in the snapshot that still have `value = None` and fills them from the most recent complete snapshot.

Useful when you want to bulk-pre-fill unchanged values before editing only the ones that actually changed this period.

---

## 3. Formula Evaluation

### 3.1 Syntax

Formulas are Python-style arithmetic expressions that reference other concepts **by their exact `name` string**. The name is used as a variable in the expression.

**Supported operators:**

| Category | Operators |
|---|---|
| Arithmetic | `+`, `-`, `*`, `/`, `%`, `**` (power), `//` (floor div) |
| Unary | `+x`, `-x`, `not x` |
| Boolean | `and`, `or` |
| Comparison | `==`, `!=`, `<`, `<=`, `>`, `>=` |

**Built-in functions:**

| Function | Description |
|---|---|
| `sum(a, b, ...)` | Sum all arguments |
| `min(a, b, ...)` | Minimum (≥1 argument required) |
| `max(a, b, ...)` | Maximum (≥1 argument required) |
| `if_(condition, when_true, when_false)` | Ternary — `if_(x > 0, x, 0)` |

The result must be numeric. Note: `if(` is automatically normalised to `if_(` to avoid the Python keyword.

**Examples:**

```
income - expenses
sum(rent, utilities, groceries)
salary * 0.8
if_(bonus > 0, salary + bonus, salary)
```

---

### 3.2 Sandboxing

The engine uses Python's `ast` module — no `eval()` on raw strings. `parse_formula()` compiles the expression into an AST, then `_FormulaValidator` walks every node and raises `FormulaSyntaxError` for anything not on the explicit whitelist (numeric/boolean literals, approved binary/unary operators, Name nodes for variable references, the four allowed function calls). Parsed expressions are cached with `@lru_cache(maxsize=512)`.

---

### 3.3 Evaluation Algorithm

**Entry point:** `evaluate_concept_by_id(concept_id, concepts, group_members, fx_rates, base_currency)`

1. Build `concepts_by_id` and `concepts_by_name` lookup dicts.
2. Call `extract_dependency_graph()` — parses every formula/aux expression in the concept set and returns a `dict[UUID, set[UUID]]` mapping each concept to its direct dependencies.
3. Call `detect_cycles()` — runs a depth-first search with grey/black colouring over the dependency graph. Raises `FormulaCycleError` (with the cycle path attached as `.cycle`) if a back-edge is found.
4. Enter the recursive `evaluate_node(concept_id)`:

```
evaluate_node(id):
  if id in memo → return memo[id]        # memoisation
  if id in visiting → FormulaCycleError  # belt-and-suspenders cycle guard

  visiting.add(id)
  concept = concepts_by_id[id]

  if kind == value:
    result = concept.literal_value

  if kind in (formula, aux):
    refs = extract_reference_names(concept.expression)
    variables = {}
    for name in refs:
      dep = concepts_by_name[name]
      val = evaluate_node(dep.id)
      variables[name] = convert_currency(val, dep.currency, concept.currency)
    result = evaluate_expression(concept.expression, variables)

  if kind == group:
    children = group_members[id]
    values = [convert_currency(evaluate_node(c.id), c.currency, concept.currency)
              for c in children]
    result = aggregate(values, concept.aggregate_op)  # sum/avg/min/max

  visiting.remove(id)
  memo[id] = result
  return result
```

Memoisation means each concept is evaluated at most once per snapshot process, regardless of how many formulas reference it.

---

### 3.4 Currency Conversion

Every concept has a `currency_code`. When a formula or group reads a child concept in a **different** currency, `_convert_currency()` is called:

```
converted = raw_value / from_rate * to_rate
```

where `from_rate` and `to_rate` are exchange rates relative to `base_currency` (e.g. `1 USD = rate EUR`), sourced from the frozen `SnapshotFxRate` rows.

If either rate is missing from the dict, the raw value is returned unchanged — a silent no-op that prevents crashes when a currency is not yet configured. The base currency always has an implicit rate of `1.0`.

FX rates are frozen into `SnapshotFxRate` at the moment `process_snapshot()` first runs. Re-processing the same snapshot uses the frozen rates, not the current live rates — preserving historical reproducibility.

---

## 4. End-to-End Flow

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ 1. DEFINE MODEL                                                 │
  │    POST /api/v1/concepts  (value, formula, group, aux)          │
  │    POST group memberships                                       │
  └────────────────────────────┬────────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────────┐
  │ 2. TAKE SNAPSHOT                                                │
  │    POST /api/v1/snapshots  →  status: open                      │
  │    ConceptEntry rows created; copy/copy_or_manual pre-filled    │
  └────────────────────────────┬────────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────────┐
  │ 3. FILL MANUAL VALUES                                           │
  │    PATCH /api/v1/snapshots/{id}/entries/{entry_id}              │
  │    (only copy_or_manual entries; auto entries are untouched)    │
  └────────────────────────────┬────────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────────┐
  │ 4. PROCESS                                                      │
  │    POST /api/v1/snapshots/{id}/process  →  status: processed    │
  │    Formula engine evaluates all auto entries                    │
  │    FX rates frozen in SnapshotFxRate                            │
  └────────────────────────────┬────────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────────┐
  │ 5. REVIEW                                                       │
  │    GET /api/v1/snapshots/{id}  — inspect computed values        │
  │    (optional: re-POST /process to recalculate after edits)      │
  └────────────────────────────┬────────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────────┐
  │ 6. COMPLETE                                                     │
  │    POST /api/v1/snapshots/{id}/complete  →  status: complete    │
  │    Snapshot locked; becomes carry-forward baseline              │
  └─────────────────────────────────────────────────────────────────┘
```

**Summary table:**

| Step | Endpoint | Result |
|---|---|---|
| Define model | `POST /api/v1/concepts` | Concept DAG stored in DB |
| Take snapshot | `POST /api/v1/snapshots` | `open` snapshot; `ConceptEntry` rows created |
| Fill values | `PATCH /api/v1/snapshots/{id}/entries/{entry_id}` | Manual entries updated |
| Process | `POST /api/v1/snapshots/{id}/process` | Formulas evaluated; FX frozen; → `processed` |
| Review | `GET /api/v1/snapshots/{id}` | Inspect computed values |
| Complete | `POST /api/v1/snapshots/{id}/complete` | Snapshot locked; → `complete` |

---

## 5. Quick Example: Income, Expenses, Net Worth

This section walks through a complete cycle using a minimal model.

### The Model

Seven concepts:

| Name | Kind | `carry_behaviour` | Notes |
|---|---|---|---|
| `salary` | `value` | `copy_or_manual` | Monthly take-home |
| `freelance` | `value` | `copy_or_manual` | Side income |
| `rent` | `value` | `copy_or_manual` | Monthly rent |
| `groceries` | `value` | `copy_or_manual` | Monthly grocery spend |
| `income` | `group` | `auto` | `aggregate_op: sum`; members: salary, freelance |
| `expenses` | `group` | `auto` | `aggregate_op: sum`; members: rent, groceries |
| `net_worth` | `formula` | `auto` | `expression: income - expenses` |

DAG:

```
  salary ──────────┐
  freelance ───────┼──► income (sum) ──────────────► net_worth = income - expenses
  rent ────────────┤                                        ▲
  groceries ───────┴──► expenses (sum) ────────────────────┘
```

---

### Step 1: Create the Concepts

```http
POST /api/v1/concepts
Content-Type: application/json

{ "name": "salary",     "kind": "value",   "currency_code": "USD" }
{ "name": "freelance",  "kind": "value",   "currency_code": "USD" }
{ "name": "rent",       "kind": "value",   "currency_code": "USD" }
{ "name": "groceries",  "kind": "value",   "currency_code": "USD" }
{ "name": "income",     "kind": "group",   "currency_code": "USD", "aggregate_op": "sum" }
{ "name": "expenses",   "kind": "group",   "currency_code": "USD", "aggregate_op": "sum" }
{ "name": "net_worth",  "kind": "formula", "currency_code": "USD", "expression": "income - expenses" }
```

Then add group memberships (via the concept update endpoint or the `ConceptGroupBoard` UI):
- `salary` and `freelance` → members of `income`
- `rent` and `groceries` → members of `expenses`

---

### Step 2: Take a Snapshot

```http
POST /api/v1/snapshots
Content-Type: application/json

{ "date": "2026-05-01", "label": "May 2026" }
```

The system creates 7 `ConceptEntry` rows. This is the first snapshot, so no prior exists — all `copy_or_manual` entries start as `null`.

| Concept | Initial value |
|---|---|
| `salary` | `null` |
| `freelance` | `null` |
| `rent` | `null` |
| `groceries` | `null` |
| `income` | `null` (auto — will be computed) |
| `expenses` | `null` (auto — will be computed) |
| `net_worth` | `null` (auto — will be computed) |

---

### Step 3: Fill Manual Values

```http
PATCH /api/v1/snapshots/{id}/entries/{salary_entry_id}
{ "value": 5000 }

PATCH /api/v1/snapshots/{id}/entries/{freelance_entry_id}
{ "value": 800 }

PATCH /api/v1/snapshots/{id}/entries/{rent_entry_id}
{ "value": 1500 }

PATCH /api/v1/snapshots/{id}/entries/{groceries_entry_id}
{ "value": 300 }
```

`income`, `expenses`, and `net_worth` are `auto` — leave them alone.

---

### Step 4: Process

```http
POST /api/v1/snapshots/{id}/process
```

The engine runs:

1. Builds `entry_value_map`: `{ salary: 5000, freelance: 800, rent: 1500, groceries: 300 }`.
2. Patches concept `literal_value`s so the formula engine sees them as value nodes.
3. Freezes FX rates into `SnapshotFxRate` (all USD here, so no conversion needed).
4. Evaluates `income` (group, sum):
   - children → `salary` = 5000, `freelance` = 800
   - `income = 5000 + 800 = 5800`
5. Evaluates `expenses` (group, sum):
   - children → `rent` = 1500, `groceries` = 300
   - `expenses = 1500 + 300 = 1800`
6. Evaluates `net_worth` (formula):
   - resolves `income` → 5800 (memoised), `expenses` → 1800 (memoised)
   - `net_worth = 5800 − 1800 = 4000`
7. Sets `formula_snapshot = "income - expenses"` on the `net_worth` entry.
8. Transitions snapshot to `processed`.

Final entries:

| Concept | Value |
|---|---|
| `salary` | 5000 |
| `freelance` | 800 |
| `rent` | 1500 |
| `groceries` | 300 |
| `income` | 5800 |
| `expenses` | 1800 |
| `net_worth` | 4000 |

---

### Step 5: Complete

```http
POST /api/v1/snapshots/{id}/complete
```

The snapshot is now `complete` and immutable.

---

### Step 6: Next Month (Carry-Forward in Action)

```http
POST /api/v1/snapshots
{ "date": "2026-06-01", "label": "June 2026" }
```

Because the prior snapshot is `complete`, all four `copy_or_manual` entries are pre-filled:

| Concept | Pre-filled value |
|---|---|
| `salary` | 5000 ← carried from May |
| `freelance` | 800 ← carried from May |
| `rent` | 1500 ← carried from May |
| `groceries` | 300 ← carried from May |
| `income` | `null` (auto — recomputed at process time) |
| `expenses` | `null` (auto) |
| `net_worth` | `null` (auto) |

You only need to update the values that actually changed — a significant time saving when most figures carry over month-to-month.

---

## 6. Reference

### Concept Kind × Carry Behaviour Defaults

| Kind | Default `carry_behaviour` |
|---|---|
| `value` | `copy_or_manual` |
| `formula` | `auto` |
| `group` | `auto` |
| `aux` | `copy` |

Source: `_CARRY_DEFAULTS` in `apps/api/app/models/concept.py`.

---

### Status Transition Rules

| From | To | Allowed? | How |
|---|---|---|---|
| `open` | `processed` | Yes | `POST /api/v1/snapshots/{id}/process` |
| `processed` | `processed` | Yes (idempotent) | `POST /api/v1/snapshots/{id}/process` |
| `processed` | `complete` | Yes | `POST /api/v1/snapshots/{id}/complete` |
| `open` | `complete` | No | — must process first |
| `complete` | any | No | Immutable |

---

### Formula Engine Exception Types

| Exception | When raised |
|---|---|
| `FormulaSyntaxError` | AST validation failed — disallowed operator, unknown function, non-numeric result |
| `FormulaEvaluationError` | Runtime error — `literal_value` is `None` for a value node, missing group members, unknown concept reference |
| `FormulaCycleError` | A cycle was detected in the dependency graph; the `.cycle` attribute contains the cycle path |

Source: `apps/api/app/services/formula/engine.py`.
