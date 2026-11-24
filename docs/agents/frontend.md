# Frontend: rules and gotchas

Read this before changing anything under `frontend/`. The root [AGENTS.md](../../AGENTS.md) holds the rules for every change; `frontend/README.md` covers the layout and conventions, and "The design system, built from the kit" below how the Design System artifact is built and published.

## Components, lint and the bundle

- **Preview / "View class as student"** (offered only in a class you teach) is a frontend-only
  read-only simulation of that class as its students see it (`previewContext` + `previewGuard`) —
  no backend act-as, so it does not show a specific student's real data.
- **Shared UI components.** Basic elements (buttons, fields, dialogs, alerts, badges, avatars, cards,
  tabs) come from `frontend/src/components/`, which the Design System artifact is built from; today
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
  (`frontend/scripts/names.mjs`) with its reason. A new kit component lands with its guide and its
  preview (below, "Guides and previews"): `lint:design` fails for a component folder without them.
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
  published: `README.md` (the brand book, below), `tokens.json`, `tokens.css` (tokens.json compiled
  as the format lays it out), `components/bundle.js` (the kit, its hooks and helpers, and `Icon`, as one
  classic script assigning `window.GrepThinkDesignSystem_36e7e3` for a page that supplies React 18),
  `bundle.css`, `index.d.ts`, React and React DOM 18.3.1 under `components/lib/`, and each card's guide
  and preview, plus `.design-system/report.json` and a summary (the tokens kept in `bundle.css` and why).
  The bundle's `@ds-bundle` header names only the cards, the components with a guide and a preview: the
  page draws a card for every name in it. Companions, hooks and helpers stay on the namespace and in
  `index.d.ts`, each named in the guide of the component it belongs to. The build never writes
  `manifest.json` or `api/`, which are the page's. The scripts are in `scripts/design-system/`, the
  runtime the bundle carries in `design-system/runtime/`, the build config in `vite.design.config.ts`.
- `npm run design:test` runs the kit's own tests on React 18 (`vitest.design.config.ts`): React and
  React DOM 18 from the `react18` / `react-dom18` packages, the ref adapter's JSX runtime, and
  `design-system/runtime/react.ts` for every `react` import (React 19's `ref` prop and
  `useEffectEvent` on React 18). `react-router-dom` stays the real package there.
- `npm run design:check` holds the built tree to the artifact's format, and renders every preview in
  jsdom on React 18 against the built bundle. It also fails when the header names a component without a
  preview, when an export without a card is named in no guide, when `tokens.css` is not `tokens.json`
  compiled, or when the brand book misses an icon or the fonts link.

Kit source never changes for React 18: a difference belongs in the adapter or the runtime. A kit test
that cannot pass on React 18 for a reason the adapter does not cause goes in
`design-system/react18-skips.json` as `{ "file", "test", "reason" }` (its file is left out of
`design:test`), only once you have shown the adapter is not the cause; the list is empty today and each
entry is reviewed. A kit stylesheet's root classes start with `gt-`; DatePickerField's `dpf` block is the
one other, and the base layer's scope follows whatever the compiled CSS uses.

### Guides and previews

Every folder of `src/components/` (but `ErrorBoundary`, `hooks`, `icons` and `__tests__`), and Icon in
`design-system/runtime/`, carries two files beside the component, published as
`components/<Name>/README.md` and `components/<Name>/preview.html`:

- `README.md`, the guide, for a designer or an agent composing a screen. It opens with a one-sentence
  summary (no `#` title: the page adds the name), then `## Use` with `jsx` examples, `## Props that
  matter`, `## The consumer supplies` and `## Do and don't`, and a `## <Name>` section for each
  companion the folder exports (`AvatarGroup`, `TabPanel`). Plain words, second person, the app's
  vocabulary; invented names and `example.edu` emails. Every element in an example is a bundle export
  or a lucide icon the preview imports, and its opening tag, props and all, is in the preview as
  written: copy examples from the preview, which is type-checked. No `design/` paths and no pull
  request numbers.
- `<Folder>.preview.tsx`, the preview: `export const meta: PreviewMeta = { group, height }` (an object
  literal of strings and numbers; `subtitle`, `component` when the card's export is not the folder's
  name, `expects` for a selector the render must find, as an overlay's role) and
  `export default function <Folder>Preview()`. It imports the kit, lucide-react and react only, shows
  the states a designer picks between with small `ds-caption` captions (the document also styles
  `ds-stack`, `ds-section`, `ds-row` and `ds-grid`), holds state so controls work, renders overlays open
  and in place (`portal={false}`), takes no focus on its own (it would pull focus out of the page
  around the card), and reads no clock. Set `height` to what the card needs at 800px wide, where the
  kit draws its desktop sizes.

The design build compiles each preview against the bundle's namespace (`vite.design-preview.config.ts`),
so a preview proves the published bundle. Previews are left out of the app's build, its coverage, the
icon list and the `react/only-export-components` rule. `lint:design` fails when a component folder lacks
either file, when a preview's `meta` breaks the contract, or when a guide's example is not in its
preview; `design:check` fails when a preview throws, logs an error, renders nothing, misses its
`expects`, or renders differently with the clock a year apart.

### The brand book

`design-system/README.md` is the brand book, published as the artifact's `README.md`: the rules a
designer or an agent follows (content, visual foundations, the marketing surface, iconography, fonts),
with no title (the page shows the system's name) and no index of files. Its "Using this system" section
says what to load and where everything is, since the page of a system synced from code appends nothing.
The build replaces its `<!-- icons -->` line with the icons `Icon` carries. Name a token, a component or
a path in it only when the build has it.

### Publishing to the artifact

The GrepThink Design System artifact (`https://claude.ai/code/artifact/96b68559-7d84-4da1-b9bd-dbeed3238b0d`)
is synced from code: its index carries `"editing": "code"`, so its page is read-only and generates
nothing, and a change reaches it as a change here and a new publish. `/design-sync` cannot publish this
build (it sends only what its own converter built), so a sync is these steps, in Claude Code with the
Artifact tool, from a clean checkout of `beta` or `main` unless the maintainer says otherwise:

1. Run the frontend gates, then `npm run design:build && npm run design:test && npm run design:check`.
   Stop on any failure.
2. Read the artifact (`action: "read"` with its link alone), list its files (`scope: "files"`), and read
   `_files.json`, the service's list of its files with their sha256. Keep both.
3. Publish every built file whose sha256 differs, from `root` `frontend/.design-system`, each at
   `project/<its path>`, at most 255 paths a call. A card that left the kit moves aside in the same
   call: its files go to `project/archived/components/<Name>/`, exactly as you last read them, and their
   old paths are sent as `null`.
4. Last and alone, `project/design-system.json`, read again right before: every key kept but
   `lastChange` (`by` the maintainer, `via` `Claude Code · grepthink2.0@<short sha>`, `at` now, a
   `note` of at most 280 characters), `libraries`, `namespace` and `editing` (`"code"`).
5. Read `_files.json` again and compare each built file's sha256, then open the page: no card says
   "No preview yet". Report what changed, by path, and the commit published.

A sync owns `README.md`, `tokens.json`, `tokens.css`, `components/bundle.js`, `bundle.css`,
`index.d.ts`, `components/lib/**`, `components/<Name>/**` for the cards, and those keys of the index.
It leaves everything else as it is: `archived/`, `assets/`, `explorations/`, `uploads/`,
`design_handoff_*/`, `PORTING.md`, and the `api/` cards the page wrote while it was editable.

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
