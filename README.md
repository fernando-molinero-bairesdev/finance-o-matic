# finance-o-matic

A personal finance graph modeling tool. Define financial concepts (balances, loans, income streams, etc.) as a directed acyclic graph (DAG), link them with formulas, and take periodic snapshots to track net worth over time.

## Features

- **Concept DAG** — values, formulas, groups (many-to-many membership), and auxiliary reference concepts
- **Formula engine** — sandboxed `ast`/`simpleeval` evaluation with `sum`, `min`, `max`, `if_` built-ins and cycle detection
- **Multi-currency** — FX rates fetched daily from frankfurter.app; per-concept currency
- **Entity system** — bind concepts to entity types (Account, Loan, Asset…) for per-entity ledger lines
- **Snapshots** — open → processed → complete state machine with carry-forward logic
- **Processes** — reusable snapshot templates with daily/weekly/monthly/quarterly cadences; APScheduler automation
- **Charting** — concept history trend charts on Dashboard and Reports

## Monorepo structure

```
apps/
  api/     FastAPI + SQLAlchemy backend (Python 3.11+)
  web/     Vite + React 19 + TypeScript frontend
packages/
  types/         Auto-generated TypeScript types (from OpenAPI schema)
  ui/            Shared React component library
  formula-spec/  Formula grammar documentation
infra/
  compose/  Docker Compose configs for Postgres-backed local dev
```

## Quick start

**Prerequisites:** Node 20+, pnpm 9+, Python 3.11+

```bash
# 1. Install all dependencies
pnpm install

# 2. Configure environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — set DATABASE_URL (SQLite for local dev):
#   DATABASE_URL=sqlite+aiosqlite:///./dev.db

# 3. Apply database migrations
pnpm db:migrate

# 4. Start everything
pnpm dev
#   API → http://localhost:8000
#   Web → http://localhost:5173
```

### Docker-based dev (Postgres)

```bash
docker compose -f infra/compose/docker-compose.yml \
               -f infra/compose/docker-compose.dev.yml up --build
```

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start web + API in dev mode |
| `pnpm build` | Build all apps |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all apps (ESLint + Ruff) |
| `pnpm typecheck` | Type-check all apps (tsc + mypy) |
| `pnpm db:migrate` | Apply pending Alembic migrations |
| `pnpm db:downgrade` | Roll back one migration |
| `pnpm generate:types` | Regenerate TypeScript types from OpenAPI |

## Auth quickstart

Register a user:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"MyS3cur3P@ss!"}'
```

Log in (returns `access_token`):

```bash
curl -X POST http://localhost:8000/api/v1/auth/jwt/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=you@example.com&password=MyS3cur3P@ss!"
```

## Further reading

- [Web app README](apps/web/README.md)
- [CLAUDE.md](CLAUDE.md) — full architecture reference for AI-assisted development
