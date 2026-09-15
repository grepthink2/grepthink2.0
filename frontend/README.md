# GrepThink 2.0 Frontend

React 19, TypeScript and Vite 8. The repo-root [AGENTS.md](../AGENTS.md) covers architecture, roles and gotchas.

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Talking to the backend](#talking-to-the-backend)
- [Performance](#performance)
- [Styling](#styling)

## Getting Started

Use Node 24 (what CI runs; `engines` requires >= 22.12). The app reads `VITE_*` variables from the repo-root `.env` (see `.env.example`).

```bash
npm ci               # install from the lockfile
npm run dev          # dev server on :5173; proxies /api to the backend on :5001
npm run lint         # ESLint: any finding fails; every react-hooks rule is an error
npm run lint:design  # no raw hex colours outside the token files
npm run build        # tsc -b && vite build (the type-check gate)
npx vitest run       # unit and component tests
```

## Project Structure

```
src/
├── App.tsx              # Routes (lazy-loaded pages) inside an ErrorBoundary
├── features/            # One folder per product area
│   ├── auth/            # Sign-in, sign-up, password reset (loaded on demand)
│   ├── app/             # The signed-in app: pages, components, hooks, utils, config
│   ├── classes/  landing/  messages/  notifications/
├── lib/
│   ├── api.ts           # `api` facade and re-exported types: import from '@/lib/api'
│   ├── api/             # client.ts (fetch wrapper, ApiError), types.ts, one file per domain
│   ├── auth.tsx         # AuthProvider / useAuth
│   ├── classContext.tsx # Selected class
│   ├── enrollmentRole.ts  # useEnrollmentRole(classId)
│   └── lazyModal.ts     # Load a modal's code the first time it opens
├── components/          # Shared UI (Skeleton, ErrorBoundary)
├── assets/
└── styles/              # Design tokens
```

## Talking to the backend

- Call endpoints through `api` from `@/lib/api`. Add new methods to the matching `lib/api/<domain>.ts`; the client is hand-maintained, so confirm the route exists first.
- A failed request throws `ApiError` with `status`, `detail` and `code` (for example `database_unavailable`); its `message` is the server's detail. A 401 dispatches `auth:unauthorized`, and `AuthProvider` signs out locally.
- "View as student" preview is read-only: `apiRequest` refuses writes (`lib/previewGuard.ts`).
- Prefer one request per screen to one request per row. Batch endpoints exist for the common cases, for example `GET /api/assignments/my-submissions`, `GET /api/projects/incoming-join-requests` and `GET /api/classes/attention-summary`. A loop of `api.*` calls is a sign a batch endpoint is missing.
- Read the caller's class role with `useEnrollmentRole(classId)`; components share one request.

## Performance

- Pages under `/app` are `React.lazy` routes inside AppView's `<Suspense>`; the auth pages load on demand too.
- Heavy modals use `lazyModal(() => import('./SomeModal'), (p) => p.isOpen)`.
- `vite.config.ts` splits `react` and `@supabase` into long-lived vendor chunks. Check the `npm run build` output when adding a dependency; the main chunk is about 250 kB.
- Memoise context provider values with `useMemo`, and keep expensive list work out of the render body.

## Styling

- SCSS with design tokens: `@use '@styles/index.scss' as *;`
- Component styles sit next to their components (`Login.scss` beside `Login.tsx`).
- Use the `--gt-*` tokens instead of raw hex colours; `npm run lint:design` enforces it.
- Icons come from `lucide-react`.
