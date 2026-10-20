# Handoff — design-system alignment round (2026-10-19)

## Overview
The codebase is moving every basic UI element onto shared React components (`frontend/src/components/<Name>/`).
This round makes the design system complete enough for that: it closes the gaps between what the kit defined and
what the app uses (brief §4), adds the components the app needs (§5), and rewrites `PORTING.md` around a component
map (§6). Migrated screens **take the design system's look**. No screens were redesigned; the Settings and C2
final-review sign-up rounds design with this kit next.

Read with: the brief (`uploads/2026-10-19-design-system-alignment/README.md`), `NOTES.md` here (decisions, the status
colour map, §8 answers, port questions), each component's `.d.ts` (props) and `.prompt.md` (usage + WAI-ARIA pattern).

## Decisions (binding, from the brief) and how they landed
1. **Migrated screens take the kit's look** — one set of sizes, one disabled opacity (`--gt-opacity-disabled` 0.45), no hover lifts or scale presses in the app.
2. **Button `outline`** — added (§Button).
3. **Shared Combobox** — `primitives/Combobox`.
4. **One status colour rule** — Badge `status` presets (`BADGE_STATUS`); the map is in NOTES.
5. **New components** — PasswordField, CodeInput, SearchField (promoted), ConfirmDialog (+InlineConfirm), Drawer, Spinner, FilterChip (+FilterChipGroup), Stepper, FileUpload, MarkdownEditor; pressed state on Button and IconButton.
6. **PORTING.md** — component map to `frontend/src/components/`, feature SCSS only for feature CSS, port ledger dropped.
7. **Tabs keep the grey segmented track** — the Tabs component now draws it.
8. **Own pass** — no Settings or C2 screens here.

## Rules applied everywhere
- **Tokens only.** No raw hex in any component CSS (the four in `display.css`, three in `navigation.css`, plus stragglers in `domain.css`, `assistant.css`, `marketing.css`, `scrum.css`). New tokens are listed under *Tokens*.
- **Flat and calm.** 0.2s / 0.3s ease, fades and ≤ 24px slides, the 0.5px press; no scale, no lift inside the app. Light mode only.
- **Accessibility.** WCAG 2.1 AA: 4.5:1 text, 3:1 control boundaries (fields moved to `--gt-border-control`, 3.7:1). The global 2px accent ring. Every interactive part follows the WAI-ARIA pattern named in its `.prompt.md`. Reduced motion honoured (spinners keep turning at 1.6s).
- **Phones (< 768px): 44px minimum**, met with `min-height` / `min-width` on the control itself, in the primitives' own CSS (features stop repeating it). One exception: a Tag's × keeps its 18px look with a 44px hit area.
- **Prop names.** No prop shadows an HTML or ARIA attribute: Badge `role` → `projectRole`; field `size` → `compact`; Input `prefix` → `prefixText`. `title` stays as the visible heading on content components (NOTES Q1).

## Component specs (exact values from the CSS)

### Button — `primitives/Button`
- Sizes: **sm** 32px · 0 14px · 13px (rows, cards, toolbars) · **md** 40px · 0 28px · 14px (forms, pages) · **lg** 48px · 0 32px · 16px (sign-in, with `fullWidth`). 1px border on every variant (transparent unless outline), radius 7, 500, gap 8. `type="button"` default.
- Variants: primary (`--gt-primary` → `--gt-primary-hover`) · secondary (`--gt-gray-100` → `--gt-border`, inside white surfaces) · **outline** (`--gt-surface`, 1px `--gt-border`, `--gt-text-secondary` → `--gt-surface-muted` + `--gt-border-strong`; Cancel, page toolbars, anything on the canvas) · ghost (green text → `--gt-primary-soft` + `--gt-primary-hover`) · danger (solid red, the confirming step only) · **danger-ghost** (quiet destructive: `--gt-error-text`, hover `--gt-error-soft`).
- **Pressed** (`pressed` → `aria-pressed`): `--gt-primary-soft` fill, `--gt-primary` border (the 4.9:1 state cue), `--gt-primary-hover` text; hover `--gt-green-100`.
- **Busy**: `loading` + `loadingLabel` ("Saving…"): spinner (14 / 16) + the "-ing…" label replace the idle face **in the same grid cell**, so the width never changes; `aria-busy`, `aria-disabled` (focus stays), clicks ignored.
- **Link**: `href` renders `<a>` with the same classes (Join Zoom, Browse projects); disabled links drop `href`, keep `role="link"` + `aria-disabled`.
- Focus: global ring. Press: `translateY(0.5px)`. Disabled: 0.45.

### IconButton — `primitives/IconButton`
28 / 36 / 44 (44 min on phones), radius 7; ghost · solid · danger; `pressed` as Button. **Tooltip on by default**: the `ariaLabel` shows as a Tooltip bubble on hover and keyboard focus (`aria-hidden`; the label is already the name); `tooltip={false}` / `"text"`. Canonical names: **Close** (modal / drawer ×, md ghost), **Dismiss** (alert, toast, banner), **Remove {name}** (chip).

### Field shell and fields — `FieldShell`, `Input`, `Textarea`, `Select`
- Shell: column gap 4; label 14/500 secondary; **"(optional)"** 400 tertiary after optional labels; required fields carry no visible mark (`required` is announced). `hideLabel` keeps the label as `.gt-visually-hidden`. Error line caption/500 `--gt-error-text` with a 13px alert glyph, replacing the help line; both linked by `aria-describedby`, `aria-invalid` follows. Select and Textarea now do this too.
- Controls: 40px (32 `compact`, 44 phones), 9×13 padding, radius 7, 1px `--gt-border-control`; hover `--gt-border-control-hover`; focus accent border + 2px ring; error `--gt-error` (2px red ring when focused); disabled `--gt-surface-sunken` fill, `--gt-border`, tertiary text (value stays readable — no opacity).
- Adornments: `iconLeft`, `prefixText` ("linkedin.com/in/", "github.com/", "@"), `suffix`, `action` sit inside one `.gt-input-group` box that takes the ring.
- **Counter**: "128 / 500" caption tertiary, tabular, right of the help line; past the limit the text stays, counter and border turn red, the form blocks the save ("Shorten this by 12 characters."). A polite live region speaks at 20 left, at the limit and when over. Textarea shows it whenever `maxLength` is set; Input from 80% or with `showCount`.
- Select stays native for short fixed lists (`optgroup` groups via `options`); searchable or multi lists are the Combobox.

### Form pattern (from the team-meetings handoff)
Field grid (`grid2` / auto rows, 12–14px gaps; time + duration side by side; full width on phones) · "(optional)" marking · each error under its field · on submit, focus moves to the **first invalid field** · a save error is an `Alert tone="error"` **above the actions**, the typed values stay · actions right-aligned: **outline Cancel**, then the **primary submit** with `loadingLabel`; fields disabled while saving · `noValidate`, our copy replaces browser bubbles. Live example: `components/primitives/fields.card.html`.

### PasswordField · CodeInput · SearchField
- **PasswordField**: Input + IconButton sm eye in the action slot; constant name "Show password" with `aria-pressed` (the tooltip flips Show / Hide); `autoComplete` current / new.
- **CodeInput**: boxes 44 × 52 (shrink to fit; 6px gaps on phones), Fira Code 20/500 uppercase; `role="group"` named by one label, boxes "Character 3 of 8" / "Digit 3 of 6"; typing advances, Backspace steps back, paste / one-time-code autofill fills all; value has no holes (a tap lands on the first empty box, so the row is one target); `groupSize` draws a decorative rule (ABCD – 1234).
- **SearchField** (promoted from `search/`): 36px (32 `compact`), max 320 unless `fullWidth`, glyph left, × "Clear search" right (focus returns), `role="search"`, visually hidden label (never the placeholder).

### Combobox — `primitives/Combobox`
WAI-ARIA combobox (editable input + listbox popup, `aria-activedescendant`, `aria-autocomplete="list"`). Modes: single with filter · multi with Tag chips and `max` · async `loadOptions` (250ms debounce; Searching… with a 14px spinner / No matches / error rows; keeps the last list while loading) · `creatable` ("Add “React”"; `validateCreate` blocks bad emails) · grouped options · avatar (28) or icon (16) rows with a second line (the MentionListbox row). Keys: ↓ opens on the first option (Alt+↓ without moving), ↑ on the last; ↑ ↓ wrap and skip disabled; Enter picks (or creates); Esc closes, then clears; Backspace in an empty input removes the last chip; Tab closes. Popup: 4px below, max-height 280, radius 10, `--gt-shadow-pop`; rows 36 (44 phones), active row muted fill + 2px inset accent ring; "5 results available" spoken 0.5s after the list settles.

### Checkbox · RadioGroup · Toggle
The hidden native input now covers the whole label row (the label is `position: relative`), so click, tap and the screen-reader cursor match the visible row; descriptions are `aria-describedby`. Boxes / dots / off-track use `--gt-border-control`. **RadioGroup `variant="card"`**: auto-fit grid (min 200), cards 12×14, radius 10, 1px `--gt-border`; selected = 1px + 1px inset `--gt-primary` + the filled dot; focus ring on the card (Draft / Published, template picker). 44px rows on phones.

### DatePickerField — the codebase API
`label`, `value` ('yyyy-MM-dd' | 'yyyy-MM-dd HH:mm' | ''), `onChange(value)`, `showTime`, `disabledBefore`, `disabled` + `error`, `helperText`, `required`, `optional`, `disabledAfter`, `id`. Trigger: field-look button, `aria-haspopup="dialog"`, `aria-expanded`, named by **label + value** (`aria-labelledby`; "required" appended). Calendar: modal dialog **portaled to `<body>` at `--gt-z-picker` (1100)**, 6px below or flipped above, 8px inside the viewport; focus to the selected day (or today); ← → ↑ ↓ / Home End / PageUp PageDown (+Shift = year); Enter picks; **Esc closes and returns focus to the trigger** (captured, so a Modal stays open). Days 36 (44 phones): selected solid green, today an inset green ring + `aria-current="date"`, out-of-range `aria-disabled` gray-400. `showTime`: a labelled 15-minute "Time" input and outline Cancel / primary Done.

### FileUpload · MarkdownEditor
- **FileUpload image**: 72px preview (circle; `shape="square"` radius 10), outline sm Upload image → Change, danger-ghost Remove, types and size in the help line. **drop**: 1.5px dashed `--gt-border-control`, radius 10, 24×16 padding, 40px sunken disc, "or", outline Choose file; drag-over green border + `--gt-primary-soft`; chosen → file row (name, size · meta, Replace, × "Remove {name}"). Type / size checked before `onSelect`; errors are the field error. Always a real Button; drag-and-drop is a shortcut.
- **MarkdownEditor**: one framed box (`--gt-border-control`, takes the ring); muted bar with 184px **Write / Preview** Tabs (`sm`) and a `role="toolbar"` (roving tabindex): Bold Ctrl+B, Italic Ctrl+I, Link Ctrl+K, Bulleted list, Code; borderless 140px textarea; shared counter; Preview = `renderPreview` → MarkdownText in the port.

### Badge · CountBadge · UnreadBadge · Tag
- **Badge** statuses: soft fill + `-text` colour, pill radius 20, 4×14, 0.8rem/500. `status` keys pick the tone (map in NOTES); `merged` purple for PRs. **Categories** (`category`, `projectRole`): white, 1px `--gt-border`, radius 7, 3×10, secondary text, 12px icon. Roles: Owner Crown · Product Owner Star · Scrum Master Shield · Admin Key · Member none.
- **CountBadge**: 18px, min 18, radius 9, `--gt-gray-100` (gray-200 on an inactive tab), secondary 11/600, "99+". **UnreadBadge**: same box, solid `--gt-error`, white 11/700, "3 unread" built in, `dot` for collapsed nav.
- **Tag**: radius 7, 3×10, caption 500; × is a real button "Remove {name}" (18px; 44px hit area on phones).

### Avatar · ProgressBar · Card · StatCard · Table · Tooltip · InfoPopover
- **Avatar**: `AVATAR_COLORS` = `--gt-avatar-1…6` via `hashColor` (the one palette and hash); `decorative` beside a visible name; broken `src` → initials; AvatarGroup is one image ("… and 3 more").
- **ProgressBar**: 4 / 8 / 12 track; `inline` 4px on gray-200 (decorative beside its number); `meter` for shares.
- **Card**: card · hairline · **bordered** (1px border, no shadow, radius 7, 12×14) · **interactive** (`href` / `onClick`: the title is a stretched link / button; hover `--gt-shadow-hover`; focus ring on the card; `selected` 2px inset green outline) · header **actions** slot (above the stretch).
- **StatCard** (Dashboard + Analytics): label 12/600 uppercase + optional **ⓘ InfoPopover** (`info`), value 2rem (compact h2), 30px tinted icon chip, hint; `delta` (good / bad / flat), `trend` 84×24 sparkline, `failed` / null "—", `loading` skeleton; clickable = stretched button under the content. StatTile = `<StatCard compact format="compact">`.
- **Table**: `scope="col"`, hidden caption, sortable header buttons + `aria-sort`, Skeleton rows + `aria-busy`, a card EmptyState row, `dense` (6/8 × 12, 13px), `stickyHeader`; rows open from a **first-cell link / button** (`rowHref` / `onRowClick`), never `<tr onClick>`; on phones the wrapper scrolls and becomes a focusable named region when it overflows.
- **Tooltip**: gray-900 bubble, caption, 6px offset, 0.2s fade; `focusable={false}` inside other controls.
- **InfoPopover**: 24px ⓘ (44 phones) → non-modal dialog on the Popover surface, 352px (320 text column + 16 padding), title caption/600, body 12.5 secondary; click / Enter opens, Esc closes and returns focus, outside click closes. For explanations and for the reason beside a disabled control.

### Modal · ConfirmDialog · InlineConfirm · Drawer · Alert · EmptyState · Spinner
- **Modal**: `role="dialog"` + `aria-modal` on the sheet, labelled by its title; focus in → trapped → returned; Esc / scrim close **only the topmost**; `closeDisabled`; body scroll lock; header and footer pinned, body scrolls (`max-height: 88vh`); `--gt-z-modal` (100); 0.15s fade in and out (instant close under reduced motion). Sizes **sm 400 · md 560 · lg 760**. **Form header**: title 18/600 left, subtitle 13 secondary, × at 12/12, `tabs` 16px under the title, footer right-aligned over a hairline (14×24). **Message**: centred 28px title, 32×48 head. Phones: 12px margins, footer buttons stretch.
- **ConfirmDialog**: `role="alertdialog"`, sm; Cancel (outline) focused first; Confirm primary or danger; busy → Confirm busy, Cancel disabled, Esc / scrim blocked; failure → error Alert inside. **InlineConfirm**: muted strip, radius 7, 10×12, red 24px alert disc, sentence (`role="group"` labelled by it), outline Cancel (focused) + danger Delete; Esc cancels without closing the dialog.
- **Drawer**: 420px from the right (editor) or left (phone nav), full height, head 18×20 with × , pinned footer; slides 24px + fades over 0.2s (fade only under reduced motion); full width on phones.
- **Alert**: `actions` slot (buttons under the body; children are a `<div>`); error = `role="alert"`, others `role="status"`; × "Dismiss".
- **EmptyState**: page (64px `--gt-primary-soft` well, 20px title) · card (min 120, 36px sunken disc, 13px title) · quiet (left-aligned 12.5 secondary, no well) · error (quiet + **Try again** link, `role="status"`; never a red panel); `titleAs`. **NoClassSelected**: GraduationCap · "No class selected" · "Choose a class to see this page. You can switch classes any time from the class selector." · outline **Choose a class**.
- **Spinner**: 14 / 16 / 20 / 24 (2px ring, 2.5 at 24), 0.7s; `role="status"` + hidden label; `decorative` in buttons. **Skeleton** when the content's shape is known; Spinner for actions in flight and small unknown regions.

### Tabs · SegmentedControl · FilterChip · Stepper
- **Tabs**: track `--gt-gray-100`, 4px padding, radius 7; tabs **stretch** (flex 1), 36px, 13/500 tertiary; active white + `0 1px 2px rgba(0,0,0,.06)`, primary text **600**; `sm` 28px. Roving tabindex, ← → Home End; automatic activation (manual for panels that fetch); `TabPanel` linked with `aria-controls` / `aria-labelledby`; CountBadge on the track; `collapseOnPhone` = icon-only tabs whose labels stay in the name.
- **SegmentedControl**: the same track, **sizes to its options** (full width on phones); radio group, arrows move and select; `count` per option; `ariaLabel`.
- **FilterChip**: sm 26 / 0 10 / 11.5 · md 32 / 0 14 / 12.5 (44 phones); pill, 1px `--gt-border`, white; hover green tint; selected solid green, white text (multi chips add a check). `FilterChipGroup type="single"` = radio group; `"multi"` = pressed toggles.
- **Stepper**: `<nav>` + `<ol>`, `aria-current="step"`; 28px markers (number · green solid current · check done · ! error), 2px connectors (green after done), 12.5 labels; done / error steps are buttons back; upcoming inert; phones: "Step 2 of 4 · Rate teammates" + a 4px meter.

**Which control:** Tabs switch panels of different content · SegmentedControl switches the view or unit of the same content · FilterChip narrows a list.

## Keyboard and screen-reader summary
| Component | Pattern | Keys |
| --- | --- | --- |
| Button / IconButton | Button (toggle with `pressed`) | Enter, Space |
| Combobox | Combobox + listbox | ↓ ↑ (Alt+↓), Enter, Esc, Backspace, Tab |
| CodeInput | group of textboxes | type, Backspace, ← → Home End, paste |
| DatePickerField | Date picker dialog | arrows, Home End, PageUp / PageDown (+Shift), Enter, Esc, Tab trapped |
| RadioGroup / Checkbox / Toggle | native radio / checkbox / switch | arrows / Space |
| Tabs | Tabs | ← → Home End (Enter / Space when manual) |
| SegmentedControl, FilterChipGroup single | Radio group | arrows, Home End |
| FilterChip multi | toggle buttons | Enter, Space |
| Menu | Menu (+checkbox / radio items) | ↑ ↓ Home End, Enter, Esc |
| InfoPopover | disclosure → non-modal dialog | Enter / Space, Esc |
| Modal, Drawer, ConfirmDialog | Dialog / Alert dialog | Tab trapped, Esc (topmost) |
| MarkdownEditor | Tabs + Toolbar | ← → in the toolbar, Ctrl/⌘ B I K |
| Stepper | nav + list | Tab to done steps, Enter |
| Table | table + sortable header buttons | Tab, Enter; scroll region focusable when overflowing |

## Tokens
New in `tokens/colors.css`: `--gt-border-control` #858585 (3.7:1 white, 3.2:1 canvas), `--gt-border-control-hover` (= gray-600), `--gt-opacity-disabled` 0.45, `--gt-avatar-1…6`, `--gt-gold-soft`, `--gt-purple-soft`, `--gt-info-soft-hover` #DBE7FF, `--gt-warning-soft-hover` #FDE9A8, `--gt-skeleton-shine` #F5F5F5, `--gt-black`, `--gt-sidebar-text`, `--gt-sidebar-text-active`. `tokens/spacing.css`: `--gt-z-sidebar` 99, `--gt-z-picker` 1100. `tokens/marketing.css`: `--gt-mkt-note-ring`, `--gt-mkt-chrome-red / -yellow / -green`. Everything else reuses existing tokens.

## Files
- `components/primitives/` — Button, IconButton, FieldShell, Input, Textarea, Select, SearchField, PasswordField, CodeInput, Combobox, Checkbox, RadioGroup, Toggle, DatePickerField, FileUpload, MarkdownEditor (`primitives.css`; galleries `primitives`, `fields`, `choice`, `upload`).
- `components/display/` — Badge, CountBadge, UnreadBadge, Tag, Avatar, Card, Table, StatCard, ProgressBar, Tooltip, InfoPopover (`display.css`; galleries `display`, `cards`).
- `components/feedback/` — Modal (+useDialog), ConfirmDialog (+InlineConfirm), Drawer, Alert, Spinner, EmptyState (+NoClassSelected, Skeleton), Menu, Popover, Toast (`feedback.css`; galleries `feedback`, `dialogs`, `toast`, `popover`).
- `components/navigation/` — Tabs (+TabPanel), SegmentedControl, FilterChip (+FilterChipGroup), Stepper, Pagination, SidebarNavItem (`navigation.css`; gallery `navigation`).
- Feature layers touched only to stop copying: analytics (StatTile, DefinitionPopover → shared; range chips → FilterChip; `.gt-empty--card` and `.gt-definition` blocks removed), search (SearchField moved; scope chips → FilterChip), schedule (kind chips → FilterChip), domain (UnreadBadge moved; role badges → `projectRole`; `.gt-unread` removed).
- `ui_kits/grepthink/` — the team-meetings phone tabs keep their labels for screen readers; `ariaLabel` on the kit's Tabs and SegmentedControl.
- `PORTING.md` (component map, no ledger), `readme.md` (Index + Intentional additions), `components/gallery.css`.
