# Frontend: rules and gotchas

Read this before changing anything under `frontend/`. The root [AGENTS.md](../../AGENTS.md) holds the rules for every change; `frontend/README.md` covers the layout and conventions, `design/PORTING.md` a design import.

## Components, lint and the bundle

- **Preview / "View class as student"** (offered only in a class you teach) is a frontend-only
  read-only simulation of that class as its students see it (`previewContext` + `previewGuard`) —
  no backend act-as, so it does not show a specific student's real data.
- **Shared UI components.** Basic elements (buttons, fields, dialogs, alerts, badges, avatars, cards,
  tabs) come from `frontend/src/components/` as each one is ported from `design/components/`; today
  the kit holds Button, IconButton, Spinner, the fields (FieldShell, Input, Textarea, Select,
  SearchField, PasswordField, CodeInput, Checkbox, Toggle, RadioGroup, DatePickerField, Slider), the
  dialogs (Modal, with a dark tone for the landing page, Drawer, ConfirmDialog with InlineConfirm), Alert,
  EmptyState with NoClassSelected, InfoPopover, Badge (with a small size), CountBadge, UnreadBadge, NewDot
  (the blue "something new" dot, never the red unread count), Tag, FilterChip with FilterChipGroup, Avatar
  with AvatarGroup, Card, StatCard, ProgressBar, Tabs with TabPanel, SegmentedControl,
  Pagination with `usePagination`, Table with
  SortableHeader and `useTableSort`, Popover, Menu (with MenuGroup and a `trailing` slot on MenuItem),
  Tooltip, Toast, Skeleton and Markdown. Tabs switch
  panels of different content, a SegmentedControl the view of the same content, and a FilterChip narrows
  a list. A table row that opens something carries a link or button in its first cell (Table's
  `rowHref` / `onRowClick`), never `<tr onClick>`. A status pill names its status
  (`<Badge status="attendance.late" />`), never a colour: `components/Badge/badgeStatus.ts` maps it. Avatars
  take their colour from the one palette and hash in `components/Avatar/avatarHelpers.ts`
  (`lib/avatarColors.ts` is the landing page's hex copy). A field's `maxLength` is a soft
  limit: the text past it is kept and flagged, so the form's own validation must refuse it. The dialogs
  share `useDialog` (`components/Modal/`): Esc and the scrim close only the topmost, so a layer inside a
  dialog that handles Esc itself (a popover, a calendar, an inline form) must take it first: in the
  capture phase, or with `stopPropagation()` in its own handler. A
  feature stylesheet never re-declares a shared component's classes, and feature markup never renders
  them by hand: `npm run lint:design` fails if either happens. Adjust a shared component from your
  feature's own class (`.my-feature__head .gt-button`). Until an element has its shared component,
  build it with your feature's own class names; never copy a design component's CSS block. A kit
  component takes the name `design/_ds_manifest.json` gives it, at `src/components/<Name>/<Name>.tsx`
  (an export the design ships inside another component's file may sit in that component's folder);
  `lint:design` fails otherwise, and a deliberate difference goes in `NAMES_ALLOWLIST`
  (`frontend/scripts/names.mjs`) with its reason.
- **The frontend lints with oxlint and type-checks with TypeScript 7.** `frontend/.oxlintrc.json`
  lists the rules it runs, each as an error; nothing is enabled by category (its `off` entries are
  typescript-eslint's overlay, which turns core rules off on TypeScript files). The rule names are
  `typescript/*` and `react/*` (`react/only-export-components` is the old `react-refresh` rule, and
  the output prints the classic hooks rules as `react-hooks(...)`). The React rules are native ports
  of `eslint-plugin-react-hooks`, the React Compiler rules included; they run on every TypeScript
  file, tests too, and find more than the ESLint plugin did (a clock read during render, a ref
  written during render). A component reads the clock through `lib/useNow.ts`, never with
  `new Date()` in render. A suppression is `// oxlint-disable-next-line <rule> -- <reason>` and
  hides one finding; a reason that wraps needs a block comment, because the directive covers the
  line after the comment ends. Never suppress `react/exhaustive-deps` or `react/rules-of-hooks`
  inside a component: such a directive also hides (seen in oxlint 1.89) every React Compiler finding in
  that component. Restructure the effect instead: a value that must not re-run it is read from a
  ref that an earlier effect keeps current. `npm run lint` also fails on a suppression that hides
  nothing.
  oxlint is pinned to an exact version: its minor releases add rules and make existing ones
  stricter, so an upgrade is a change of its own. TypeScript 7 has no stable JavaScript API
  (`require("typescript")` returns only its version; the rest is under `typescript/unstable/*`), so
  a tool that loads the compiler API, such as typescript-eslint, cannot be added without
  TypeScript 6 beside it (Microsoft's `@typescript/typescript6` package, under an `npm:` alias).
- **The entry chunk stays lean.** Every `/app` page except Home is a `lazy()` route in
  `frontend/src/App.tsx`, heavy modals (Settings among them) go through `lib/lazyModal.ts`, and the
  shell (`AppView`, `Header`, `Sidebar`) imports no page and no Markdown renderer statically: whatever
  they import lands in the chunk every visitor downloads. After adding a route or a dependency, check
  every JS and CSS file `frontend/dist/index.html` loads (its scripts, stylesheets and modulepreload
  links), not only the `index-*.js` line of `npm run build`: rolldown can split a shared module out of
  `index-*.js` into a chunk that is still preloaded. Measured 2026-11-12: `index-*.js` 205 kB minified; all the files `index.html` loads, 825 kB of JS
  (241 kB gzipped, each file on its own) and 131 kB of CSS (23 kB gzipped).

## The design system, built from the kit

The Design System artifact's code-derived files come from the shared kit and its tokens, not from
design copies. In `frontend/`:

- `npm run design:build` writes `.design-system/project/` (git-ignored build output) as it is
  published: `components/bundle.js` (the kit, its hooks and helpers, and `Icon`, as one classic script
  assigning `window.GrepThinkDesignSystem_36e7e3` for a page that supplies React 18), `bundle.css`,
  `index.d.ts`, `tokens.json` and React and React DOM 18.3.1 under `components/lib/`, plus
  `.design-system/report.json` and a summary (the tokens kept in `bundle.css` and why). It never writes
  `tokens.css`, `manifest.json` or `api/`: the page generates those. The scripts are in
  `scripts/design-system/`, the runtime the bundle carries in `design-system/runtime/`, the build config
  in `vite.design.config.ts`.
- `npm run design:test` runs the kit's own tests on React 18 (`vitest.design.config.ts`): React and
  React DOM 18 from the `react18` / `react-dom18` packages, the ref adapter's JSX runtime, and
  `design-system/runtime/react.ts` for every `react` import (React 19's `ref` prop and
  `useEffectEvent` on React 18). `react-router-dom` stays the real package there.
- `npm run design:check` holds the built tree to the artifact's format.

Kit source never changes for React 18: a difference belongs in the adapter or the runtime. A kit test
that cannot pass on React 18 for a reason the adapter does not cause goes in
`design-system/react18-skips.json` as `{ "file", "test", "reason" }` (its file is left out of
`design:test`), only once you have shown the adapter is not the cause; the list is empty today and each
entry is reviewed. A kit stylesheet's root classes start with `gt-`; DatePickerField's `dpf` block is the
one other, and the base layer's scope follows whatever the compiled CSS uses.

## Tests

- Vitest runs in its `vmThreads` pool (`vite.config.ts`): one jsdom per worker, a fresh `window`
  per file. Objects that come from Node APIs or jsdom internals live in another realm there, so
  `toStrictEqual` on a `Response.json()` result or `structuredClone` output, or `instanceof Error`
  on an error a Node built-in threw, can fail where `toEqual` passes; compare with `toEqual` or
  check the shape. `isolate` has no effect in that pool, and a worker is recycled past
  `vmMemoryLimit` rather than garbage-collected.
- Vitest keeps compiled modules on disk (`frontend/node_modules/.vitest-cache`), and that cache misses
  a change to a Sass partial: a stylesheet that `@use`s the partial keeps its old CSS. After changing a
  partial, run `npx vitest --clearCache` in `frontend/` before trusting a test that reads styles. CI
  starts from a clean install.

## Checking the signed-in UI locally

- **Local preview pages** (`frontend/<name>-mock.html` and their entry file in `frontend/src/`) stay
  local:
  - list them in `.git/info/exclude`;
  - never commit them;
  - move them out before switching to a branch that lacks what they import, or lint and build fail
    there.
- **Reuse a harness before building one.** `ls frontend/*-mock.html` on the machine you are on: a harness renders
  the real pages with the class context, auth and `api` stubbed, a pinned clock and `?role=` / `?case=` switches.
  Open its own page (`/<name>-mock.html`), not `/`. Under StrictMode the first request is made twice, so a stub
  that fails "the first call" never shows its error state. A MemoryRouter harness cannot test the browser's Back.
