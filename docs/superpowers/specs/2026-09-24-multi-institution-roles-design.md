# Multi-Institution Roles: Per-Class Roles and Institutions — Design Spec

**Date:** 2026-09-24
**Branch:** `claude/multi-domain-role-design-8dca42` (cut from `origin/beta` @ `551da7d`)
**Status:** The data model and frontend were agreed with the maintainer section by section. The
backend section comes from an endpoint-by-endpoint audit and is reviewed with this spec. Nothing is
implemented or applied yet.

## Problem

Scott is a TA on PROD (UCSC, CSE 115C) and is moving to İstinye University as an instructor. They
need one account that is a TA in one class and the instructor of another, at two schools.

GrepThink has no institution concept: no table, no column on `classes`, and a "school email" is any
address ending in `.edu`. Roles live on two layers:

- **Account:** `profiles.role` ∈ {instructor, student}, written once at signup.
- **Class:** instructor = `classes.created_by`; TA or student = `class_enrollments.enrollment_role`.
  `app/core/authz.py` already checks access class by class.

The class layer can already express "TA here, instructor there", but the account role overrides it
in the places listed under Backend → "Account-role branches". What Scott's options are today:

| Option | Result |
|---|---|
| Stay `student` | Cannot create the İstinye class. |
| Maintainer sets `role = 'instructor'` | Can create it, but their UCSC classes vanish from the class list, they can't message the UCSC instructor, UCSC assignments answer 403, and UCSC projects start showing them instructor-only team sentiment. |
| Second account | Works with no code; two logins and a split inbox. |

İstinye addresses end in `.edu.tr`, which every `.edu` check rejects, so İstinye students could never
verify a school email.

## Goals

1. One account holds a different role in each class: instructor, TA or student.
2. Classes belong to an institution; school-email rules come from the institution's domains.
3. Single-role, single-school users see no change beyond the two listed under Frontend → "Visible
   changes".
4. Scott TAs at UCSC and teaches at İstinye with one login.

## Non-goals

- Institution memberships, institution admins, or vetting who may be an instructor (stays
  self-serve).
- A self-service "I also teach" upgrade (maintainer SQL instead, D4).
- Several verified school emails per person (`edu_email` stays one address).
- Per-institution settings (term system, timezone, locale, SSO). The term system is the first
  candidate (Follow-ups).
- TA-specific navigation (TAs keep the student menu plus TA Review) and a combined multi-role Home.

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | A role belongs to a class membership. `profiles.role` only means "may create classes". | Keep the account role as a UI mode | The class layer already holds the truth; the account role is what breaks Scott's case. |
| D2 | Instructor stays self-serve at signup. | Domain-verified instructors; per-institution approval | Keeps the schema change to one table and one column; same risk as today. |
| D3 | Maintainers add institution rows. | Instructors create them; infer from email domain | New schools are rare; avoids duplicates and anyone claiming another school's domain. |
| D4 | An existing account gains class creation through a maintainer `UPDATE`. | "I also teach" toggle; open class creation to all | The toggle secures nothing and needs cache and ordering work; open creation puts "Create class" in every student's UI. |
| D5 | The selected class decides the UI, Home included. | A global role toggle | One rule everywhere; single-role users unchanged. |
| D6 | The school is chosen inside the app: a row in the profile dropdown, first item, expanding in place, shown only when active classes span 2+ schools, plus a school caption under the class name for those accounts. | Picker at login; switcher above the class switcher; grouped class list | Login happens before we know your schools and a mid-session switch is needed anyway; the sidebar stays unchanged for everyone else. Revisit if schools get their own SSO. |
| D7 | Switching class lands on the new role's page when the current page isn't allowed: instructor → Dashboard, TA → TA Meetings, student → My Project. | Always go to Home | Each role's most useful page; TAs stop landing on an empty My Project. |
| D8 | Remove `role` and `realRole` from `useAuth()`. | Keep them, deprecated | `npm run build` then lists every consumer, so none can be missed. |
| D9 | `.edu` stays a valid school email alongside institution domains. | Institution domains only | US schools that haven't been added keep working. |

## Architecture at a glance

```
profiles.role ──────────────► canCreateClasses        (gates Create Class, nothing else)

institutions ─< classes ─┬─ created_by ─────────────► my_role = instructor
                         └─< class_enrollments ─────► my_role = ta | student
                                      │
               GET /api/classes  (my_role + institution on every class)
                                      │
ClassContext ─┬─► useClassRole ──────► sidebar · route guard · header · pages
              └─► schools / currentSchool ─► profile-menu school switcher · class switcher
```

## Data model

New migration `backend/database/migrations/2026-09-24_institutions.sql` (expand only, idempotent),
mirrored in `supabase/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.institutions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,                 -- 'UC Santa Cruz'
  slug          text        NOT NULL UNIQUE,          -- 'ucsc'
  email_domains text[]      NOT NULL DEFAULT '{}',    -- {'ucsc.edu'}
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;   -- no policies: service role only
REVOKE ALL ON public.institutions FROM anon, authenticated;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institutions(id);
CREATE INDEX IF NOT EXISTS idx_classes_institution_id ON public.classes (institution_id);

INSERT INTO public.institutions (name, slug, email_domains)
VALUES ('UC Santa Cruz', 'ucsc', '{ucsc.edu}')
ON CONFLICT (slug) DO NOTHING;

UPDATE public.classes
SET institution_id = (SELECT id FROM public.institutions WHERE slug = 'ucsc')
WHERE institution_id IS NULL;
```

- The header follows the repo convention (`Applied: DEV ____-__-__   PROD ____-__-__`). The PROD copy
  is staged under `migrations/prod/`, which nothing runs automatically.
- `institution_id` stays nullable until the contract step (Rollout 6).
- İstinye is added by a maintainer when Scott needs it (Rollout 3).

## Backend

### What still reads the account role

Only `POST /api/classes`, through `require_instructor`. `POST /api/classes/join` also requires that
a role has been chosen (either one), so the `/select` onboarding step keeps its meaning.
`/api/login-check` keeps returning the role.

### Endpoints that drop `require_instructor`

Each keeps a class-owner check in its controller (verified in the audit):

| Module | Endpoints | Owner check that stays |
|---|---|---|
| classes | update status, invite, roster timeline, upload roster, manual roster add/delete, turn-in stats, remove student, bulk invite, queue invite | `_require_owner` → `authz.require_class_instructor` |
| classes | cancel invite | matches `instructor_id = caller`; add `_require_owner` so the rule reads the same everywhere |
| tas | promote, demote, list TAs | `_owner_check` |
| tas | review window, review Zoom | `_require_class_instructor` |
| tas | final review time | `_owns_class` |
| assignments | create, update, delete (drop the private `_require_instructor` profile lookup) | `_require_class_instructor` |

A student or a non-owner instructor now gets 403 `Only the class instructor can do this` from these
instead of `Instructor role required`; the status code is unchanged.

### Account-role branches that become per-class

| Where | Today | Becomes | Breaks without it, once Scott is flipped |
|---|---|---|---|
| `classes/controller.py` `get_classes_for_user` | Instructors get owned classes, everyone else enrolled ones | Owned ∪ enrolled, each with `my_role` and `institution` | UCSC classes vanish |
| `classes/views.py` `join_class` | Students only | Any account with a chosen role; 409 when the caller owns the class | Can't join; an owner could enrol in their own class |
| `classes/controller.py` `_project_cards` (used by projects and projects-overview) | Sentiment when the account is instructor | Sentiment when `access["is_instructor"]` (the class owner) | Instructor-only team sentiment shows for Scott at UCSC |
| `assignments/controller.py` `get_assignments_for_class` | Account instructor must own the class | Owner → all assignments + stats; enrolled → published; anyone else → 403 | UCSC assignments answer 403 |
| `projects/controller.py` `create_project`, `update_project` | Account instructor + owner, or account student + enrolled | Owner, or enrolled (student or TA) | Nothing visible (parity); removes the account read |
| `classes/controller.py` invite (`:698`), bulk invite (`:1689`, `:1733`) | Only account students get enrolled | Any account except the class owner | Scott can't be invited to a class to become its TA |
| `messages/controller.py` `can_message`, contact search (`:562`) | No instructor↔instructor | Rule dropped; a shared class is still required, and a class has one instructor | Scott can't message the instructor they TA for |
| `auth/controller.py` role cache comment | "a chosen role never changes" | Changes by maintainer flip; visible within the 60 s TTL | Nothing (comment only) |

### School email

`app/core/school_email.py` exposes `is_school_email(email) -> bool`. It is true when the domain ends
in `.edu`, equals an institution domain, or is a subdomain of one (`stu.istinye.edu.tr` matches
`istinye.edu.tr`; `evil-istinye.edu.tr` does not). Institution domains are read with the service
client and cached in process for five minutes. It replaces the `.edu` checks in `auth/views.py`
(`:119`, `:146`, `:262`), `profiles/controller.py` (`:43` mailbox regex, `:149`) and
`notifications/controller.py` (`:216`, `:241`). User-facing text changes from ".edu email" to
"school email", including the verification email subject.

### Routes

- `GET /api/classes`: every class gains `my_role: 'instructor' | 'ta' | 'student'` and
  `institution: {id, name, slug} | null` (a PostgREST embed).
- `GET /api/institutions` (new module `app/institutions/`): public, `@limiter.limit("60/minute")`,
  `Cache-Control: public, max-age=300`; returns `{institutions: [{id, name, slug, email_domains}]}`.
  It is public because SignUp validates the email before the user is signed in.
- `POST /api/classes`: optional `institution_id` (400 when unknown; stored as NULL when omitted);
  required after the contract step.
- `POST /api/classes/join`: see the table above.
- `GET /api/tas/classes/{id}/my-role` stays; the frontend stops calling it (Follow-ups).

The matching `api.ts` methods and `.well-known/grepthink-actions.json` entries are updated
(`join_class` → `any`, new `list_institutions`).

## Frontend

### Role source

- `ClassContext`: `Class` (and `ApiClass`) gain `my_role` and `institution`. New
  `useClassRole(classId?)` returns the role in the given class, the selected class by default:
  `undefined` while loading, `null` when not a member. During "view class as student" preview it
  reports `student` for the previewed class. It replaces `useEnrollmentRole` and
  `fetchEnrollmentRole`; `lib/enrollmentRole.ts` is deleted.
- `useAuth()`: `role`, `realRole` and `isPreviewing` are removed and `canCreateClasses`
  (`profiles.role === 'instructor'`) is added. `needsRole` and the `/select` redirect are unchanged.
  Components read preview state from `usePreview()`.
- The class list re-fetches when the tab regains focus, at most every 30 s, so a newly promoted TA
  sees TA Review about as quickly as with today's 30 s role cache.
- Rollout safety: when `my_role` is missing (new frontend, old backend) it is derived as
  `created_by === user.id ? 'instructor' : 'student'`.

### Layout

- **Sidebar, main section:** Home, Messages, My Classes, then Create Class when `canCreateClasses`,
  otherwise Join Class.
- **Sidebar, class section:** chosen by the class role: instructor items; student items plus TA
  Review for TAs; hidden when no class is selected.
- **Class switcher:** when active classes span 2+ schools, it lists only the current school's
  active classes and shows the school as a caption under the class name. A role label appears per
  class only when the listed classes mix roles.
- **School switcher:** first item in the header profile dropdown ("School: İstinye University ▾"),
  expanding in place with the sidebar's group pattern so it works with touch and keyboard. Shown
  only when active classes span 2+ schools; it lists the schools that have active classes, plus the
  current school if its classes have all finished. Picking a school closes the menu, selects the last class
  used there (`localStorage` map `grepthink-last-class-by-school`, falling back to that school's
  first active class), applies the landing rule, and ends any preview. `ClassContext` exposes
  `schools`, `currentSchool` (read from the selected class, so nothing new is stored) and
  `selectSchool(id)`.
- **Landing rule** (`routePermissions.ts`: `isPathAllowedForClassRole`, `classLandingPath`): stay on
  the page when the new class role allows it, else instructor → `/app/dashboard`, TA →
  `/app/ta-meetings`, student → `/app/my-project`. The class switcher, the school switcher and My
  Classes cards all use it.
- **Route guard:** moves from `AppView`, which runs before `ClassProvider` exists, into
  `ClassProvider`. It waits for the class list and checks the path against the selected class's
  role; with no class selected, class pages redirect to My Classes. The instructor-only and
  student/TA-only path lists stay as they are, minus the `/app/join-class` placeholder.
- **Header:** breadcrumbs and the instructor-only class details follow the class role. "View as
  Student" becomes "View class as student", offered only in classes you own; switching class or
  school ends it.
- **Home:** the instructor dashboard when you own the selected class, the student dashboard
  otherwise; with no classes, chosen by `canCreateClasses`.

### Pages

- **My Classes:** each card is rendered from its own `my_role` (owner card with code and settings;
  TA or student card with Leave), with a section per school when there is more than one. Toolbar:
  Create Class and Join Class when `canCreateClasses`, Join Class otherwise.
- **Create Class modal:** a required Institution select from `GET /api/institutions`, defaulting to
  the current school, or to the only institution when there is one. Term buttons unchanged
  (Follow-ups).
- **Per-class role instead of the account role:** ProjectView, MemberManagerModal, ProjectDetails,
  CreateProject, Roster, RequireReviewAccess, TAMeetings and FinalReviews. FinalReviewDetail already
  uses the backend's `viewer_role`.
- **TA Management:** drop the `s.role !== 'instructor'` filter (`TAManagement.tsx:78`). It filters
  on the account role and would hide accounts like Scott's from promotion.
- **Settings:** the school-email and portfolio fields show when the account is a student or holds a
  TA or student role in any class.
- **School email:** `lib/schoolEmail.ts` `isSchoolEmail(email, institutions)` mirrors the backend
  rule and replaces `.endsWith('.edu')` in Settings, AccountDetails and SignUp; labels read "School
  email".
- **Deleted:** `features/classes/pages/ClassManagement.tsx` and its `/classes` route. Nothing links
  to it, and it branches on the account role.

### Visible changes for existing users

TAs land on TA Meetings instead of My Project, and the sidebar's class section is hidden when no
class is selected. Everything else looks the same for single-role, single-school accounts.

## Edge cases

- `institution: null` (a class created between the backend deploy and the contract step): no
  caption, and not counted by the school switcher.
- A school whose classes have all finished is not offered by the switcher; its classes stay
  reachable from My Classes.
- A maintainer flips a role while the user is signed in: the backend honours it within 60 s; Create
  Class appears after the next page load.
- Joining a class you own: 409, shown in the Join modal.
- Leaving or losing the selected class: the existing `ClassProvider` fallback picks another class and
  the guard re-checks the page.

## Testing

Backend (pytest with `FakeSupabase`, in the existing files where they fit):

- `test_classes_create_and_list.py`: owned ∪ enrolled with `my_role` and `institution`;
  `institution_id` on create; an unknown institution → 400.
- New `test_class_scoped_roles.py`, parametrized over every endpoint that dropped
  `require_instructor`: an enrolled student and a non-owner instructor get 403 and write nothing; an
  owner whose account role is `student` gets through.
- Join: an account instructor can join; the owner → 409; a role-less account → 403.
- An account instructor enrolled as TA: sentiment hidden; the assignments list returns published
  items instead of 403.
- Invite and bulk invite enrol an account instructor; inviting the owner → 400.
- `test_messages_can_message.py`, `test_messages_contacts.py`: an account-instructor TA and the class
  instructor can message and find each other.
- `is_school_email`: `.edu`, `istinye.edu.tr`, `stu.istinye.edu.tr` pass; `evil-istinye.edu.tr`,
  `istinye.edu.tr.example.com`, `gmail.com` fail; the domain cache refreshes.
- `GET /api/institutions`: public, response shape, limiter applied.
- `test_authz_status_policy.py`: the assignments row that expects `Instructor role required` now
  expects `Only the class instructor can do this`.

Frontend (Vitest; `npm run build` is the completeness check for D8):

- `useClassRole`: loading, non-member, preview overlay.
- `routePermissions`: the path table and `classLandingPath`.
- Sidebar: owner, TA and student classes; Create vs Join by `canCreateClasses`.
- School switcher: hidden with one school; lists schools with active classes; picking one selects
  the remembered class.
- My Classes: a mixed-role list renders both card types.
- Class switch: redirects when the current page isn't allowed.
- Update the six test files that mock the account role or the enrollment-role hook: `authRole`,
  `enrollmentRole` (becomes the `useClassRole` test), `FinalReviews.timeEdit`, `Settings.eduEmail`,
  `apiFacade`, `RoleSelection`.

## Rollout

1. Apply the institutions migration to DEV, then PROD (maintainer; staged file). It must come before
   the backend deploy, because the class list embeds `institutions`.
2. Merge and release (beta → main). The backend works with the current frontend, and the new
   frontend tolerates a missing `my_role` (see Role source).
3. Seed İstinye: `INSERT INTO public.institutions (name, slug, email_domains) VALUES ('İstinye
   University', 'istinye', '{istinye.edu.tr}');`. Confirm the base domain with Scott first; student
   subdomains match automatically.
4. Flip Scott: `UPDATE public.profiles SET role = 'instructor' WHERE id = '<Scott''s profile id>' AND
   role = 'student';`. Only after step 2 is live on PROD; before that, their UCSC classes disappear.
5. Scott creates the İstinye class and picks İstinye in the dialog.
6. Contract, later: assign any NULL `institution_id`, `ALTER COLUMN institution_id SET NOT NULL`,
   and make `institution_id` required in `CreateClassRequest`.

Steps 1 and 3–6 are maintainer steps; their runbook goes in `supabase/README.md`.

## Docs to update

`AGENTS.md` (Roles, Gotchas), `AUTH.md` (`require_instructor` scope; the open items on role changes
and self-serve instructors), the `app/core/authz.py` docstring, `supabase/README.md` (the
seed-institution and role-flip runbook), `frontend/public/llms.txt` (classes belong to an
institution) and `.well-known/grepthink-actions.json`.

## Follow-ups (recorded, not done)

- A per-institution term system (quarters vs semesters) for the Create Class term buttons and TSR
  defaults. İstinye runs on semesters; until then Scott picks Fall or Spring and edits the TSR count.
- Retire `GET /api/tas/classes/{id}/my-role` and its `api.ts` method.
- TA-specific navigation.
- Several verified school emails per person.
- School discovery at login, if institutions get their own SSO.
- Institution admins and instructor vetting.
