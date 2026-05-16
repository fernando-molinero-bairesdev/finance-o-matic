# formula-spec

Shared grammar notes and examples for formula syntax.

---

## Operators

Standard arithmetic: `+`, `-`, `*`, `/`, `%`, `**`, `//`
Comparison: `==`, `!=`, `<`, `<=`, `>`, `>=`
Boolean: `and`, `or`, `not`

---

## Built-in functions

### `sum(a, b, ...)`
Sum of one or more values.

### `min(a, b, ...)`
Minimum of one or more values.

### `max(a, b, ...)`
Maximum of one or more values.

### `if_(condition, when_true, when_false)`
Conditional expression. Alias: `if(condition, when_true, when_false)`.

### `case(cond1, val1, cond2, val2, ..., default)`
Multi-branch switch. Evaluates condition/value pairs in order and returns the value
of the first truthy condition. Returns `default` if no condition matches.
Requires an odd number of arguments ≥ 3.

```
case(x > 100, 1.5, x > 50, 1.2, 1.0)
```

### `bracket(value, lo1, hi1, out1, lo2, hi2, out2, ..., default)`
Range/bracket lookup. Returns `outN` when `loN <= value < hiN`.
Returns `default` if no range matches. Upper bound is exclusive.
Requires at least 5 arguments (1 value + 1 triplet + 1 default).

```
bracket(income, 0, 50000, 0.20, 50000, 100000, 0.30, 0.40)
```

---

## Entity property variables (`prop_*`)

When a formula concept is bound to an entity type, each entity's decimal property values
are available as `prop_{property_name}` variables at evaluation time.

```
balance * prop_interest_rate
principal * prop_rate + prop_fixed_fee
```

Property names must be defined on the entity type and have `value_type = "decimal"`.
`prop_*` identifiers are NOT treated as concept references — they are resolved from
the entity's stored property values.

---

## Historical aggregate functions

Query and aggregate values from past complete snapshots.

### Signature
```
hist_sum(concept_name, period, unit)
hist_min(concept_name, period, unit)
hist_max(concept_name, period, unit)
hist_count(concept_name, period, unit)
```

With optional process filter:
```
hist_sum(concept_name, period, unit, process1, process2, ...)
```

### Parameters
| Parameter | Type | Description |
|---|---|---|
| `concept_name` | string literal | Name of the concept to aggregate |
| `period` | numeric literal | Number of time units to look back |
| `unit` | string literal | `"day"`, `"week"`, `"month"`, or `"year"` |
| `process1, ...` | string literals | Optional process names to filter by |

### Semantics
- Looks back `period` units from the snapshot date (cutoff: `date - period * unit`)
- Only includes **complete** snapshots whose date is `>= cutoff` and `< snapshot_date`
- Only includes global (non-entity-bound) entries for the concept
- When process names are provided, only snapshots triggered by those processes are included

### Return values
| Function | Empty result | Non-empty result |
|---|---|---|
| `hist_sum` | `0.0` | sum of all matching values |
| `hist_min` | `0.0` | minimum matching value |
| `hist_max` | `0.0` | maximum matching value |
| `hist_count` | `0.0` | count of matching entries |

### Examples
```
# Sum of savings over last 3 months
hist_sum('savings', 3, 'month')

# Average monthly income over the past year (sum / count)
hist_sum('income', 12, 'month') / hist_count('income', 12, 'month')

# Maximum expense in last 6 months from monthly process snapshots
hist_max('expenses', 6, 'month', 'monthly')

# Count of quarterly snapshots in last 2 years
hist_count('net_worth', 2, 'year', 'quarterly')
```

### Preview endpoint
The `POST /api/v1/formulas/preview` endpoint accepts optional `entity_id` (for `prop_*` vars)
and `as_of_date` (for historical resolution; defaults to today).
