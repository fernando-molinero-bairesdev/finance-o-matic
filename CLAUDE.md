# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**finance-o-matic** is a personal finance graph modeling tool where users define financial concepts (balances, loans, income streams, etc.) as a directed acyclic graph (DAG). Concepts can be literal values, formulas referencing other concepts, or groups that aggregate others. It supports multi-currency, FX rates, and is designed for historical net-worth snapshots and charting.

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

To run a **single test file** in the backend:
```bash
cd apps/api && pytest tests/test_formula_engine.py -v
```

To run a **single test file** in the frontend:
```bash
cd apps/web && pnpm test --run src/features/auth/auth.test.tsx
```

### Backend-specific

```bash
cd apps/api
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Migrations
pnpm db:migrate                        # Apply all pending migrations (alembic upgrade head)
pnpm db:revision -- -m "description"   # Auto-generate migration after model changes
pnpm db:downgrade                      # Roll back one migration

# Seed currency reference data (run once after initial migrate)
python scripts/seed_currencies.py
```

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

**Auth:** `app/auth/users.py` — Uses [fastapi-users](https://fastapi-users.github.io/) with JWT strategy. The `current_active_user` FastAPI dependency is the standard way to protect routes.

**Database:** `app/core/db.py` — SQLAlchemy 2.0 async engine + session factory. All models inherit from a shared `Base`. Sessions are provided via a `get_async_session` dependency. The same codebase switches between SQLite (local) and Postgres (production) via `DATABASE_URL`.

**Models:**
- `Concept` — Core entity. `ConceptKind` enum: `value` (literal), `formula` (references others), `group` (aggregates), `aux` (auxiliary/reference-only). `ConceptCarryBehaviour` enum: `auto` (recomputed each snapshot), `copy` (carry forward from prior entry), `copy_or_manual` (copy if prior exists, else prompt). Defaults: `formula`/`group` → `auto`; `value` → `copy_or_manual`; `aux` → `copy`.
- `ConceptDependency` — Tracks edges in the concept DAG for UI visualization and cycle detection.
- `Currency` / `FxRate` — Reference tables for multi-currency support.
- `Snapshot` — One instance of a snapshot run; records `date`, `label`, `trigger` (`manual|scheduled`), and `status` (`pending|complete|failed`). Status is `pending` when any entries need user input; transitions to `complete` when all entries are resolved.
- `ConceptEntry` — Single ledger line within a Snapshot: evaluated `value`, `currency_code`, `carry_behaviour_used` (audit trail), `formula_snapshot` (frozen formula string at evaluation time), `is_pending` flag. Pending entries are those with `copy_or_manual` or `copy` behaviour that had no prior value to copy.
- `Process` — Reusable snapshot template; defines name, cadence (`daily|weekly|monthly|quarterly|manual`), `is_active` flag, and concept scope (`all|selected`). When `is_active=True` and cadence is not `manual`, a `ProcessSchedule` row is maintained.
- `ProcessSchedule` — Tracks `next_run_at` / `last_run_at` for scheduled processes. `next_run_at` is recalculated whenever the process cadence changes or `is_active` is set to `True`. APScheduler polls this table daily at 00:05.

**Formula Engine (`app/services/formula/engine.py`):** The most critical service. Uses Python's `ast` module + `simpleeval` for safe, sandboxed formula evaluation — no `eval()` of untrusted strings. Key functions:
- `parse_formula()` — Validates syntax; only allows whitelisted operators and functions (`sum`, `min`, `max`, `if_`).
- `extract_reference_names()` — Extracts which concept names a formula depends on.
- `detect_cycles()` — DFS cycle detection on the concept dependency graph.
- `evaluate_concept_by_id()` — Recursive evaluation with memoization.

**Scheduler (`app/core/scheduler.py` + `app/services/scheduled_jobs.py`):** APScheduler `AsyncIOScheduler` started in the FastAPI lifespan (disabled when `settings.scheduled_jobs_enabled=False`, e.g. in tests). Two jobs:
- `run_due_processes` — runs at 00:05 daily; queries active `ProcessSchedule` rows with `next_run_at <= today`, calls `take_snapshot` with `trigger=scheduled`, advances `next_run_at`.
- `fetch_fx_rates` — runs at 06:00 daily; fetches from `https://api.frankfurter.app/latest?from={fx_base_currency}` via `httpx`, upserts `FxRate` rows.

**API routes:** All under `/api/v1/`. Auth routes (`/auth/register`, `/auth/jwt/login`, `/users/me`, etc.) are mounted by fastapi-users. Custom routes are in `app/api/v1/`:
- `app/api/v1/concepts.py` — full Concept CRUD + `POST /{id}/evaluate`
- `app/api/v1/currencies.py` — `GET /currencies`
- `app/api/v1/snapshots.py` — `POST /snapshots`, `GET /snapshots`, `GET /snapshots/{id}`, `PATCH /snapshots/{id}/entries/{entry_id}`
- `app/api/v1/init.py` — `POST /init/concepts` (idempotent starter-concept seed)
- `app/api/v1/processes.py` — full Process CRUD: `POST /processes`, `GET /processes`, `GET /processes/{id}`, `PUT /processes/{id}`, `DELETE /processes/{id}`, `POST /processes/{id}/snapshots` (trigger ad-hoc snapshot for a process)

### Frontend (`apps/web`)

**Auth flow:** `AuthProvider` (React Context) holds the current user and JWT token. `PrivateRoute` guards protected pages. `apiClient.ts` is a thin fetch wrapper that attaches the bearer token from context.

**State management:** TanStack Query (React Query) for all server state. React Context only for auth.

**Routing:** React Router v7. Public routes: `/login`, `/register`. Protected routes: `/` (dashboard) and future pages.

**UI primitives** live in `src/components/ui/`: `Button` (variant: primary/secondary/danger/ghost, size: sm/md), `FormField` (label + children + error, exports `inputClass`/`selectClass`), `Badge` (variant: success/pending/warning/neutral/purple). Tailwind CSS v4 is used via `@tailwindcss/vite`; all colors come from CSS custom properties (`--accent`, `--bg`, `--border`, etc.) applied as Tailwind arbitrary values.

**Dashboard:** `pages/DashboardPage.tsx` is a full app shell (sticky header + `max-w-2xl` centered main) with three card sections:
- *Concepts* — `ConceptInitButton` (seeds starter concepts), `ConceptForm` (add concept), `ConceptList` (list + delete)
- *Processes* — `ProcessForm` (create/edit, with concept multi-select when scope=selected), `ProcessList` (edit, toggle active, take ad-hoc snapshot, delete)
- *Snapshots* — `TakeSnapshotForm` (date + label), `PendingEntriesForm` (inline resolution for `copy_or_manual` entries with no prior value), `SnapshotList` (history with status Badge)

### Data Flow

1. User authenticates → JWT stored in React Context (and likely localStorage)
2. Frontend fetches/mutates concepts via `apiClient.ts` → TanStack Query cache
3. `POST /init/concepts` seeds a standard set of starter concepts (idempotent)
4. `POST /snapshots` triggers the take-snapshot service: evaluates `auto` concepts via the formula engine, carries forward `copy` values from the prior snapshot, marks `copy_or_manual` entries with no prior value as `is_pending`
5. User resolves pending entries via `PATCH /snapshots/{id}/entries/{entry_id}`; snapshot transitions to `complete` when all entries are resolved

## Current Development Stage (M5 complete)

Authentication, core data models, formula engine, full Concept CRUD, Snapshot + ConceptEntry, concept initialization, pending-entry resolution, Process CRUD, APScheduler integration, FX rate fetching, and a full responsive UI are all complete and fully tested.

**Completed milestones:**
- **M1** — Auth, core models, formula engine
- **M2** — Concept CRUD UI + carry behaviour field, groups/aggregation
- **M3** — Snapshots + ConceptEntry: take-snapshot endpoint, pending-entry resolution UI, `POST /init/concepts` starter-concept seed (TDD throughout)
- **M4** — Processes: `Process` + `ProcessSchedule` models, full Process CRUD API + frontend (create/edit/delete, is_active toggle, ad-hoc snapshot per process, concept multi-select for `selected` scope)
- **M5** — Scheduled & Event Triggers: APScheduler daily polling job (`run_due_processes`), FX rate fetching from `frankfurter.app` (`fetch_fx_rates`), `ProcessSchedule` lifecycle sync on PUT (cadence change or reactivation recalculates `next_run_at`), `SnapshotTrigger.scheduled` enum value
- **Responsive UI** — Tailwind CSS v4, shared UI primitives (Button, FormField, Badge), full mobile-first visual overhaul of all pages and feature components

**Upcoming milestones:**
- **M6** — Charting: time-series queries over ConceptEntry, D3 dashboard charts (net worth over time, per-concept trends).

## Testing Strategy

All new features from M3 onward are developed TDD: tests are written first (RED), then the implementation makes them pass (GREEN).

- **Backend:** pytest with `pytest-asyncio`. Tests use `aiosqlite` in-memory DB. Each feature has its own test file:
  - `test_formula_engine.py` — table-driven, comprehensive; always add cases here for new formula features
  - `test_concept_model.py` — unit tests for model defaults and carry behaviour logic
  - `test_concept_schemas.py` — pure Pydantic schema validation
  - `test_concepts_crud.py` — integration tests for the Concept CRUD endpoints
  - `test_concept_init.py` — integration tests for `POST /init/concepts` (idempotency, formula eval, group membership)
  - `test_currencies.py` — currency endpoint tests
  - `test_group_evaluation.py` — group aggregation tests
  - `test_processes_crud.py` — Process CRUD + lifecycle sync (cadence change / reactivation recalculates `next_run_at`)
  - `test_process_snapshots.py` — `POST /processes/{id}/snapshots` ad-hoc snapshot trigger
  - `test_scheduled_jobs.py` — `run_due_processes` job (uses `StaticPool` for multi-session in-memory SQLite)
  - `test_fx_service.py` — `fetch_fx_rates` job (httpx mocked with async context manager)
- **Frontend:** Vitest + React Testing Library with jsdom.
  - `features/auth/auth.test.tsx` — auth flows and route guards
  - `features/concepts/ConceptForm.test.tsx` — concept creation form
  - `features/concepts/ConceptList.test.tsx` — concept list rendering
  - `features/concepts/ConceptInitButton.test.tsx` — initialization button states
  - `features/processes/ProcessForm.test.tsx` — create + edit mode, concept picker for `selected` scope
  - `features/processes/ProcessList.test.tsx` — edit inline, active toggle, ad-hoc snapshot
  - `lib/conceptsApi.test.ts` — API client unit tests
  - `pages/DashboardPage.test.tsx` — dashboard integration
