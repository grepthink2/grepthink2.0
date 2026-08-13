# Mentions System (Repo-Wide Design, First Consumer: Scrum Task Comments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One small, reusable @mention capability — encoding, extraction, notification, composer, renderer — wired into exactly one surface for now (scrum **task comments**), with every future surface (messages, story descriptions, TSR notes) adoptable without refactoring.

**Architecture:** Mentions are a *convention plus four small pieces*, not a subsystem. The convention: a mention is the markdown link `[@Display Name](mention:<profile-uuid>)` inside any markdown body the app already stores — no new tables, no body-format migration, plain text stays plain. The pieces: (1) backend `app/utils/mentions.py` extracts UUIDs; (2) a generic `mention` notification type + `notify_mention` wrapper in the notifications controller; (3) shared frontend `MarkdownText` renderer that turns the token into a chip; (4) shared frontend `MentionTextarea` composer that inserts the token via an @-autocomplete popover. Each consumer feature owns only its *allowed-recipients set* and its *deep-link target* — the two things that genuinely differ per surface.

**Tech Stack:** Python stdlib `re` (backend), react-markdown 10 (already a dep) + a components override (frontend), existing notifications table/pipeline, existing `Header.tsx` `notificationPath` for click-through.

**Spec:** `docs/superpowers/specs/2026-08-12-scrum-board-design.md` (D9, D10 — amended 2026-08-13: v1 comment UI is task threads; notification type is the generic `mention`).
**Relationship to the scrum Part-1 plan:** `2026-08-12-scrum-board-part1-backend.md` Task B10 ships comment CRUD with a **no-op `_fanout_mentions` seam**; Tasks M1–M3 here implement the seam. M4–M5 are frontend and land with scrum Part 2 (F5 consumes them).

---

## Why this shape fits this repo (current state, verified 2026-08-12)

- **No mention code exists anywhere** — not in messages, not in markdown rendering (the sole
  `react-markdown` call site is the project description, unconfigured). We are free to pick
  the cleanest convention with zero migration burden.
- **Bodies are already plain text/markdown columns** (`messages.body`, `user_stories.description_md`,
  `scrum_comments.body_md`). A markdown-link token needs **no schema change on any of them**,
  ever — that is the "no big refactor" property. A `mentions` join table (the heavyweight
  alternative) was rejected: at team scale we never query "all mentions of user X" — we only
  fan out notifications at write time.
- **Notifications are the delivery rail and already generic**: `notifications(type, title, body,
  entity_type, entity_id)` + `NOTIFICATION_TYPES` allowlist + best-effort insert helpers, with
  realtime delivery to the bell already working (`useNotifications`).
- **Click-through is one pure function**: `notificationPath()` in
  `frontend/src/features/app/components/Layout/Header.tsx:14` maps `entity_type`/`entity_id`
  to a route. One new case covers mentions.
- **Composer/renderer have no shared home yet** — `frontend/src/components/` holds only
  `Skeleton`, which is exactly the precedent: shared, feature-agnostic UI lives there.

## The contract (what every consumer agrees to)

| Piece | Contract |
|---|---|
| Encoding | `[@Display Name](mention:<uuid>)` — display text is a snapshot; the UUID is the identity (rename-proof). Typed `@word` without the token is plain text, never a mention. |
| Extraction | `extract_mention_ids(body) -> set[str]` — backend, regex on the full UUID form only. |
| Authorization | The **consumer** computes `allowed_ids` (who may be notified from this surface) and intersects. Mentioning someone outside the surface renders as a chip but notifies no one. |
| Notification | Type `mention`; `title = "{author} mentioned you on {label}"`; `entity_type` names the surface (`scrum_task` now; `conversation`, `scrum_story` later); `entity_id` is whatever that surface's deep link needs (composite allowed — it's text). |
| Deep link | One case per surface in `notificationPath()`. For `scrum_task`: `entity_id = "{project_id}:{task_id}"` → `/app/projects/{project_id}/board?task={task_id}`. |
| Rendering | Shared `MarkdownText` renders the token as a `.gt-mention` chip (react-markdown `components.a` override on the `mention:` scheme); everything else renders as normal markdown. |
| Composing | Shared `MentionTextarea` — plain textarea + popover on `@` filtering a caller-supplied `members` list; selection inserts the token. Callers that don't need mentions keep using plain textareas. |

## Future consumers (documented now, built never-until-needed)

- **Messages**: swap `MessageComposer`'s textarea for `MentionTextarea` (members = conversation
  participants, already in the inbox payload), render bubbles through `MarkdownText`, and in
  `send_message` add `extract_mention_ids` ∩ participants → `notify_mention(entity_type="conversation",
  entity_id=conversation_id)` — the existing `conversation` deep-link case already works. No schema change.
- **Story descriptions / TSR notes**: render through `MarkdownText`; fan out on save the same way.
  Each is ~20 lines in that feature's controller.

---

### Task M1: Backend extraction util

**Files:**
- Create: `backend/app/utils/mentions.py`
- Test: `backend/tests/test_mentions_util.py`

- [ ] **Step 1: Write the failing tests** `backend/tests/test_mentions_util.py`:

```python
"""Mention token extraction — the repo-wide convention (docs/superpowers/plans/2026-08-13-mentions-system.md)."""
from app.utils.mentions import extract_mention_ids

U1 = "11111111-1111-1111-1111-111111111111"
U2 = "22222222-2222-2222-2222-222222222222"


def test_extracts_unique_uuids():
    body = f"ping [@A B](mention:{U1}) and [@C](mention:{U2}) and again [@A B](mention:{U1})"
    assert extract_mention_ids(body) == {U1, U2}


def test_ignores_plain_at_and_bad_tokens():
    body = f"@word (mention:{U1[:-1]}) [@x](mention:not-a-uuid) [x](http://a.b) mention:{U1}"
    assert extract_mention_ids(body) == set()


def test_empty_and_none_safe():
    assert extract_mention_ids("") == set()
    assert extract_mention_ids(None) == set()
```

- [ ] **Step 2: Run** `.venv/bin/python -m pytest tests/test_mentions_util.py -v` → Expected: FAIL (module missing).

- [ ] **Step 3: Write `backend/app/utils/mentions.py`**:

```python
"""Repo-wide @mention convention: a mention is the markdown link
[@Display Name](mention:<profile-uuid>) inside any stored markdown body.

This module owns only extraction. Each consumer computes its own allowed-recipient
set and calls notifications.controller.notify_mention — see
docs/superpowers/plans/2026-08-13-mentions-system.md for the full contract.
"""
from __future__ import annotations

import re

MENTION_RE = re.compile(
    r"\(mention:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)"
)


def extract_mention_ids(body_md: str | None) -> set[str]:
    """Unique profile UUIDs mentioned in a markdown body."""
    return set(MENTION_RE.findall(body_md or ""))
```

- [ ] **Step 4: Run** the test again → Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/utils/mentions.py backend/tests/test_mentions_util.py
git commit -m "feat(mentions): extraction util for the [@Name](mention:uuid) convention"
```

---

### Task M2: Generic `mention` notification type

**Files:**
- Modify: `backend/app/notifications/controller.py` (`NOTIFICATION_TYPES` + `notify_mention`)
- Test: `backend/tests/test_mentions_notify.py`

- [ ] **Step 1: Failing tests** `backend/tests/test_mentions_notify.py`:

```python
"""notify_mention shapes title/body/entity and rides the best-effort insert helper."""
from unittest.mock import patch


@patch("app.notifications.controller._insert_notification")
def test_notify_mention_shape(insert):
    from app.notifications.controller import notify_mention
    notify_mention(user_id="u1", author_name="Tony Wu", surface_label="GT-12",
                   context_name="GrepThink 2.0", preview="see this",
                   entity_type="scrum_task", entity_id="p1:t1")
    kwargs = insert.call_args.kwargs
    assert kwargs["type"] == "mention"
    assert kwargs["title"] == "Tony Wu mentioned you on GT-12"
    assert kwargs["body"] == "GrepThink 2.0: see this"
    assert kwargs["entity_type"] == "scrum_task" and kwargs["entity_id"] == "p1:t1"


def test_mention_in_allowlist():
    from app.notifications.controller import NOTIFICATION_TYPES
    assert "mention" in NOTIFICATION_TYPES
```

- [ ] **Step 2: Run** → FAIL. **Step 3: In `backend/app/notifications/controller.py`** add `"mention"` to the `NOTIFICATION_TYPES` frozenset and, beside the other `notify_*` wrappers:

```python
def notify_mention(*, user_id: str, author_name: str, surface_label: str,
                   context_name: str, preview: str,
                   entity_type: str, entity_id: str) -> None:
    """Generic @mention notification (mentions plan 2026-08-13). surface_label is
    the human handle of where it happened ("GT-12", a conversation name);
    entity_type/entity_id drive notificationPath() deep links per surface."""
    _insert_notification(
        user_id=user_id,
        type="mention",
        title=f"{author_name} mentioned you on {surface_label}",
        body=f"{context_name}: {preview}",
        entity_type=entity_type,
        entity_id=entity_id,
    )
```

- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/test_mentions_notify.py tests/ -k notification -v` → Expected: new tests pass, zero regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/app/notifications/controller.py backend/tests/test_mentions_notify.py
git commit -m "feat(mentions): generic mention notification type + notify_mention wrapper"
```

---

### Task M3: Activate the scrum seam (task-comment fan-out)

**Files:**
- Modify: `backend/app/scrum/controller.py` (replace the no-op `_fanout_mentions` from scrum Task B10)
- Test: `backend/tests/test_scrum_comments.py` (extend)

- [ ] **Step 1: Extend `backend/tests/test_scrum_comments.py`** with the fan-out cases (failing first):

```python
M1 = "00000000-0000-0000-0000-000000000001"


def test_mention_recipients_filters_and_drops_self():
    from unittest.mock import MagicMock, patch
    from app.scrum.controller import _mention_recipients
    client = MagicMock()
    members_q = MagicMock()
    members_q.select.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[{"user_id": M1}, {"user_id": UID}])
    proj_q = MagicMock()
    proj_q.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"class_id": "c1", "assigned_ta_id": None})
    cls_q = MagicMock()
    cls_q.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"created_by": "inst-1"})
    enr_q = MagicMock()
    enr_q.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    client.table.side_effect = lambda n: {"project_members": members_q, "projects": proj_q,
                                          "classes": cls_q, "class_enrollments": enr_q}[n]
    body = f"[@A](mention:{M1}) [@me](mention:{UID}) [@outsider](mention:99999999-9999-9999-9999-999999999999)"
    out = _mention_recipients(client, project_id=PID, body_md=body, author_id=UID)
    assert out == {M1}   # outsider filtered, self dropped


def test_comment_fanout_notifies_via_generic_mention(monkeypatch):
    from unittest.mock import MagicMock, patch
    from app.scrum import controller
    client = _wire_task_comment(MagicMock())  # helper mirroring _wire but for a task parent
    with patch.object(controller, "_client", return_value=client), \
         patch.object(controller, "_board_access", return_value="member"), \
         patch.object(controller, "_mention_recipients", return_value={M1}), \
         patch("app.notifications.controller.notify_mention") as notify, \
         patch("app.utils.profiles._get_profile", return_value={"first_name": "Tony", "last_name": "Wu"}):
        controller.create_comment(parent_kind="task", parent_id="t1", user_id=UID,
                                  body_md=f"[@A](mention:{M1}) done")
        assert notify.call_count == 1
        kwargs = notify.call_args.kwargs
        assert kwargs["entity_type"] == "scrum_task"
        assert kwargs["entity_id"] == f"{PID}:t1"
```
(Define `_wire_task_comment` beside `_wire`: same shape, parent row `{"id": "t1", "project_id": PID, "key": "GT-12"}` served for the task lookup, insert returning a comment row.)

- [ ] **Step 2: Run** → FAIL (`_mention_recipients` missing / fan-out is the B10 no-op).

- [ ] **Step 3: Replace the seam in `backend/app/scrum/controller.py`**:

```python
from app.utils.mentions import extract_mention_ids


def _mention_recipients(client, *, project_id: str, body_md: str, author_id: str) -> set[str]:
    """Mentioned UUIDs ∩ (team members ∪ staff seats), minus the author (mentions-plan contract)."""
    mentioned = extract_mention_ids(body_md)
    if not mentioned:
        return set()
    members = (client.table("project_members").select("user_id")
               .eq("project_id", str(project_id)).execute()).data or []
    allowed = {m["user_id"] for m in members}
    proj_res = (client.table("projects").select("class_id, assigned_ta_id")
                .eq("id", str(project_id)).maybe_single().execute())
    proj = proj_res.data if proj_res else None
    if proj:
        if proj.get("assigned_ta_id"):
            allowed.add(proj["assigned_ta_id"])
        cls = (client.table("classes").select("created_by")
               .eq("id", proj["class_id"]).maybe_single().execute())
        if cls and cls.data:
            allowed.add(cls.data["created_by"])
        tas = (client.table("class_enrollments").select("user_id")
               .eq("class_id", proj["class_id"]).eq("enrollment_role", "ta").execute()).data or []
        allowed |= {t["user_id"] for t in tas}
    return (mentioned & allowed) - {str(author_id)}


def _fanout_mentions(client, *, project_id: str, parent_kind: str, parent_id: str,
                     parent_key: str, author_id: str, body_md: str) -> None:
    # Notifications are best-effort: never fail a persisted comment,
    # never let one recipient's failure starve the rest.
    recipients = _mention_recipients(client, project_id=project_id,
                                     body_md=body_md, author_id=author_id)
    if not recipients:
        return
    from app.notifications.controller import notify_mention
    from app.utils.profiles import profile_display_name, _get_profile
    try:
        author = profile_display_name(_get_profile(author_id))
        proj = client.table("projects").select("name").eq("id", str(project_id)).maybe_single().execute()
        project_name = (proj.data or {}).get("name", "") if proj else ""
    except Exception:
        logger.exception("scrum: mention context lookup failed | project=%s", project_id)
        author, project_name = "Someone", ""
    preview = body_md if len(body_md) <= 120 else body_md[:117] + "..."
    entity_type = "scrum_task" if parent_kind == "task" else "scrum_story"
    entity_id = f"{project_id}:{parent_id}"
    for rid in recipients:
        try:
            notify_mention(user_id=rid, author_name=author, surface_label=parent_key or "a card",
                           context_name=project_name, preview=preview,
                           entity_type=entity_type, entity_id=entity_id)
        except Exception:
            logger.exception("scrum: mention notify failed | recipient=%s", rid)
```

- [ ] **Step 4: Run** `.venv/bin/python -m pytest tests/ -k "scrum or mention or notification" -v` → all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/scrum/controller.py backend/tests/test_scrum_comments.py
git commit -m "feat(mentions): activate scrum task-comment fan-out through the shared contract"
```

---

### Task M4: Shared frontend composer + renderer *(lands with scrum Part 2; F5 consumes)*

**Files:**
- Create: `frontend/src/components/Markdown/MarkdownText.tsx` + `MarkdownText.scss`
- Create: `frontend/src/components/Mentions/MentionTextarea.tsx` + `MentionTextarea.scss`
- Test: `frontend/src/components/__tests__/markdown-mentions.test.tsx`

- [ ] **Step 1: Failing tests** `frontend/src/components/__tests__/markdown-mentions.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarkdownText from '@components/Markdown/MarkdownText';
import MentionTextarea from '@components/Mentions/MentionTextarea';

const MEMBERS = [{ user_id: 'u-1', name: 'Tony Wu' }, { user_id: 'u-2', name: 'Ada L' }];

test('renders mention token as a chip and plain @word as text', () => {
  render(<MarkdownText>{'hi [@Tony Wu](mention:u-1) and @word'}</MarkdownText>);
  const chip = screen.getByText('@Tony Wu');
  expect(chip).toHaveClass('gt-mention');
  expect(screen.getByText(/@word/)).not.toHaveClass('gt-mention');
});

test('external links open in a new tab; mention chip is not a navigation link', () => {
  render(<MarkdownText>{'[docs](https://example.com) [@Tony Wu](mention:u-1)'}</MarkdownText>);
  expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('target', '_blank');
  expect(screen.queryByRole('link', { name: '@Tony Wu' })).toBeNull();
});

test('typing @ opens the member popover and selecting inserts the token', async () => {
  const user = userEvent.setup();
  let value = '';
  const { rerender } = render(
    <MentionTextarea value={value} onChange={(v) => { value = v; }} members={MEMBERS} />);
  await user.type(screen.getByRole('textbox'), 'ping @To');
  rerender(<MentionTextarea value={value} onChange={(v) => { value = v; }} members={MEMBERS} />);
  await user.click(screen.getByRole('option', { name: /Tony Wu/ }));
  expect(value).toBe('ping [@Tony Wu](mention:u-1) ');
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/__tests__/markdown-mentions.test.tsx` → FAIL.

- [ ] **Step 3: Write `MarkdownText.tsx`** — react-markdown with a `components.a` override:

```tsx
import ReactMarkdown from 'react-markdown';
import './MarkdownText.scss';

interface Props { children: string; className?: string }

/** Shared markdown renderer with the repo-wide mention convention:
 *  [@Name](mention:uuid) renders as a .gt-mention chip (never navigates). */
export default function MarkdownText({ children, className = '' }: Props) {
  return (
    <div className={`gt-md ${className}`.trim()}>
      <ReactMarkdown
        components={{
          a: ({ href, children: kids }) => {
            if (href?.startsWith('mention:')) {
              return <span className="gt-mention">{kids}</span>;
            }
            return <a className="gt-md__link" href={href} target="_blank" rel="noreferrer">{kids}</a>;
          },
          code: ({ children: kids }) => <code className="gt-md__code">{kids}</code>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
```
`MarkdownText.scss` ports the `.gt-md` / `.gt-md__code` / `.gt-md__link` / `.gt-mention` rules verbatim from `design/components/scrum/scrum.css` (token-based already).

- [ ] **Step 4: Write `MentionTextarea.tsx`** — controlled textarea + popover (no debounce; the member list is local). Behavior: on each change, look backward from the caret for `/@([\w ]*)$/`; when found, show a listbox of members whose name starts with the fragment (case-insensitive, max 6); Enter/Tab/click inserts `[@Name](mention:id) ` replacing the fragment; Escape closes; arrow keys move the highlight; `useClickOutside` (reuse `frontend/src/features/app/components/Interest/useClickOutside.ts`) closes. Props:

```tsx
interface MentionMember { user_id: string; name: string }
interface Props {
  value: string;
  onChange: (value: string) => void;
  members: MentionMember[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  onSubmit?: () => void;        // ⌘/Ctrl+Enter passthrough
  ariaLabel?: string;
}
```
Popover markup: `role="listbox"` with `role="option"` children; keep focus in the textarea (`aria-activedescendant`). Styles: `.gt-comments__input` textarea rules from the design CSS + a popover reusing the app's dropdown look (border, radius 7, `--gt-shadow-pop`).

- [ ] **Step 5: Run** the vitest file → 3 passed. Then `npm run build` and `npm run lint:design` → clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Markdown frontend/src/components/Mentions frontend/src/components/__tests__/markdown-mentions.test.tsx
git commit -m "feat(mentions): shared MarkdownText renderer + MentionTextarea composer"
```

---

### Task M5: Notification deep link *(lands with scrum Part 2; board reads ?task=)*

**Files:**
- Modify: `frontend/src/features/app/components/Layout/Header.tsx:14` (`notificationPath`)

- [ ] **Step 1: Add the case** to `notificationPath` (before the generic `project` case):

```ts
if (notification.entity_type === 'scrum_task' && notification.entity_id) {
  const [projectId, taskId] = notification.entity_id.split(':');
  if (projectId && taskId) return `/app/projects/${projectId}/board?task=${taskId}`;
}
```

- [ ] **Step 2:** The board page's `?task=` handling (open the story modal focused on that task)
  ships in scrum Part 2 Task F4 — this link is inert-but-correct until then (it lands on the board).

- [ ] **Step 3: Gates + commit**

```bash
cd frontend && npm run build && npx vitest run
git add src/features/app/components/Layout/Header.tsx
git commit -m "feat(mentions): scrum_task notification deep link"
```

---

## Plan self-review (done at write time)

- **Coverage vs. ask:** repo-wide consideration → "Why this shape fits this repo" + future-consumers section; "not a ton of refactor" → zero schema changes, zero changes to existing features, 4 new files + 3 single-point edits; "only task comments for now" → M3 wires task comments (story comments share the same seam automatically since B10's CRUD covers both parents).
- **Type consistency:** `extract_mention_ids` (M1) is the only import M3 adds; `notify_mention` kwargs in M2 match M3's call site; `MentionMember` uses `user_id`/`name` matching the board payload's `members`.
- **Sequencing:** M1–M3 can run immediately after scrum B10 exists (M3 replaces its seam). M4–M5 wait for Part 2 so they're tested against the real page.
