# Audit — frontend data fetching, structure, render performance, bundle (2026-09-08)

> Paths under `frontend/src`. Line numbers refer to commit `613e4d1`.
> **Done since:** deps upgraded (`50b36b0`), `envPrefix` leak fixed (`288e66a`),
> brand icons replaced (lucide 1.x). Everything else below is open (plan Tasks 9–10).

## 1. Mount-time fetch map

Always mounted under `/app/*`: `ClassProvider` → `api.getClasses()` (`lib/classContext.tsx:131`);
`Header.tsx:170` → `/api/profiles/me`; `Sidebar.tsx:51` → `getMyEnrollmentRole(classId)`;
`useNotifications.tsx:35` → `getNotifications()` + Realtime; `useConversations.tsx:52` →
`getConversations()` + Realtime.

- **Student `/app/home` (`StudentHomeDashboard.tsx`)**: ~14 requests; `getProjects()` fires
  3× (`:363`, `:465`, `:527`) and `getProjects(classId)` 3× (`:364`, `:466`, `:528`) in the
  same tick; deadlines effect is a 3-deep waterfall (`:464-466`) then a fan-out of
  `getProjectTsrs` per my-project (`:474-485`); incoming requests fan out
  `getProjectJoinRequests` per reviewable project (`:371-391`).
- **Instructor home**: `getClassRoster(cls.id)` per active class (`:85-88`), only two
  aggregates used.
- **`RequestsModal.tsx:116-199`**: verbatim copy of the dashboard's requests pipeline (4
  calls + fan-out) re-issued when the modal opens.
- **`Assignments.tsx:82-218`**: 3 sequential awaits, then `getMyAssignmentTsrs` per TSR
  assignment (`:128-145`) and `getMyFeedback` per feedback assignment (`:151-160`).
- `Dashboard.tsx:59-65`, `Roster.tsx`, `TAManagement.tsx:31-35`, `CreateProject`,
  `MyProject`, `Assign`/`Staffing`: parallel `Promise.all` — fine.
- `Projects.tsx:82-85`: `getClassProjectsOverview` already returns `students`; the extra
  `getClassRoster` is redundant. Effect deps use the whole `selectedClass` object
  (`Projects.tsx:107`, `MyProject.tsx:80`) → refetch on any context refresh.
- `FinalReviews.tsx:132-144`: dependent waterfall for `getClassTAs`.
- `TAScheduleView.tsx:126-142`: **sequential `for…await` of `getTeamAttendance` per team**.
- `MyClasses.tsx:99`: 30 s `setInterval` → `getClasses()` (the only poll).

## 2. Client-side N+1 (ranked) → replacement

1. `TAScheduleView.tsx:126-142` per-team attendance (10-25 serial) → `viewer_status` on
   `get_ta_schedule` teams (plan 7e/10a).
2. `InstructorHomeDashboard.tsx:85-88` full roster per class → `GET /api/classes/attention-summary`.
3. `StudentHomeDashboard.tsx:474-485` `getProjectTsrs` per project → assignments payload
   with `include=my_submissions`.
4. `Assignments.tsx:128-145` + 5. `:151-160` → same `include=my_submissions`.
6. `StudentHomeDashboard.tsx:371-391` + 7. `RequestsModal.tsx:139-159` `getProjectJoinRequests`
   per project → `GET /api/projects/incoming-join-requests?class_id=`.
8. `TSRS.tsx:284-300` write fan-out per member → batch endpoint (follow-up).
9. `FinalReviewDetail.tsx:438-442` sequential `saveFinalReviewScores` per role → one body
   (follow-up).

## 3. Redundant refetching

- `getProjects()` / `getProjects(classId)`: 13 call sites across StudentHomeDashboard,
  RequestsModal, Assignments, CreateProject, MyProject, Dashboard; every consumer re-derives
  `mineInClass` client-side. Candidate: a `ProjectsContext` or `GET /api/classes/{id}/my-projects`.
- `getMyEnrollmentRole(classId)`: Sidebar, RequireReviewAccess, FinalReviews, TAMeetings,
  ProjectView — three mounted at once on `/app/ta-review/final-reviews` → `useEnrollmentRole`
  context (plan 10c).
- `/api/profiles/me`: Header + Settings (always mounted) + AuthCallback + CompleteProfile.
- `getClassRoster`, `getClassStudents`, `getClassProjects`, `getProjectMembers`,
  `getAssignments`, `getClassTAs`/`getClassTaRoster`: 3-6 callers each, none cached.
- `useNotifications.tsx:87` refetches everything on every Realtime event
  (`useConversations` applies deltas properly).

## 4. Fetch wrapper (`lib/api.ts:650-723`) and error handling

- `supabase.auth.getSession()` awaited on **every** call; no cached token.
- Errors: `new Error(detail || 'Request failed with status N')` — **HTTP status discarded**;
  no `AbortController`, no retry, **no 401 handling** (nothing bridges a 401 to sign-out).
- `apiUpload` duplicates the wrapper; `checkEmail` bypasses it.
- Components: 53 silent `catch {}` blocks (e.g. `StudentHomeDashboard.tsx:387-389, 410-411,
  492-493`), 17 files `console.error` only (incl. `classContext.tsx:144` — the root data
  load), and the good `try/catch → error state` pattern in ~8 pages.
- **No `ErrorBoundary`** anywhere; the four `throw new Error('useX must be used within…')`
  and a failed lazy chunk blank the whole app.
- Loading states are well factored (`components/Skeleton`, used in 42 files).

## 5. Structure and duplication

Over 500 lines: `StudentHomeDashboard.tsx` (1155; deadlines logic + avatar helpers +
permission policy + 3 fetch pipelines + mutations + 4 card UIs), `FinalReviewDetail.tsx`
(987), `InviteModal.tsx` (830; a rich-text editor + an email composer), `ProjectView.tsx`
(700), `TSRView.tsx` (595), `FinalReviews.tsx` (583), `MemberManagerModal.tsx` (554, 15
`useState`), `Assign.tsx` (539, well memoised), `RequestsModal.tsx` (524), `Header.tsx`
(506; 84-line breadcrumb `if` chain duplicating the route table).

Exact duplicates between `StudentHomeDashboard.tsx` and `RequestsModal.tsx`:
`initialsFromEmail` (`:111` / `:47`), `avatarBgFromEmail` (`:253` / `:70`, same comment),
`displayNameFromParts/FromEmail` (`:119` / `:56`), `JOIN_REVIEW_ROLES` +
`canReviewJoinRequests` (`:240` / `:39`), `formatAwaitingMeta`/`formatRequestedMeta`
(`:296` / `:80`), and the row types `IncomingJoinRequestRow`/`IncomingRequestRow`,
`OutgoingJoinRequestRow`/`OutgoingRequestRow` → `features/app/utils/joinRequests.ts` (plan 10b).

Other duplication: 4 avatar/initials implementations (`utils/memberUtils.ts:8` is
canonical); 6 date-formatting idioms (`lib/dateUtils.ts:56` is the tz-correct one); 12
hand-rolled modal shells (no focus trap, no portal; follow-up); 5 badge renderers;
`StaffingTable.tsx:44-80` ignores `useTableSort`; ad-hoc types that re-project api types
(`rosterTypes.UiStudent`, `ProjectList.UiProject`, `taTypes`, `tsrsTypes`, `SlicePayloadItem` ×2).

## 6. Render performance

- `React.memo` used once (`GradientBackGroundWrapper.tsx:35`).
- Context values recreated every render: `classContext.tsx:188-203`,
  `useNotifications.tsx:103-105`, `useConversations.tsx:103` (auth/preview are memoised).
- Render-body work: `StudentHomeDashboard.tsx:349` (`displayDeadlines` map),
  `StaffingTable.tsx:57` (sort), `Header.tsx:180` (breadcrumbs) and `:401/:404` (unread
  filter twice), `ConversationThread.tsx:225-243` (2× `Date` per message).
- Unvirtualised, unmemoised lists: `RosterList.tsx:174-240` (30-120 rows, re-renders per
  keystroke), `ProjectList`, `StudentAssignmentsTable`, `ConversationThread`
  (`MessageBubble` not memoised), `ConversationList`, `TAManagement.tsx:166-281`.
- Inline props defeating memo: `Roster.tsx:321` `invitingEmails={new Set()}` (always
  empty), `Projects.tsx:136-148`, `Roster.tsx:319-326`, `AppView.tsx:80-108` (outlet
  context object + handlers not `useCallback`).

## 7. Bundle (main chunk 761 kB min / 218 kB gzip, measured)

Per-package minified bytes in `index-*.js`: react-dom 175 kB, app components 107 kB,
@supabase/auth-js 80 kB, date-fns 46 kB, **react-day-picker 39 kB (eager, for the
closed-by-default CreateClassModal via `AppView.tsx:7`)**, react-router 39 kB, pages
37 kB, realtime 32 kB, storage 19 kB, lucide 12 kB, react-icons 10 kB (11 barrels for
~14 glyphs: `features/app/config/sidebar.ts:1-9`, `Sidebar.tsx:3`, messages ×3),
react-gradient-animation 4.6 kB (eager via the 8 statically imported auth pages).

`App.tsx` already lazy-loads 13 routes (recharts and react-markdown are correctly out of
the eager path). Levers: lazy the auth pages and the create/join/assignment modals; replace
react-icons with lucide; vendor split (Vite 8: `build.rolldownOptions.output.codeSplitting`
/ `advancedChunks` rather than rollup's `manualChunks` — the build warning names the option).
