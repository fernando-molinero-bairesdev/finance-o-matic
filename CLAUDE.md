# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**finance-o-matic** is a personal finance graph modeling tool where users define financial concepts (balances, loans, income streams, etc.) as a directed acyclic graph (DAG). Concepts can be literal values, formulas referencing other concepts, or groups that aggregate others. It supports multi-currency, FX rates, entities (accounts, loans, assets), and historical net-worth snapshots with charting.

## Monorepo Structure

This is a **pnpm + Turborepo monorepo**:

- `apps/api/` — FastAPI + SQLAlchemy backend (Python 3.11+)
- `apps/web/` — Vite + React 19 + TypeScript frontend
- `packages/types/` — Auto-generated TypeScript types from the FastAPI OpenAPI schema
- `packages/ui/` — Shared React component library
- `packages/formula-spec/` — Shared formula grammar documentation
- `infra/compose/` — Docker Compose configs for local dev with Postgres

## Commands

All top-level commands run via Turborepo and apply to all workspaces:

```bash
pnpm dev           # Start all apps in dev mode (web + api)
pnpm build         # Build all apps
pnpm test          # Run all tests
pnpm lint          # Lint all apps (ESLint for web, Ruff for api)
pnpm typecheck     # Type-check all apps (tsc for web, mypy for api)
```

To run a **single backend test file**:
```bash
pnpm --filter @finance-o-matic/api test -- tests/test_formula_engine.py -v
```

To run **all frontend tests**:
```bash
pnpm --filter @finance-o-matic/web exec vitest run
```

To run a **single frontend test file**:
```bash
pnpm --filter @finance-o-matic/web exec vitest run src/features/concepts/ConceptForm.test.tsx
```

### Backend-specific

```bash
cd apps/api
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Migrations
pnpm db:migrate                        # Apply all pending migrations (alembic upgrade head)
pnpm db:downgrade                      # Roll back one migration

# Auto-generate a migration after model changes (pnpm db:revision arg parsing is broken; use directly):
cd apps/api && node scripts/run-python.cjs -m alembic revision --autogenerate -m "description"
```

> **Alembic env.py caveat:** `apps/api/alembic/env.py` must import every model file so autogenerate detects the full schema. If a model is missing from the import list, autogenerate will produce spurious DROP TABLE operations. Currently imports: user, currency, fx_rate, concept, concept_dependency, entity_type, entity_property_def, entity_property_value, entity, snapshot, concept_entry. Add any new model there.

### Frontend-specific

```bash
cd apps/web
pnpm dev           # Vite dev server at http://localhost:5173
pnpm typecheck     # tsc --noEmit
```

### Docker (Postgres-backed local dev)

```bash
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.dev.yml up --build
```

### Type generation

```bash
pnpm generate:types   # Regenerate packages/types/src/api.ts from FastAPI OpenAPI schema
```
Run this whenever backend schemas change.

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` | Use `sqlite+aiosqlite:///./dev.db` for local dev without Docker |
| `SECRET_KEY` | `CHANGEME-...` | Must be changed in production |
| `JWT_LIFETIME_SECONDS` | `3600` | Token expiry |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | JSON array of allowed origins |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Consumed by Vite at build time |
| `FX_BASE_CURRENCY` | `USD` | Base currency for frankfurter.app FX rate fetch |
| `SCHEDULED_JOBS_ENABLED` | `True` | Set to `False` in tests to skip APScheduler startup |

## Architecture

### Backend (`apps/api`)

**Entry point:** `app/main.py` — Configures FastAPI app, CORS middleware, mounts auth routes via fastapi-users, and defines lifespan for DB initialization.

**Auth:** `app/auth/users.py` — Uses [fastapi-users](https://fastapi-users.github.io/) with JWT strategy. The `current_active_user` FastAPI dependency is the standard way to protect routes. The currencies `GET` endpoint is intentionally unauthenticated; all mutating currency routes require auth.

**Database:** `app/core/db.py` — SQLAlchemy 2.0 async engine + session factory. All models inherit from a shared `Base`. Sessions are provided via a `get_async_session` dependency. The same codebase switches between SQLite (local) and Postgres (production) via `DATABASE_URL`.

**Models:**
- `Concept` — Core entity. `ConceptKind`: `value` (literal), `formula` (references others), `group` (aggregates members), `aux` (auxiliary/reference-only). `ConceptCarryBehaviour`: `auto` (recomputed each snapshot), `copy` (carry forward), `copy_or_manual` (copy if prior exists, else prompt for input). Optional `entity_type_id` FK: when set, the snapshot service creates one `ConceptEntry` per entity of that type instead of one global entry.
- `ConceptDependency` — Tracks edges in the concept DAG for visualization and cycle detection.
- `Currency` / `FxRate` — Reference tables for multi-currency support. Currencies are seeded via `POST /api/v1/init/currencies` (idempotent; no auth required).
- `Snapshot` — One snapshot run: `date`, `label`, `trigger` (`manual|scheduled`), `status` (`open|processed|complete`). Status machine: **open** (entries editable) → **processed** (formulas evaluated, review) → **complete** (locked).
- `ConceptEntry` — Single ledger line within a Snapshot: `value`, `currency_code`, `carry_behaviour_used`, `formula_snapshot` (frozen formula at eval time), `is_pending`, `entity_id` (FK to Entity, set automatically by snapshot service for per-entity concepts).
- `Process` — Reusable snapshot template; defines name, cadence (`daily|weekly|monthly|quarterly|manual`), `is_active` flag, and concept scope (`all|selected`).
- `ProcessSchedule` — Tracks `next_run_at` / `last_run_at` for scheduled processes. `next_run_at` is recalculated on cadence change or reactivation. APScheduler polls this table daily at 00:05.
- `EntityType` — User-defined category of real-world thing (Account, Loan, Asset, Investment). Seeded via `POST /api/v1/init/entity-types`.
- `EntityPropertyDef` — Typed property definition on an EntityType (`decimal|string|date|entity_ref`; cardinality `one|many`).
- `EntityPropertyValue` — Concrete value for one property on one Entity instance.
- `Entity` — A named instance of an EntityType (e.g. "Chase Checking" of type Account). Unique per `(user_id, entity_type_id, name)`. Seeded via `POST /api/v1/init/entities`.

**Formula Engine (`app/services/formula/engine.py`):** The most critical service. Uses Python's `ast` module + `simpleeval` for safe, sandboxed evaluation — no `eval()`. Key functions:
- `parse_formula()` — Validates syntax; whitelisted operators and functions (`sum`, `min`, `max`, `if_`).
- `extract_reference_names()` — Extracts concept name dependencies from a formula string.
- `detect_cycles()` — DFS cycle detection on the concept dependency graph.
- `evaluate_concept_by_id()` — Recursive evaluation with memoization. Groups find their children by filtering `concept_list` for `c.parent_group_id == node_id`.

**Scheduler (`app/core/scheduler.py` + `app/services/scheduled_jobs.py`):** APScheduler `AsyncIOScheduler` started in the FastAPI lifespan (disabled in tests via `SCHEDULED_JOBS_ENABLED=False`). Two jobs:
- `run_due_processes` — 00:05 daily; triggers snapshots for due active processes.
- `fetch_fx_rates` — 06:00 daily; fetches from `https://api.frankfurter.app/latest?from={FX_BASE_CURRENCY}` via `httpx`, upserts `FxRate` rows.

**API routes** (all under `/api/v1/`):
- `concepts.py` — full Concept CRUD + `POST /{id}/evaluate`, `GET /{id}/history`
- `currencies.py` — `GET` (no auth), `POST`, `PUT /{code}`, `DELETE /{code}` (auth required for mutations; DELETE returns 409 if referenced by concepts)
- `entities.py` — EntityType CRUD + property defs + Entity CRUD + property values
- `snapshots.py` — `POST /snapshots`, `GET /snapshots`, `GET /snapshots/{id}`, `POST /snapshots/{id}/process`, `POST /snapshots/{id}/complete`, `PATCH /snapshots/{id}/entries/{entry_id}`
- `processes.py` — full Process CRUD + `POST /{id}/snapshots` (ad-hoc snapshot trigger)
- `init.py` — idempotent seed endpoints: `POST /init/currencies` (no auth), `POST /init/concepts`, `POST /init/entity-types`, `POST /init/entities`

### Snapshot State Machine

```
POST /snapshots → status: open
  ↓ user fills in copy_or_manual entries via PATCH /snapshots/{id}/entries/{entry_id}
POST /snapshots/{id}/process → status: processed  (formula auto entries evaluated)
  ↓ user reviews computed values
POST /snapshots/{id}/complete → status: complete   (locked; carry uses this as prior)
```

The `PATCH` entry endpoint preserves `entity_id` when not provided — it is set by the snapshot service and should not be cleared by normal value-entry edits.

### Per-Entity Concepts

When a concept has `entity_type_id` set, `take_snapshot()` creates one `ConceptEntry` per entity of that type (with `entity_id` set). Carry-forward looks up prior entries matching both `concept_id` and `entity_id`. If no entities of the bound type exist yet, falls back to a single entry with `entity_id=None`.

### Frontend (`apps/web`)

**Auth flow:** `AuthProvider` (React Context) holds the current user and JWT token. `PrivateRoute` guards protected pages. `apiClient.ts` is a thin fetch wrapper that attaches the bearer token from context.

**State management:** TanStack Query (React Query) for all server state. React Context only for auth.

**Routing:** React Router v7. Protected routes are grouped under an `AppLayout` shell with a sidebar nav. Route groups:
- `/` — Dashboard (active processes, portfolio trend chart, recent snapshots)
- `/reports` — Full snapshot list + take-snapshot workflow
- `/configuration/concepts` — Concept CRUD with group picker and entity-type binding
- `/configuration/currencies` — Currency list, inline edit, create form, "Load standard currencies" init button
- `/configuration/processes` — Process CRUD
- `/configuration/entity-types` — EntityType + property management
- `/entities` — Entity instances with expandable property editors

**API modules** in `src/lib/`:
- `currenciesApi.ts` — full currency CRUD + `initCurrencies()`. `conceptsApi.ts` re-exports `CurrencyRead` and `getCurrencies` from here for backward compatibility.
- `conceptsApi.ts` — concept CRUD, `getConceptHistory()`, `initConcepts()`
- `snapshotsApi.ts` — snapshot lifecycle, entry updates
- `entitiesApi.ts` — entity types, entity instances, property values, `initEntityTypes()`, `initEntities()`
- `processesApi.ts` — process CRUD

**UI primitives** in `src/components/ui/`: `Button` (variant: primary/secondary/danger/ghost, size: sm/md), `FormField` (label + children + error, exports `inputClass`/`selectClass`), `Badge` (variant: success/pending/warning/neutral/purple). Tailwind CSS v4 via `@tailwindcss/vite`; all colors from CSS custom properties (`--accent`, `--bg`, `--border`, etc.).

### Data Flow

1. User authenticates → JWT stored in React Context + localStorage
2. Call `POST /init/currencies`, `POST /init/entity-types`, `POST /init/entities`, `POST /init/concepts` to seed reference data (idempotent; safe to repeat)
3. User defines concepts (values, formulas, groups) and optionally binds them to an entity type
4. `POST /snapshots` → snapshot enters `open` state; per-entity concepts get one entry per entity
5. User fills manual entries → `POST /snapshots/{id}/process` evaluates formulas → `POST /snapshots/{id}/complete` locks it
6. `GET /concepts/{id}/history` returns time-series of values across complete snapshots for charting

## Current Development Stage

**Completed milestones:**
- **M1** — Auth, core models, formula engine
- **M2** — Concept CRUD UI + carry behaviour, groups/aggregation
- **M3** — Snapshots + ConceptEntry: take-snapshot, pending-entry resolution, `POST /init/concepts`
- **M4** — Processes: full CRUD, is_active toggle, ad-hoc snapshot, concept multi-select scope
- **M5** — Scheduled triggers: APScheduler (`run_due_processes`, `fetch_fx_rates`), `ProcessSchedule` lifecycle
- **M6** — Charting: `GET /concepts/{id}/history`, `ConceptTrendChart` (recharts line chart) on Dashboard + Reports
- **Entity system** — EntityType/EntityPropertyDef/Entity models, full CRUD, per-entity concept entries
- **Currency CRUD** — Full create/edit/delete UI, `POST /init/currencies` endpoint
- **Responsive UI** — AppLayout with sidebar nav, Tailwind CSS v4, shared UI primitives

**In progress / upcoming:**
- **Many-to-many group membership** — Replace single `parent_group_id` FK with a `concept_group_memberships` junction table so a concept can belong to multiple groups simultaneously. Requires engine change (`group_members` dict param), schema change (`group_ids: list[UUID]`), migration, and multi-checkbox UI in ConceptForm.

## Testing Strategy

All new features from M3 onward are developed TDD: tests written first (RED), then implementation makes them pass (GREEN).

- **Backend:** pytest with `pytest-asyncio`. Tests use `aiosqlite` in-memory DB. Each feature has its own test file:
  - `test_formula_engine.py` — table-driven; add cases here for any new formula features
  - `test_concept_model.py` — model defaults and carry behaviour logic
  - `test_concept_schemas.py` — pure Pydantic schema validation
  - `test_concepts_crud.py` — Concept CRUD endpoint integration tests
  - `test_concept_init.py` — `POST /init/concepts` idempotency and formula eval
  - `test_currencies.py` — currency endpoint tests (list, create, update, delete, 409 on in-use delete)
  - `test_group_evaluation.py` — group aggregation (sum/avg/min/max, nested groups, formula children)
  - `test_entity_type_init.py` — entity type seeding
  - `test_processes_crud.py` — Process CRUD + `ProcessSchedule` lifecycle sync
  - `test_process_snapshots.py` — `POST /processes/{id}/snapshots` ad-hoc trigger
  - `test_scheduled_jobs.py` — `run_due_processes` job (uses `StaticPool` for multi-session SQLite)
  - `test_fx_service.py` — `fetch_fx_rates` job (httpx mocked with async context manager)
  - `test_snapshot_per_entity.py` — per-entity concept entries, entity-scoped carry, `POST /init/entities`
  - `test_snapshot_workflow.py` — full open→process→complete state machine

- **Frontend:** Vitest + React Testing Library with jsdom.
  - `features/auth/auth.test.tsx` — auth flows and route guards
  - `features/concepts/ConceptForm.test.tsx` — concept creation form
  - `features/concepts/ConceptList.test.tsx` — concept list rendering
  - `features/concepts/ConceptInitButton.test.tsx` — initialization button states
  - `features/processes/ProcessForm.test.tsx` — create + edit mode, concept picker for `selected` scope
  - `features/processes/ProcessList.test.tsx` — edit inline, active toggle, ad-hoc snapshot
  - `lib/conceptsApi.test.ts` — API client unit tests (imports `getCurrencies` via re-export from `currenciesApi`)
  - `pages/DashboardPage.test.tsx` — dashboard integration
