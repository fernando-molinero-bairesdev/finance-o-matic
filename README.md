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

### Environment setup (`.env`)

Use the root `.env.example` as the source of truth:

```bash
cd finance-o-matic
cp .env.example apps/api/.env
cp .env.example apps/web/.env
```

Required values:

- `DATABASE_URL`: API database connection string
- `SECRET_KEY`: JWT/signing secret (change from default)
- `JWT_LIFETIME_SECONDS`: access token lifetime (default: `3600`)
- `CORS_ORIGINS`: JSON array of allowed frontend origins
- `VITE_API_BASE_URL`: API base URL used by the web app (`http://localhost:8000` for local dev)

For Docker Compose local dev, use the compose defaults in `infra/compose/*.yml` or place overrides in a root `.env`.

### Auth quickstart

The API exposes auth routes under `/api/v1/auth/*` and user routes under `/api/v1/users/*`.

Register:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"MyS3cur3P@ssw0rd2024!"}'
```

Login (JWT):

```bash
curl -X POST http://localhost:8000/api/v1/auth/jwt/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=you@example.com&password=MyS3cur3P@ssw0rd2024!"
```

Use the returned `access_token` as a bearer token for protected endpoints:

```bash
curl http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer <access_token>"
```

The web app also supports register/login flows at `/register` and `/login`.

### Database management

The API uses **SQLAlchemy 2.0** for async ORM access and **Alembic** for schema migrations. The database engine is chosen by `DATABASE_URL`:

| Environment | Driver | Example `DATABASE_URL` |
|-------------|--------|------------------------|
| Local dev (default) | `aiosqlite` | `sqlite+aiosqlite:///./dev.db` |
| Production / Docker | `asyncpg` | `postgresql+asyncpg://user:pass@host:5432/finance_o_matic` |

> The `alembic.ini` default points to SQLite. Alembic reads `DATABASE_URL` from `apps/api/.env` at runtime, so setting the env var is all that is needed to switch to Postgres.

**Apply all pending migrations** (idempotent — safe to run on first start):

```bash
pnpm db:migrate
# or from apps/api/: python -m alembic upgrade head
```

**Create a new auto-generated migration** after changing a model:

```bash
pnpm db:revision -- -m "add snapshot table"
# or from apps/api/: python -m alembic revision --autogenerate -m "add snapshot table"
```

Review the generated file in `apps/api/alembic/versions/` before committing it.

**Roll back the last migration**:

```bash
pnpm db:downgrade
# or from apps/api/: python -m alembic downgrade -1
```

**Seed ISO 4217 currencies** (run once after the first migration):

```bash
cd apps/api
python scripts/seed_currencies.py
```

The seed script is idempotent — re-running it inserts only missing rows.

### Local workspace dev

```bash
cd finance-o-matic
corepack enable
pnpm install
```

Install backend Python dependencies:

```bash
cd finance-o-matic/apps/api
python -m pip install -e ".[dev]"
```

Apply database migrations:

```bash
cd finance-o-matic
pnpm db:migrate
```

Run all workspace dev tasks (via Turborepo):

```bash
cd finance-o-matic
pnpm dev
```

### Run apps individually

Web:

```bash
cd finance-o-matic/apps/web
pnpm dev
```

API:

```bash
cd finance-o-matic/apps/api
pnpm db:migrate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Create a new migration:

```bash
cd finance-o-matic
pnpm db:revision -- -m "your migration message"
```

### Docker-based local dev

From the repository root:

```bash
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.dev.yml up --build
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
- `concepts` — id, user_id, name, kind (`value|formula|group|aux`), carry_behaviour (`auto|copy|manual|copy_or_manual`), currency_code, literal_value, expression, parent_group_id (nullable), aggregate_op (for groups)
- `concept_dependencies` — concept_id → depends_on_concept_id (derived from parse)
- `group_memberships` — group_id, member_concept_id (explicit, more flexible than parent_group_id)
- `processes` — id, user_id, name, description, cadence, trigger_type, concept_scope (`all|selected`), selected_concept_ids, is_active
- `process_schedules` — process_id, cadence, next_run_at, last_run_at
- `snapshots` — id, process_id, user_id, label, date, trigger, status (`pending|complete|failed`)
- `concept_entries` — id, snapshot_id, concept_id, value, currency_id, carry_behaviour_used, formula_snapshot, is_pending

Later specializations (loans, investments) layer on as typed "kinds" with extra columns or a JSONB details blob.

### API shape

REST under `/api/v1`:

- `/auth/*`
- `/concepts`
- `/concepts/{id}/evaluate`
- `/processes`
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

### M0 — Scaffolding ✓ COMPLETE

pnpm workspace + Turbo; Vite React TS app; FastAPI app with health check; Dockerfiles; compose with Postgres; GitHub Actions CI green; OpenAPI → `packages/types` codegen wired.

### M1 — Auth + core data model + formula engine ✓ COMPLETE

`fastapi-users` JWT; users, currencies, fx_rates, concepts tables; Alembic baseline; login/register UI; protected route skeleton; seed script for currencies. Formula engine: parser, AST, whitelist, dependency extraction, cycle detection, evaluator, `POST /concepts/{id}/evaluate`.

### M2 — Concept CRUD UI + Carry Behaviour

Full concept CRUD endpoints and UI (list/create/edit/delete); inline evaluated value; currency selector; error surfacing for bad formulas. Add `carry_behaviour` field to Concept (`auto|copy|manual|copy_or_manual`). Groups and aggregation: `group` kind, membership endpoints, aggregate ops (`sum`, `avg`, `min`, `max`), UI for nesting. FX fetch job, per-user display currency, conversion on read.

### M3 — Snapshots + ConceptEntry

`Snapshot` and `ConceptEntry` models + migrations. Take-snapshot endpoint: for each concept in scope apply its `carry_behaviour` (`auto` → run formula engine, `copy` → carry prior value, `copy_or_manual`/`manual` → set `is_pending`). Snapshot status stays `pending` until all pending entries are filled; resolves to `complete`. Manual trigger from UI. Pending-entry resolution flow.

### M4 — Processes

`Process` and `ProcessSchedule` models + migrations. Process CRUD UI (define name, cadence, trigger type, concept scope). Wire Snapshots to Processes — every Snapshot belongs to a Process.

### M5 — Scheduled & Event Triggers

APScheduler integration (integrates with FastAPI lifespan) for scheduled processes. Event-driven triggers fired from CRUD mutation endpoints (`fx_rate_updated`, `concept_value_edited`, `manual_override`). FX rate event triggers.

### M6 — Charting

Time-series queries over ConceptEntry by concept + date range. D3 dashboard charts: net worth over time, per-concept trends.

### Testing strategy (baked in per milestone)

- **Backend:** pytest for every service + router; formula engine gets a big table-driven suite (valid exprs, invalid exprs, cycles, cross-user access attempts); snapshot automation flow tested with in-memory DB.
- **Frontend:** Vitest + RTL for feature components; MSW for API mocking; one Playwright smoke test (login → create concept → see value) in CI.
