# Claude Design prompt — Popover/Menu family + Toast

Paste the block below into Claude Design against the **GrepThink Design System**
project. It fills the two gaps the scrum-board Part 2 plan flagged (⚑M1 Popover/Menu,
⚑M2 Toast); the slim story rail (M3) was dropped by maintainer decision.

---

Add two missing pieces to this design system: a **Popover/Menu family** and a
**Toast**. Follow this project's existing conventions exactly: token-only styling
(`tokens/*.css` — no new colors), BEM `.gt-*` classes, each component shipped as
`<Name>.jsx` + `<Name>.d.ts` + `<Name>.prompt.md` inside a family folder with a
shared family CSS file and a `*.card.html` gallery page, motion per the system spec
(fast 0.2s ease, popover enter = 6px slide + fade 0.15s, `prefers-reduced-motion`
respected, no scale transforms), the standard 2px accent-blue focus ring, and the
existing z-index tokens.

## 1) Popover family → `components/feedback/` (beside Modal)

**Popover** — the anchored floating-surface primitive everything else composes on:
- White surface, `1px --gt-border`, radius 10, `--gt-shadow-pop`, padding token-based;
  small variant radius 7. Placement above or below an anchor with 6px offset (show
  both in the gallery); enter motion 6px slide + fade 0.15s; closes on Esc/outside
  click; never trap focus.
- `.d.ts`: `{ open, onClose, anchor placement: 'top'|'bottom', align: 'start'|'end', children }`.

**Menu / MenuItem** — action-list composition of Popover:
- Dense rows (~32px): optional 16px lucide icon slot, 12.5px label, optional mono
  shortcut hint right-aligned; hover `--gt-surface-muted`; destructive variant row
  (error text pair); separator rule; disabled state.
- Keyboard: arrows move, Enter activates, Esc closes; `role="menu"`/`menuitem"`.

**MentionListbox** → `components/scrum/` (first consumer; note in its prompt.md that
it is repo-wide — messages adopt it later). This one must be designed **async-first**
because member lookups come from Supabase and must scale beyond a cached team list:
- Anchors to the caret of a textarea (above or below, whichever fits).
- Rows: 18px initials avatar + name (12.5px) + optional secondary line (role or
  email, 10.5px `--gt-text-tertiary`); active row = `--gt-info-soft` background +
  `aria-activedescendant` (focus stays in the textarea).
- **All five async states designed**: idle hint row ("Type to mention a teammate"),
  loading row (existing spinner idiom + "Searching…"), results (cap at 6 visible,
  scroll beyond), empty ("No matches for '<query>'"), error row (quiet retry text —
  no red panel).
- Keyboard: ↑/↓ move, Enter/Tab insert, Esc dismiss; document a 250ms debounce for
  async sources in prompt.md.
- `.d.ts` contract must support both sources: `members?: MentionMember[]` (local,
  filtered client-side) OR `onSearch?: (query) => Promise<MentionMember[]>` (async).

**Gallery compositions** (on the family card, as usage references):
1. Mention autocomplete open over the scrum comment composer (`.gt-comments__input`).
2. **Board settings popover** anchored to a gear icon-button: compact estimate-scale
   picker (chip row, not the full ScalePicker cards) + "Repositories" section
   (provider icon · repo URL · "token set" chip · remove ×; add-row with URL input +
   password-type token input) — this replaces the interim settings modal.
3. **Overflow menu** on a task card ("⋯" trigger): Edit, Copy link, separator,
   Delete (destructive).

## 2) Toast → `components/feedback/`

- Single toast: white surface, radius 10, `--gt-shadow-pop`, 3px left accent bar in
  the semantic color; 16px lucide status icon; 12.5px message; optional action
  button (text style, e.g. "Undo" / "Retry"); × dismiss. Variants: success, error,
  neutral/info — semantic token pairs only.
- **ToastStack**: bottom-right (desktop), max 3 visible, newest on top, 8px gap;
  auto-dismiss 5s (error: 8s or sticky when it has an action); enter = rise-in
  (existing `gt-rise-in`), exit = fade; reduced motion = opacity only.
- Gallery shows the scrum board's real cases: error + action ("Couldn't move GT-12 —
  Undo"), success ("Repository saved"), neutral ("Read-only preview — changes are
  disabled").
- `.d.ts`: `{ variant, message, actionLabel?, onAction?, onDismiss?, duration? }` +
  a `ToastStackProps { toasts }`.

Also refresh the design-system readme/manifest so the new cards appear in the
gallery, and keep every value token-derived — if a needed token is missing, extend
the token files rather than hardcoding.
