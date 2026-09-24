# Group Messaging + Design System Adoption — Design Spec

**Date:** 2026-07-14
**Branch:** `claude/grepthink-design-system-c1d9eb` (cut from `main` @ `da8de51`)
**Status:** Approved by maintainer (pronei) via brainstorming session

## Goals

1. Make the messages backend scalable and add group messaging: per team, a **TA ↔ team**
   channel, an **Instructor ↔ team** channel, and a **members-only team chat** — all
   auto-provisioned; every participant can send.
2. Adopt the GrepThink Design System (from `GrepThink Design System.zip`) app-wide, with
   performance work and smooth, calm animations per the system's motion spec (CSS-first,
   no new animation dependency).

## Decisions made (with maintainer)

| Question | Decision |
|---|---|
| Group shape | Separate staff channels (`team_ta`, `team_instructor`) **plus** members-only chat (`team_members`) — three channels per team |
| Staff scope | Meeting TA (`projects.assigned_ta_id`) + class owner (`classes.created_by`) only |
| Lifecycle | Auto-provisioned per team; anyone in a channel can send first |
| UI/UX scope | Full app-wide sweep, phased A→E |
| Backend architecture | Unified participants model (one conversations table + `conversation_participants` for everything) |
| Motion stack | CSS-first: transitions/keyframes + View Transitions API; no framer-motion |

## Current-state constraints (verified in codebase)

- `conversations(user_a, user_b)` is strictly 1:1 (canonical-order CHECK + unique pair);
  no participants table. Feature files: `backend/app/messages/*`,
  `frontend/src/features/messages/*`, schema in `supabase/schema.sql`.
- Scalability gaps: `list_messages` returns latest 50 with no cursor; inbox endpoint pulls
  up to 5,000 messages into memory per request; every Supabase Realtime event triggers a
  full inbox/thread refetch per participant; no rate limiting on send (slowapi installed
  but unused for messages).
- Roles: `profiles.role ∈ {instructor, student}`; class TAs = `class_enrollments.enrollment_role='ta'`;
  teams are `projects` + `project_members` (TAs deliberately excluded from membership);
  meeting TA = `projects.assigned_ta_id`; review TAs = `project_ta_assignments` (not used here).
- RLS is SELECT-only on messaging tables (scopes Realtime); all writes go through the
  FastAPI backend with the service-role client. Keep this split.
- Frontend: Vite + React 19 SPA, react-router-dom 7, SCSS tokens in `frontend/src/styles/`
  (`$vars`, compile-time only), no Tailwind, no animation lib, lucide-react + react-icons.
- Design system zip (extracted reference): CSS custom-property tokens (`--gt-*` +
  semantic aliases), guidelines, `gt-*` BEM component kit incl. `ConversationListItem`,
  `MessageBubble`, `MessageComposer`, `UnreadBadge`. Known conflicts where **tokens win**:
  error `#DC2626` (not legacy `#ff3b30`), standardized 2px accent-blue focus ring.
  Motion spec: 0.2s ease fast / 0.3s ease medium, popovers 6px slide + fade 0.15s,
  skeleton shimmer 1.4s, `prefers-reduced-motion` respected, no scale transforms
  (press = 0.5px translateY nudge).
- Deployment: Vercel-first; **single shared Supabase project** — migrations must be
  additive + idempotent and are applied manually (via MCP) on maintainer go-ahead.

## Part 1 — Backend

### 1.1 Schema (additive migration: `backend/database/migrations/2026-07-14_group_messaging.sql`)

```sql
-- conversations: add group support
ALTER TABLE conversations
  ADD COLUMN type text NOT NULL DEFAULT 'dm'
    CHECK (type IN ('dm','team_ta','team_instructor','team_members')),
  ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE conversations ALTER COLUMN user_a DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN user_b DROP NOT NULL;
-- integrity: dm rows require the pair; team rows require project_id
ALTER TABLE conversations ADD CONSTRAINT conversations_shape CHECK (
  (type = 'dm' AND user_a IS NOT NULL AND user_b IS NOT NULL AND project_id IS NULL)
  OR (type <> 'dm' AND project_id IS NOT NULL AND user_a IS NULL AND user_b IS NULL)
);
CREATE UNIQUE INDEX conversations_team_channel_uq
  ON conversations (project_id, type) WHERE type <> 'dm';
-- existing canonical-order CHECK + unique pair remain for DMs (columns now nullable;
-- CHECK/UNIQUE pass automatically for NULLs)

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('member','ta','instructor')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_participants_user_idx ON conversation_participants (user_id);

-- keyset-pagination support
CREATE INDEX messages_conv_created_id_idx ON messages (conversation_id, created_at DESC, id DESC);
```

**Backfill (idempotent):** insert two participant rows per existing DM; create the three
channels + participant rows for every existing team (members from `project_members`,
TA seat from `projects.assigned_ta_id` when set, instructor seat from the project's
class owner).

**Sync triggers (SQL, mirroring the existing `bump_conversation_last_message` pattern):**
- `projects` INSERT → create the 3 channels + seed participants.
- `project_members` INSERT/DELETE → add/remove that user (role `member`) in all 3 channels.
- `projects.assigned_ta_id` UPDATE → swap the `ta` participant in the `team_ta` channel.
- `classes.created_by` UPDATE → swap the `instructor` participant in `team_instructor`
  channels of that class's projects.

All functions written to be idempotent (upserts / tolerant deletes).

**Behavioral rules:**
- `team_ta` channels with no TA seat **and** zero messages are omitted from inboxes;
  they appear once a TA is assigned. History survives TA reassignment (members keep it;
  the old TA loses access when their participant row is swapped out).
- Removing a member from a team removes their access (and inbox entry) to all three channels.
- `conversation_reads` / `conversation_deletes` are already per-user and work for groups
  unchanged (hide-until-next-activity applies to channels too).

**RLS:** replace the `user_a/user_b` SELECT policies on `conversations` and `messages` with
participant-based ones (`EXISTS (SELECT 1 FROM conversation_participants p WHERE
p.conversation_id = … AND p.user_id = auth.uid())`). SELECT-only, as today; writes remain
service-role through the backend.

### 1.2 API changes (`backend/app/messages/`)

| Endpoint | Change |
|---|---|
| `GET /api/messages/conversations` | Rewritten inbox: participants join + lateral last-message + per-conversation `COUNT(*) WHERE created_at > last_read_at`. **No more 5,000-message pull.** Response adds `type`, `project_id`, `team_name`, `participants[] {id, name, role}`; `other_user` stays populated for `type='dm'` (stale-client compat). Ordered `last_message_at DESC NULLS LAST`, capped at 200. |
| `GET /api/messages/conversations/{id}/messages` | Adds `before` keyset cursor (`created_at,id`) + `limit` (default 50, max 100); returns `next_cursor`. Enables scroll-up history. |
| `POST /api/messages` | Accepts `conversation_id` (groups + existing DMs) **or** `to_user_id` (new DM; existing eligibility rules unchanged: shared active class, no instructor↔instructor, not self). Group authz = single indexed participant lookup. Rate-limited with slowapi: 30/min per user. |
| `POST …/{id}/read`, `DELETE …/{id}` | Semantics unchanged; authz switches to participant lookup. |
| `GET /api/messages/contacts` (new) | Server-side messageable-users list (name-searchable), replacing the browser's per-class `getClassStudents` fan-out in `NewConversationSearch`. |

**Notifications:** `notify_new_message` notifies all participants except the sender and
drops the students-only early return (TAs/instructors must hear replies). One unread
message-notification per conversation, as today.

### 1.3 Realtime (delta-apply, not refetch)

- **Inbox provider:** one RLS-scoped `postgres_changes` subscription to `messages` INSERTs
  (no column filter — the participant RLS policy scopes delivery). On event: patch that
  conversation's preview/unread/sort in place; full refetch only on (re)connect.
  Conversation UPDATE events (last_message_at bumps) no longer trigger refetches.
- **Open thread:** keep the per-conversation INSERT subscription but **append** the event
  row (sender resolved from the participants already in state), deduped by id against the
  optimistic message (which is reconciled by the POST response, as today).
- Fix stale "polling" comments in `useUnreadTotal.ts` and `ConversationThread.tsx`.

## Part 2 — Frontend (phased sweep)

### Phase A — Foundations
- Vendor `tokens/{colors,typography,spacing,fonts}.css` into `frontend/src/styles/tokens/`
  and load globally (single import). Fira Code added for IDs/codes.
- Rewire SCSS `$vars` in `_colors.scss`/`_variables.scss`/`_fonts.scss` to the token values;
  fix conflicts: `$error-color → #DC2626` (sidebar unread badge keeps `#ff3b30` per spec),
  global standardized `:focus-visible` ring (`--gt-focus-ring`).
- New `_motion.scss`: transition presets (fast .2s / medium .3s ease), popover
  enter (6px slide + fade .15s), press nudge (0.5px translateY), and a global
  `prefers-reduced-motion` kill switch. View Transitions API wiring for react-router
  route changes.

### Phase B — Messages rebuild (on the new backend)
- Unified inbox (channels + DMs by `last_message_at`) with type badges (TA / Instructor /
  Team) per `ConversationListItem` idiom; compose remains DM-only (groups are auto-provisioned).
- Thread: sender name + avatar on group bubbles (not DMs), day separators, scroll-up
  infinite history (IntersectionObserver + cursor), optimistic send pending→confirmed,
  bubble enter animation per motion spec, scroll anchoring.
- `NewConversationSearch` switches to `GET /api/messages/contacts`.
- Skeletons + empty states per kit; floating `MessageWidget` restyled.

### Phase C — App shell
- Sidebar to kit spec (green 256px, half-pill active indicator, 64px collapse,
  off-canvas < 768px), toast stack bottom-right, route-transition polish.

### Phase D — High-traffic pages
- Dashboard (StatCard), classes/rosters (RosterRow, Table + mobile card collapse),
  projects (ProjectCard, TeamMemberCard), TSR forms, assignments (AssignmentCard),
  meetings (MeetingCard) — token-referencing SCSS + kit idioms, skeletons everywhere.

### Phase E — Remainder + adherence + performance
- Settings/auth/misc views; wire the zip's `_adherence.oxlintrc.json` into an npm lint
  script (flags non-token colors); route-level code splitting (`React.lazy`) and
  memoized hot list rows.

## Testing

- **Backend (pytest, existing TestClient+MagicMock harness):** participant authz matrix
  (member / TA / instructor / outsider × each channel type), DM eligibility unchanged,
  keyset pagination (ordering, cursor stability, limits), unread-count math, rate limit,
  DM-compat response shape, contacts endpoint.
- **Migration SQL:** reviewed for idempotency; backfill re-runnable (`ON CONFLICT DO NOTHING`).
- **Frontend (Vitest):** inbox delta-apply reducer (patch/reorder/unread), thread
  append/dedupe against optimistic sends, cursor pagination hook.
- **Manual:** preview servers (note: previews are pinned to a worktree — verify against
  build output), exercising student/TA/instructor lenses.

## Rollout

- Migration applied to the shared Supabase project via MCP **only on maintainer go-ahead**,
  after code review. Additive + idempotent; old backend/clients keep working pre-deploy
  (`type` defaults to `'dm'`, old policies replaced in the same migration as the new
  policies — deploy backend promptly after applying).
- Work lands on this branch in phase-ordered commits (backend → A → B → C → D → E).

## Out of scope (v1)

Dark mode, attachments, message edit/delete, typing indicators, per-member seen-by in
group threads, ad-hoc group creation, review-TA channel membership.
