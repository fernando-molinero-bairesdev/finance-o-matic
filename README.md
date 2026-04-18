# finance-o-matic — Repo Plan

A personal finance tool where you model your own financial concepts — balances, loans, investments, income streams — as nodes in a graph. Values can be literal numbers, formulas that reference other concepts, or groups that aggregate other concepts. Multi-currency with conversion on read. Auxiliary/derived values are first-class.

## Stack decisions

- Monorepo: pnpm workspaces + Turborepo
- Frontend: React + TypeScript (Vite) + D3
- Backend: FastAPI + SQLAlchemy 2.0 + Alembic + Pydantic v2
- Database: SQLite for local dev, Postgres in prod
- Runtime posture: multi-user / SaaS-shaped from day one

## Running in development

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker (optional, for container-based local dev)

### Local workspace dev

```bash
cd /home/runner/work/finance-o-matic/finance-o-matic
corepack enable
corepack pnpm install --no-frozen-lockfile
```

Install backend Python dependencies:

```bash
cd /home/runner/work/finance-o-matic/finance-o-matic/apps/api
python -m pip install -e ".[dev]"
```

Run all workspace dev tasks (via Turborepo):

```bash
cd /home/runner/work/finance-o-matic/finance-o-matic
corepack pnpm dev
```

### Run apps individually

Web:

```bash
cd /home/runner/work/finance-o-matic/finance-o-matic/apps/web
corepack pnpm dev
```

API:

```bash
cd /home/runner/work/finance-o-matic/finance-o-matic/apps/api
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Docker-based local dev

From the repository root:

```bash
docker compose -f infra/compose/docker-compose.dev.yml up --build
docker compose -f infra/compose/docker-compose.yml up --build
```

This starts Postgres + API + web (web is exposed on `http://localhost:5173`, API on `http://localhost:8000`).

---

## 1. Requirements & Goals

### Functional requirements

- User-defined concepts with a `kind`: `value`, `formula`, or `group`
- Per-concept currency; display currency is user-selectable; conversions via an FX-rate table
- Formula expressions reference other concepts by name/id; cycles detected and rejected
- Groups sum (or aggregate by custom op) their children; groups can contain groups
- Auxiliary values = named, saved formulas exposed like regular concepts (e.g. `projected_annual_taxable`)
- Historical snapshots: capture values over time for charting trends/projections
- Multi-user with auth (each user owns their graph)

### Non-functional requirements

- Deterministic formula evaluation, safe against arbitrary code execution
- Test coverage on backend formula engine + API; frontend component tests on key flows
- SQLite for local dev, Postgres in prod — same SQLAlchemy models, Alembic migrations
- Shippable to Fly/Render/VPS via Docker from day one

### MVP success criteria

You can log in, define ~20 concepts including at least one group and one formula referencing others, view totals in a chosen display currency, and see a D3 chart of net worth over snapshots.

---

## 2. Architecture & Tech Stack

### Frontend

Vite + React + TypeScript; D3 for visualizations; TanStack Query for server state; Zustand (or Context) for light client state; Tailwind for styling; Vitest + React Testing Library for tests.

### Backend

FastAPI + SQLAlchemy 2.0 (typed) + Alembic + Pydantic v2; `fastapi-users` for auth (JWT, email/password to start); `simpleeval` or a small AST-based evaluator for the formula engine (no `eval`); `httpx` for pulling FX rates; pytest + pytest-asyncio for tests.

### Formula engine

Parse expressions to an AST once, extract dependency edges, store them, run topological sort per evaluation. Only allow a whitelist of operators, functions (`sum`, `min`, `max`, `if`), and references to other concepts owned by the same user.

### Data model (core tables)

- `users` — from fastapi-users
- `currencies` — code, name
- `fx_rates` — base_code, quote_code, rate, as_of
- `concepts` — id, user_id, name, kind (`value|formula|group|aux`), currency_code, literal_value, expression, parent_group_id (nullable), aggregate_op (for groups)
- `concept_dependencies` — concept_id → depends_on_concept_id (derived from parse)
- `group_memberships` — group_id, member_concept_id (explicit, more flexible than parent_group_id)
- `snapshots` — id, user_id, taken_at
- `snapshot_values` — snapshot_id, concept_id, evaluated_value, display_currency, converted_value

Later specializations (loans, investments) layer on as typed "kinds" with extra columns or a JSONB details blob.

### API shape

REST under `/api/v1`:

- `/auth/*`
- `/concepts`
- `/concepts/{id}/evaluate`
- `/snapshots`
- `/fx-rates`
- `/me`

OpenAPI schema auto-generated and consumed by the frontend via `openapi-typescript` → `packages/types`.

### Infra

Docker Compose for local Postgres + api + web; GitHub Actions for lint/test/build on PR; single Dockerfile per app; prod deploys with env-driven config.

---

## 3. Folder Structure & Scaffolding

```text
finance-o-matic/
├─ apps/
│  ├─ web/                       # Vite + React + TS + D3
│  │  ├─ src/
│  │  │  ├─ features/            # concepts, snapshots, auth, dashboard
│  │  │  ├─ components/
│  │  │  ├─ charts/              # D3 wrappers
│  │  │  ├─ lib/api.ts           # generated client
│  │  │  └─ main.tsx
│  │  ├─ vite.config.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ api/                       # FastAPI + SQLAlchemy
│     ├─ app/
│     │  ├─ main.py
│     │  ├─ core/                # config, db, security
│     │  ├─ models/              # SQLAlchemy models
│     │  ├─ schemas/             # Pydantic schemas
│     │  ├─ api/v1/              # routers
│     │  ├─ services/
│     │  │  ├─ formula/          # parser, evaluator, deps
│     │  │  ├─ fx/               # rate fetch + conversion
│     │  │  └─ snapshots.py
│     │  └─ auth/
│     ├─ alembic/
│     ├─ tests/
│     ├─ pyproject.toml
│     └─ Dockerfile
├─ packages/
│  ├─ ui/                        # shared React components
│  ├─ types/                     # generated from OpenAPI
│  └─ formula-spec/              # grammar + examples shared by docs
├─ infra/
│  ├─ compose/docker-compose.yml
│  └─ compose/docker-compose.dev.yml
├─ .github/workflows/
│  ├─ ci.yml                     # lint, typecheck, test both apps
│  └─ build.yml                  # docker images on main
├─ turbo.json
├─ pnpm-workspace.yaml
├─ package.json
├─ .editorconfig
├─ .gitignore
├─ .env.example
└─ README.md
```

Turborepo pipelines: `dev`, `build`, `test`, `lint`, `typecheck`. The Python app hooks into Turbo via scripted tasks that shell out to `uv`/`hatch`/`make`.

---

## 4. Milestones & Task Breakdown

### M0 — Scaffolding (1–2 days)

pnpm workspace + Turbo; Vite React TS app; FastAPI app with health check; Dockerfiles; compose with Postgres; GitHub Actions CI green; OpenAPI → `packages/types` codegen wired.

### M1 — Auth + core data model (2–3 days)

`fastapi-users` JWT; users, currencies, fx_rates, concepts tables; Alembic baseline; login/register UI; protected route skeleton; seed script for currencies.

### M2 — Formula engine (3–4 days)

Parser, AST, whitelist, dependency extraction, cycle detection, evaluator, `POST /concepts/{id}/evaluate`. Heavy unit tests here — this is the correctness-critical piece.

### M3 — Concept CRUD UI (2–3 days)

List/create/edit/delete concepts; inline evaluated value; currency selector; error surfacing for bad formulas.

### M4 — Groups + aggregation (2 days)

`group` kind, membership endpoints, aggregate ops (`sum`, `avg`, `min`, `max`), UI for nesting.

### M5 — FX + display currency (1–2 days)

FX fetch job, per-user display currency, conversion on read in evaluator and snapshots.

### M6 — Snapshots + D3 chart (2–3 days)

Take/list snapshots; net-worth-over-time D3 line chart; per-concept time series.

### M7 — Specializations: loans & investments (3–4 days)

Loan concept: principal, rate, term, amortization projection as auxiliary values. Investment concept: cost basis, current value, unrealized gain.

### M8 — Polish & deploy (2 days)

Error boundaries, empty states, README, deploy to Fly/Render, backup strategy for Postgres.

### Testing strategy (baked in per milestone)

- **Backend:** pytest for every service + router; formula engine gets a big table-driven suite (valid exprs, invalid exprs, cycles, cross-user access attempts).
- **Frontend:** Vitest + RTL for feature components; MSW for API mocking; one Playwright smoke test (login → create concept → see value) in CI.
