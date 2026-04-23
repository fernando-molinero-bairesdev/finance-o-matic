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

## Architecture

### Backend (`apps/api`)

**Entry point:** `app/main.py` — Configures FastAPI app, CORS middleware, mounts auth routes via fastapi-users, and defines lifespan for DB initialization.

**Auth:** `app/auth/users.py` — Uses [fastapi-users](https://fastapi-users.github.io/) with JWT strategy. The `current_active_user` FastAPI dependency is the standard way to protect routes.

**Database:** `app/core/db.py` — SQLAlchemy 2.0 async engine + session factory. All models inherit from a shared `Base`. Sessions are provided via a `get_async_session` dependency. The same codebase switches between SQLite (local) and Postgres (production) via `DATABASE_URL`.

**Models:**
- `Concept` — Core entity. `ConceptKind` enum: `value` (literal), `formula` (references others), `group` (aggregates), `aux` (auxiliary/reference-only).
- `ConceptDependency` — Tracks edges in the concept DAG for UI visualization and cycle detection.
- `Currency` / `FxRate` — Reference tables for multi-currency support.

**Formula Engine (`app/services/formula/engine.py`):** The most critical service. Uses Python's `ast` module + `simpleeval` for safe, sandboxed formula evaluation — no `eval()` of untrusted strings. Key functions:
- `parse_formula()` — Validates syntax; only allows whitelisted operators and functions (`sum`, `min`, `max`, `if_`).
- `extract_reference_names()` — Extracts which concept names a formula depends on.
- `detect_cycles()` — DFS cycle detection on the concept dependency graph.
- `evaluate_concept_by_id()` — Recursive evaluation with memoization.

**API routes:** All under `/api/v1/`. Auth routes (`/auth/register`, `/auth/jwt/login`, `/users/me`, etc.) are mounted by fastapi-users. Custom routes are in `app/api/v1/`.

### Frontend (`apps/web`)

**Auth flow:** `AuthProvider` (React Context) holds the current user and JWT token. `PrivateRoute` guards protected pages. `apiClient.ts` is a thin fetch wrapper that attaches the bearer token from context.

**State management:** TanStack Query (React Query) for all server state. React Context only for auth.

**Routing:** React Router v7. Public routes: `/login`, `/register`. Protected routes: `/` (dashboard) and future pages.

**Dashboard:** `pages/DashboardPage.tsx` is currently a placeholder — this is where the main concept graph UI will live.

### Data Flow

1. User authenticates → JWT stored in React Context (and likely localStorage)
2. Frontend fetches/mutates concepts via `apiClient.ts` → TanStack Query cache
3. Backend evaluates concepts by resolving the DAG via the formula engine
4. Formula results are returned as evaluated numeric values per concept

## Current Development Stage (M1)

Authentication, core data models, and the formula engine are complete. The concepts CRUD endpoints are partially scaffolded. The dashboard UI is a placeholder.

Upcoming milestones: concept CRUD UI, groups/aggregation, FX rate integration, historical snapshots, and charting.

## Testing Strategy

- **Backend:** pytest with `pytest-asyncio`. Tests use `aiosqlite` in-memory DB. The formula engine tests (`test_formula_engine.py`) are table-driven and comprehensive — always add cases there for new formula features.
- **Frontend:** Vitest + React Testing Library with jsdom. Auth flows and route guards are tested; add tests to `features/auth/auth.test.tsx` for auth changes.
