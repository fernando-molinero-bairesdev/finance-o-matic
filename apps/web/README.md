# finance-o-matic — web

React 19 + Vite frontend for finance-o-matic.

## Tech stack

- **React 19** + **TypeScript**
- **Vite** (dev server + build)
- **TanStack Query** — server state management
- **React Router v7** — client-side routing
- **Tailwind CSS v4** via `@tailwindcss/vite`
- **`@dnd-kit/core`** — drag-and-drop for the Concept Group Board
- **Vitest** + **React Testing Library** — unit/integration tests

## Dev setup

Run from the monorepo root (starts both web and API):

```bash
pnpm dev
```

Or run only the web app (requires the API already running on port 8000):

```bash
cd apps/web
pnpm dev   # http://localhost:5173
```

## Tests

```bash
# All frontend tests
pnpm --filter @finance-o-matic/web exec vitest run

# Single test file
pnpm --filter @finance-o-matic/web exec vitest run src/features/concepts/ConceptForm.test.tsx
```

## Type generation

After backend schema changes, regenerate the TypeScript types from the OpenAPI spec:

```bash
pnpm generate:types   # run from repo root
```
