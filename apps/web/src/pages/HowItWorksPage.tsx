export default function HowItWorksPage() {
  return (
    <div className="space-y-10 text-sm text-[var(--text)]">
      {/* Intro */}
      <section>
        <h1 className="text-xl font-semibold text-[var(--text-h)] mb-3">How finance-o-matic Works</h1>
        <p className="leading-relaxed mb-3">
          finance-o-matic is a personal finance graph modelling tool. You define financial
          quantities — a salary, a list of bank accounts, a loan balance, a net-worth figure —
          as named <strong>concepts</strong>, wire them together with formulas and group
          aggregations, and then take periodic <strong>snapshots</strong> to measure your actual
          numbers through that model. Every snapshot freezes a point-in-time set of values that
          can be compared across time, charted, and replayed.
        </p>
        <p className="leading-relaxed">Two mechanisms drive everything:</p>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li><strong>The concept DAG</strong> — your financial model, defined once and reused across every snapshot.</li>
          <li><strong>The snapshot lifecycle</strong> — a three-stage run (open → processed → complete) that fills the DAG with real numbers and evaluates every formula.</li>
        </ul>
      </section>

      <Divider />

      {/* Section 1 */}
      <section>
        <H2>1. Core Concepts: Building Your Financial Model</H2>

        <H3>1.1 What Is a Concept?</H3>
        <p className="leading-relaxed mb-3">A concept is a named node in the DAG. Every concept has:</p>
        <Table
          headers={['Field', 'Description']}
          rows={[
            ['name', 'Unique per user; used as the variable name in formulas'],
            ['kind', 'One of four types — see below'],
            ['currency_code', 'e.g. USD, EUR; used for FX conversion'],
            ['carry_behaviour', 'Controls how values move between snapshots — see §2.2'],
          ]}
        />

        <H3>1.2 The Four Concept Kinds</H3>
        <Table
          headers={['Kind', 'What it represents', 'How its value is determined']}
          rows={[
            ['value', 'A user-supplied number (bank balance, rent, etc.)', 'Entered manually per snapshot, or carried forward from the prior one'],
            ['formula', 'An expression that references other concepts', 'Computed by the formula engine at process time'],
            ['group', 'An aggregate of child concepts', 'Sum, average, min, or max of its members, evaluated recursively'],
            ['aux', 'An auxiliary/helper quantity', 'Evaluated exactly like formula; used for supporting values rather than top-level reported figures'],
          ]}
        />
        <div className="mt-3 space-y-2 leading-relaxed">
          <p><Code>value</Code> concepts optionally store a <Code>literal_value</Code> on the model, but this is always overridden by the per-snapshot entry value.</p>
          <p><Code>formula</Code> and <Code>aux</Code> concepts store their expression in the <Code>expression</Code> field (e.g. <Code>income - expenses</Code>).</p>
          <p><Code>group</Code> concepts store no expression — they pull their value from their members via the <Code>ConceptGroupMembership</Code> junction table, using <Code>aggregate_op</Code> (<Code>sum</Code>, <Code>avg</Code>, <Code>min</Code>, or <Code>max</Code>).</p>
        </div>

        <H3>1.3 Default Carry Behaviours</H3>
        <Table
          headers={['Kind', 'Default carry_behaviour']}
          rows={[
            ['value', 'copy_or_manual'],
            ['formula', 'auto'],
            ['group', 'auto'],
            ['aux', 'copy'],
          ]}
        />
        <p className="mt-2 leading-relaxed text-xs text-[var(--text)]">
          These defaults are applied automatically if <Code>carry_behaviour</Code> is not explicitly set when a concept is created.
        </p>

        <H3>1.4 Groups and Membership</H3>
        <p className="leading-relaxed">
          A <Code>group</Code> concept aggregates child concepts via the <Code>ConceptGroupMembership</Code> junction table.
          Membership is <strong>many-to-many</strong>: one concept can belong to multiple groups, and a group can have
          arbitrarily many members. When a group is evaluated, each child value is currency-converted to the group's
          currency, then reduced using <Code>aggregate_op</Code>.
        </p>

        <H3>1.5 Per-Entity Concepts</H3>
        <p className="leading-relaxed mb-2">
          A concept can be bound to an <Code>EntityType</Code> (e.g. Account, Loan, Asset) by setting <Code>entity_type_id</Code>.
          When a snapshot is taken, one <Code>ConceptEntry</Code> is created <strong>per entity</strong> of the bound type.
          When a per-entity concept is referenced in a formula or group, all its entity-scoped entry values are <strong>summed</strong> before
          being passed to the evaluator — so formulas always see a single scalar.
        </p>
        <p className="leading-relaxed text-xs">
          Example: <Code>account_balance</Code> bound to the <Code>Account</Code> type. Three accounts → three entries.
          In <Code>total_assets = account_balance + investments</Code>, the engine sees <Code>account_balance = sum(savings, checking, brokerage)</Code>.
        </p>

        <H3>1.6 The Concept DAG</H3>
        <p className="leading-relaxed mb-2">
          Below is an example DAG for a simple income / expenses / net-worth model.
          Arrows point from a concept to the concepts it <em>depends on</em>.
        </p>
        <Pre>{`  [value]  salary ──────────────────────┐
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
  [value]  groceries ──────────────────┘`}</Pre>
        <p className="mt-2 text-xs leading-relaxed">
          The formula engine evaluates from the leaves upward (depth-first). <Code>net_worth</Code> cannot be computed
          until both <Code>income</Code> and <Code>expenses</Code> are resolved.
        </p>
      </section>

      <Divider />

      {/* Section 2 */}
      <section>
        <H2>2. Snapshot Lifecycle</H2>

        <H3>2.1 What Is a Snapshot?</H3>
        <p className="leading-relaxed mb-3">A snapshot is a point-in-time measurement run. It has:</p>
        <Table
          headers={['Field', 'Description']}
          rows={[
            ['date', 'The date the snapshot represents'],
            ['label', 'Optional human-readable name (e.g. "May 2026")'],
            ['trigger', 'manual or scheduled'],
            ['status', 'open, processed, or complete'],
          ]}
        />
        <p className="mt-3 leading-relaxed">
          Each snapshot contains a <Code>ConceptEntry</Code> for every in-scope concept. The entries are the actual numbers —
          the concepts are only the schema. A <Code>ConceptEntry</Code> records the <Code>value</Code>, the <Code>currency_code</Code>,
          which <Code>carry_behaviour_used</Code> was applied, and (after processing) the <Code>formula_snapshot</Code> — a frozen
          copy of the expression string at evaluation time.
        </p>

        <H3>2.2 The Three Carry Behaviours</H3>
        <div className="space-y-3 leading-relaxed">
          <p>
            <strong className="text-[var(--text-h)]">auto</strong> — The entry starts with <Code>value = null</Code> and
            is filled entirely by the formula engine during processing. The user never touches these entries.
            All <Code>formula</Code> and <Code>group</Code> concepts default to this.
          </p>
          <p>
            <strong className="text-[var(--text-h)]">copy</strong> — The entry is silently pre-filled from the most
            recent <strong>complete</strong> snapshot's entry for the same <Code>(concept_id, entity_id)</Code> pair.
            No user action is needed. <Code>aux</Code> concepts default to this.
          </p>
          <p>
            <strong className="text-[var(--text-h)]">copy_or_manual</strong> — Identical to <Code>copy</Code> at
            snapshot-creation time (pre-fill from prior), but the value is treated as editable: the user can update
            it if the real-world value has changed. <Code>value</Code> concepts default to this.
          </p>
        </div>

        <H3>2.3 Status Machine</H3>
        <Pre>{`             POST /api/v1/snapshots
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
          └─────────────────────┘
                       │
       POST /api/v1/snapshots/{id}/complete
                       │
                       ▼
                 ┌──────────┐
                 │ complete │  ◄── immutable; used as carry-forward source
                 └──────────┘`}</Pre>
        <p className="mt-2 text-xs leading-relaxed">
          An <Code>open</Code> snapshot cannot be completed directly — it must pass through <Code>processed</Code> first.
          <Code>complete</Code> snapshots are the source of truth for all carry-forward logic.
        </p>

        <H3>2.4 take_snapshot() — What Happens on POST /snapshots</H3>
        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
          <li>Load all in-scope <Code>Concept</Code> rows for the user.</li>
          <li>Load all <Code>Entity</Code> rows, grouped by <Code>entity_type_id</Code>.</li>
          <li>Create the <Code>Snapshot</Code> row with <Code>status = open</Code>.</li>
          <li>For each concept × entity combination, create a <Code>ConceptEntry</Code>:
            <ul className="list-disc list-inside ml-4 mt-1 space-y-1">
              <li>If <Code>carry_behaviour == auto</Code>: <Code>value = null</Code> (computed later).</li>
              <li>If <Code>carry_behaviour in (copy, copy_or_manual)</Code>: pre-fill from the most recent <Code>complete</Code> snapshot entry.</li>
            </ul>
          </li>
          <li><Code>formula_snapshot</Code> is <Code>null</Code> at this stage — set during processing.</li>
        </ol>

        <H3>2.5 process_snapshot() — What Happens on POST /snapshots/{'{id}'}/process</H3>
        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
          <li>Guard: snapshot must be <Code>open</Code> or <Code>processed</Code>. Re-processing is idempotent.</li>
          <li>Load all user concepts and all <Code>ConceptGroupMembership</Code> rows.</li>
          <li>Build <Code>entry_value_map</Code> — for non-<Code>auto</Code> entries with a value; per-entity values are summed by <Code>concept_id</Code>.</li>
          <li>Fall back to the most recent complete entry for any in-scope concept with no current value.</li>
          <li>Freeze FX rates into <Code>SnapshotFxRate</Code> rows (reused on re-process for reproducibility).</li>
          <li>Patch concept <Code>literal_value</Code>s with entry values so the formula engine treats them as value nodes.</li>
          <li>Evaluate every <Code>auto</Code> entry via <Code>evaluate_concept_by_id()</Code>; store result and freeze <Code>formula_snapshot</Code>.</li>
          <li>Transition <Code>snapshot.status → processed</Code>. Commit.</li>
        </ol>

        <H3>2.6 Completing a Snapshot</H3>
        <p className="leading-relaxed">
          <Code>POST /api/v1/snapshots/{'{id}'}/complete</Code> is only allowed from <Code>processed</Code> status.
          Sets <Code>status = complete</Code>. The snapshot is now immutable and becomes the baseline for
          carry-forward in all future snapshots.
        </p>

        <H3>2.7 Carry-Forward Helper</H3>
        <p className="leading-relaxed">
          <Code>POST /api/v1/snapshots/{'{id}'}/carry-forward</Code> iterates all non-<Code>auto</Code> entries
          that still have <Code>value = null</Code> and fills them from the most recent complete snapshot.
          Useful when you want to bulk-pre-fill unchanged values before editing only the ones that actually changed.
        </p>
      </section>

      <Divider />

      {/* Section 3 */}
      <section>
        <H2>3. Formula Evaluation</H2>

        <H3>3.1 Syntax</H3>
        <p className="leading-relaxed mb-3">
          Formulas are Python-style arithmetic expressions that reference other concepts <strong>by their exact name</strong>.
          The result must be numeric.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Table
            headers={['Category', 'Operators']}
            rows={[
              ['Arithmetic', '+ − * / % ** //'],
              ['Unary', '+x  −x  not x'],
              ['Boolean', 'and  or'],
              ['Comparison', '== != < <= > >='],
            ]}
          />
          <Table
            headers={['Function', 'Description']}
            rows={[
              ['sum(a, b, …)', 'Sum all arguments'],
              ['min(a, b, …)', 'Minimum (≥1 arg)'],
              ['max(a, b, …)', 'Maximum (≥1 arg)'],
              ['if_(c, t, f)', 'Ternary — if_(x>0, x, 0)'],
            ]}
          />
        </div>
        <p className="mt-3 text-xs leading-relaxed">
          Note: <Code>if(</Code> is automatically normalised to <Code>if_(</Code> to avoid the Python keyword conflict.
        </p>
        <Pre className="mt-3">{`income - expenses
sum(rent, utilities, groceries)
salary * 0.8
if_(bonus > 0, salary + bonus, salary)`}</Pre>

        <H3>3.2 Sandboxing</H3>
        <p className="leading-relaxed">
          The engine uses Python's <Code>ast</Code> module — no raw <Code>eval()</Code>. Every formula is parsed
          into an AST, then <Code>_FormulaValidator</Code> walks every node and raises <Code>FormulaSyntaxError</Code> for
          anything not on the explicit whitelist. Parsed expressions are cached with <Code>@lru_cache(maxsize=512)</Code>.
        </p>

        <H3>3.3 Evaluation Algorithm</H3>
        <p className="leading-relaxed mb-2">
          Entry point: <Code>evaluate_concept_by_id(concept_id, concepts, group_members, fx_rates, base_currency)</Code>
        </p>
        <ol className="list-decimal list-inside space-y-1 leading-relaxed mb-3">
          <li>Build <Code>concepts_by_id</Code> and <Code>concepts_by_name</Code> lookup dicts.</li>
          <li>Call <Code>extract_dependency_graph()</Code> — returns a <Code>dict[UUID, set[UUID]]</Code>.</li>
          <li>Call <Code>detect_cycles()</Code> — DFS with grey/black colouring; raises <Code>FormulaCycleError</Code> with the cycle path if a back-edge is found.</li>
          <li>Enter the recursive <Code>evaluate_node(concept_id)</Code>:</li>
        </ol>
        <Pre>{`evaluate_node(id):
  if id in memo   → return memo[id]        # memoisation
  if id in visiting → FormulaCycleError   # belt-and-suspenders

  visiting.add(id)

  if kind == value:
    result = concept.literal_value

  if kind in (formula, aux):
    variables = { name: convert_currency(evaluate_node(dep.id), ...) }
    result = evaluate_expression(expression, variables)

  if kind == group:
    values = [ convert_currency(evaluate_node(c.id), ...) for c in children ]
    result = aggregate(values, aggregate_op)   # sum/avg/min/max

  memo[id] = result
  return result`}</Pre>
        <p className="mt-2 text-xs leading-relaxed">
          Memoisation means each concept is evaluated at most once per snapshot process, regardless of how many formulas reference it.
        </p>

        <H3>3.4 Currency Conversion</H3>
        <p className="leading-relaxed mb-2">
          Every concept has a <Code>currency_code</Code>. When a formula or group reads a child concept in a different
          currency, <Code>_convert_currency()</Code> converts using the frozen <Code>SnapshotFxRate</Code> rows:
        </p>
        <Pre>{`converted = raw_value / from_rate * to_rate`}</Pre>
        <p className="mt-2 text-xs leading-relaxed">
          If either rate is missing, the raw value is returned unchanged — a silent no-op that prevents crashes when
          a currency is not yet configured. FX rates are frozen at first process time; re-processing reuses them for
          historical reproducibility.
        </p>
      </section>

      <Divider />

      {/* Section 4 */}
      <section>
        <H2>4. End-to-End Flow</H2>
        <Pre>{`  ┌──────────────────────────────────────────────────────────────────┐
  │ 1. DEFINE MODEL                                                  │
  │    POST /api/v1/concepts  (value, formula, group, aux)           │
  │    Add group memberships                                         │
  └─────────────────────────────┬────────────────────────────────────┘
                                │
  ┌─────────────────────────────▼────────────────────────────────────┐
  │ 2. TAKE SNAPSHOT                                                 │
  │    POST /api/v1/snapshots  →  status: open                       │
  │    ConceptEntry rows created; copy/copy_or_manual pre-filled     │
  └─────────────────────────────┬────────────────────────────────────┘
                                │
  ┌─────────────────────────────▼────────────────────────────────────┐
  │ 3. FILL MANUAL VALUES                                            │
  │    PATCH /api/v1/snapshots/{id}/entries/{entry_id}               │
  └─────────────────────────────┬────────────────────────────────────┘
                                │
  ┌─────────────────────────────▼────────────────────────────────────┐
  │ 4. PROCESS                                                       │
  │    POST /api/v1/snapshots/{id}/process  →  status: processed     │
  │    Formula engine evaluates all auto entries; FX rates frozen    │
  └─────────────────────────────┬────────────────────────────────────┘
                                │
  ┌─────────────────────────────▼────────────────────────────────────┐
  │ 5. REVIEW                                                        │
  │    GET /api/v1/snapshots/{id}                                    │
  │    (optional: re-POST /process to recalculate after edits)       │
  └─────────────────────────────┬────────────────────────────────────┘
                                │
  ┌─────────────────────────────▼────────────────────────────────────┐
  │ 6. COMPLETE                                                      │
  │    POST /api/v1/snapshots/{id}/complete  →  status: complete     │
  │    Snapshot locked; becomes carry-forward baseline               │
  └──────────────────────────────────────────────────────────────────┘`}</Pre>

        <div className="mt-4">
          <Table
            headers={['Step', 'Endpoint', 'Result']}
            rows={[
              ['Define model', 'POST /api/v1/concepts', 'Concept DAG stored in DB'],
              ['Take snapshot', 'POST /api/v1/snapshots', 'open snapshot; ConceptEntry rows created'],
              ['Fill values', 'PATCH /api/v1/snapshots/{id}/entries/{entry_id}', 'Manual entries updated'],
              ['Process', 'POST /api/v1/snapshots/{id}/process', 'Formulas evaluated; FX frozen; → processed'],
              ['Review', 'GET /api/v1/snapshots/{id}', 'Inspect computed values'],
              ['Complete', 'POST /api/v1/snapshots/{id}/complete', 'Snapshot locked; → complete'],
            ]}
          />
        </div>
      </section>

      <Divider />

      {/* Section 5 */}
      <section>
        <H2>5. Quick Example: Income, Expenses, Net Worth</H2>

        <H3>The Model</H3>
        <Table
          headers={['Name', 'Kind', 'carry_behaviour', 'Notes']}
          rows={[
            ['salary', 'value', 'copy_or_manual', 'Monthly take-home'],
            ['freelance', 'value', 'copy_or_manual', 'Side income'],
            ['rent', 'value', 'copy_or_manual', 'Monthly rent'],
            ['groceries', 'value', 'copy_or_manual', 'Monthly grocery spend'],
            ['income', 'group', 'auto', 'aggregate_op: sum; members: salary, freelance'],
            ['expenses', 'group', 'auto', 'aggregate_op: sum; members: rent, groceries'],
            ['net_worth', 'formula', 'auto', 'expression: income - expenses'],
          ]}
        />
        <Pre className="mt-3">{`  salary ──────────┐
  freelance ───────┼──► income (sum) ──────────────► net_worth = income - expenses
  rent ────────────┤                                         ▲
  groceries ───────┴──► expenses (sum) ─────────────────────┘`}</Pre>

        <H3>Step 1 — Take a snapshot</H3>
        <p className="leading-relaxed mb-2">After creating the 7 concepts and group memberships, take the first snapshot. All <Code>copy_or_manual</Code> entries start as <Code>null</Code> (no prior snapshot exists yet):</p>
        <Table
          headers={['Concept', 'Initial value']}
          rows={[
            ['salary', 'null'],
            ['freelance', 'null'],
            ['rent', 'null'],
            ['groceries', 'null'],
            ['income', 'null — auto, will be computed'],
            ['expenses', 'null — auto, will be computed'],
            ['net_worth', 'null — auto, will be computed'],
          ]}
        />

        <H3>Step 2 — Fill manual values</H3>
        <Pre>{`PATCH /api/v1/snapshots/{id}/entries/{salary_entry_id}     { "value": 5000 }
PATCH /api/v1/snapshots/{id}/entries/{freelance_entry_id}  { "value": 800  }
PATCH /api/v1/snapshots/{id}/entries/{rent_entry_id}       { "value": 1500 }
PATCH /api/v1/snapshots/{id}/entries/{groceries_entry_id}  { "value": 300  }`}</Pre>

        <H3>Step 3 — Process</H3>
        <p className="leading-relaxed mb-2">The engine evaluates all <Code>auto</Code> entries:</p>
        <Table
          headers={['Concept', 'Value', 'How']}
          rows={[
            ['salary', '5000', 'entered'],
            ['freelance', '800', 'entered'],
            ['rent', '1500', 'entered'],
            ['groceries', '300', 'entered'],
            ['income', '5800', '5000 + 800 (group sum)'],
            ['expenses', '1800', '1500 + 300 (group sum)'],
            ['net_worth', '4000', '5800 − 1800 (formula)'],
          ]}
        />

        <H3>Step 4 — Complete, then next month</H3>
        <p className="leading-relaxed">
          After <Code>POST /complete</Code>, the snapshot is locked. When the next snapshot is taken for June 2026,
          all four <Code>copy_or_manual</Code> entries are pre-filled (5000, 800, 1500, 300) from this completed snapshot.
          You only update what actually changed.
        </p>
      </section>

      <Divider />

      {/* Section 6 */}
      <section>
        <H2>6. Reference</H2>

        <H3>Status Transition Rules</H3>
        <Table
          headers={['From', 'To', 'Allowed?', 'How']}
          rows={[
            ['open', 'processed', 'Yes', 'POST /snapshots/{id}/process'],
            ['processed', 'processed', 'Yes — idempotent', 'POST /snapshots/{id}/process'],
            ['processed', 'complete', 'Yes', 'POST /snapshots/{id}/complete'],
            ['open', 'complete', 'No', '—  must process first'],
            ['complete', 'any', 'No', '—  immutable'],
          ]}
        />

        <H3 className="mt-4">Formula Engine Exceptions</H3>
        <Table
          headers={['Exception', 'When raised']}
          rows={[
            ['FormulaSyntaxError', 'AST validation failed — disallowed operator, unknown function, non-numeric result'],
            ['FormulaEvaluationError', 'Runtime error — null literal_value, missing group members, unknown concept reference'],
            ['FormulaCycleError', 'A cycle was detected; the .cycle attribute contains the cycle path'],
          ]}
        />
      </section>
    </div>
  )
}

/* ── Small local primitives ─────────────────────────────────────── */

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-[var(--text-h)] mb-4 mt-2">{children}</h2>
}

function H3({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-sm font-semibold text-[var(--text-h)] mt-5 mb-2 ${className}`}>{children}</h3>
}

function Divider() {
  return <hr className="border-[var(--border)]" />
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1 py-0.5 rounded text-xs font-mono bg-[var(--code-bg)] text-[var(--text-h)]">
      {children}
    </code>
  )
}

function Pre({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <pre className={`rounded-lg border border-[var(--border)] bg-[var(--code-bg)] p-4 text-xs font-mono leading-relaxed overflow-x-auto whitespace-pre text-[var(--text)] ${className}`}>
      {children}
    </pre>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--code-bg)]">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-semibold text-[var(--text-h)]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 1 ? 'bg-[var(--code-bg)]/40' : ''}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-[var(--text)] font-mono">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
