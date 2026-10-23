# GrepThink 2.0 Frontend

React 19, TypeScript and Vite 8. The repo-root [AGENTS.md](../AGENTS.md) covers architecture, roles and gotchas.

## Table of Contents

- [Getting Started](#getting-started)
- [Editor](#editor)
- [Project Structure](#project-structure)
- [Talking to the backend](#talking-to-the-backend)
- [Performance](#performance)
- [Styling](#styling)

## Getting Started

Use Node 24 (what CI runs; `engines` requires >= 22.12). The app reads `VITE_*` variables from the repo-root `.env` (see `.env.example`).

```bash
npm ci               # install from the lockfile
npm run dev          # dev server on :5173; proxies /api to the backend on :5001
npm run lint         # oxlint: any finding fails; the react-hooks and React Compiler rules are errors
npm run lint:design  # no raw hex colours outside the token files
npm run build        # tsc -b && vite build (the type-check gate)
npx vitest run       # unit and component tests
npm run test:coverage  # the same with coverage; thresholds in vite.config.ts fail the run when missed
```

## Editor

In VS Code:

- Lint: the oxc extension (`oxc.oxc-vscode`) reads `.oxlintrc.json`. Disable the ESLint extension for this workspace: the frontend has no ESLint any more.
- Types: the "TypeScript 7" extension (`TypeScriptTeam.native-preview`) runs its own build of TypeScript 7; it does not pick up the workspace's copy yet.

## Project Structure

```
src/
├── App.tsx              # Routes (lazy-loaded pages) inside an ErrorBoundary
├── features/            # One folder per product area
│   ├── auth/            # Sign-in, sign-up, password reset (loaded on demand)
│   ├── app/             # The signed-in app: pages, components, hooks, utils, config
│   ├── landing/  messages/  notifications/
├── lib/
│   ├── api.ts           # `api` facade and re-exported types: import from '@/lib/api'
│   ├── api/             # client.ts (fetch wrapper, ApiError), types.ts, one file per domain
│   ├── auth.tsx         # AuthProvider / useAuth
│   ├── classContext.tsx # Selected class, and your role in a class (useSelectedClassRole / useClassRole)
│   └── lazyModal.ts     # Load a modal's code the first time it opens
├── components/          # Shared UI (Skeleton, ErrorBoundary)
├── assets/
└── styles/              # Design tokens
```

## Talking to the backend

- Call endpoints through `api` from `@/lib/api`. Add new methods to the matching `lib/api/<domain>.ts`; the client is hand-maintained, so confirm the route exists first.
- A failed request throws `ApiError` with `status`, `detail` and `code` (for example `database_unavailable`); its `message` is the server's detail. A 401 dispatches `auth:unauthorized`, and `AuthProvider` signs out locally.
- "View class as student" preview (offered only in a class you teach) is read-only: `apiRequest` refuses writes (`lib/previewGuard.ts`).
- Prefer one request per screen to one request per row. Batch endpoints exist for the common cases, for example `GET /api/assignments/my-submissions`, `GET /api/projects/incoming-join-requests` and `GET /api/classes/attention-summary`. A loop of `api.*` calls is a sign a batch endpoint is missing.
- Read the caller's class role with `useSelectedClassRole()` or `useClassRole(classId)` from `lib/classContext.tsx`; it comes with the class list, so it costs no request. The account role only decides who may create a class (`useAuth().canCreateClasses`).
- Times arrive as instants. Show them in the viewer's zone, with the campus time beside them when the two differ (`features/schedule/scheduleModel.ts` `zoneDiffers` / `viewerZone`); the full rule is in AGENTS.md ("Times").

## Performance

- Every page under `/app` except Home is a `React.lazy` route inside AppView's `<Suspense>`; the auth pages and the contact page load on demand too. Keep it that way: a page imported statically in `App.tsx`, or anything the shell (`AppView`, `Header`, `Sidebar`) imports statically, lands in the entry chunk every visitor downloads.
- Heavy modals use `lazyModal(() => import('./SomeModal'), (p) => p.isOpen)`; Settings is one.
- The Markdown renderer is its own chunk. The header's message previews load it on first open (`lazy` + `Suspense` in `Header.tsx`); nothing in the entry may import `react-markdown` or `MarkdownText` statically.
- `vite.config.ts` splits `react` and `@supabase` into long-lived vendor chunks. Check the `npm run build` output when adding a dependency or a route; the entry chunk (`index-*.js`) is about 180 kB minified, 51 kB gzipped.
- Memoise context provider values with `useMemo`, and keep expensive list work out of the render body.

## Styling

- SCSS with design tokens: `@use '@styles/index.scss' as *;`
- Component styles sit next to their components (`Login.scss` beside `Login.tsx`).
- Use the `--gt-*` tokens instead of raw hex colours; `npm run lint:design` enforces it.
- Icons come from `lucide-react`.
