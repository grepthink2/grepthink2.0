# Design system from code, prototypes from briefs

**Date:** 2026-11-19 · **Status:** draft for the maintainer's approval

## 1. Why

Every shared component exists twice today: as design JSX in the GrepThink Design System and as the
shipped TSX in `frontend/src/components`. The two drift. The Kit B and Kit C reviews each produced a
list of fixes to fold back into the design copy, and on 2026-11-19 the design system was found a
month behind the repo and had to be brought up by hand.

Two things changed on 2026-11-19:

- The design system moved from standalone Claude Design into Claude, as a "Design System" artifact
  (`https://claude.ai/code/artifact/96b68559-7d84-4da1-b9bd-dbeed3238b0d`). `/design-sync` cannot
  update it yet. Claude Code's Artifact tool can, and that is how the October kit was pushed.
- The maintainer decided that **code owns new components**. The design system is rebuilt from the
  repo, and design work happens in prototypes.

## 2. What we are building

1. **A sync.** The repo builds the design system's files from the shared kit and its tokens, and a
   Claude Code command publishes them to the artifact.
2. **Prototypes.** A Claude Code command turns a brief into a Claude Design canvas: new screens,
   built from the system's real components, for the maintainer to review.

### Goals

- One copy of each shared component: the shipped one. A design made with the system maps 1:1 onto
  code that exists.
- A sync is one command, repeatable, and refuses to publish a build that fails its checks.
- A prototype is one command from a brief, and its review comes back into the repo as a handoff.

### Non-goals

- Feature components (final reviews, schedule, analytics, scrum, search and the rest) are not in
  the system. They live in `frontend/src/features/` and need the API. Prototypes draw feature
  screens as canvas markup around real kit components.
- No publishing from CI. The Artifact tool exists only in a Claude Code session.
- No change to how the app itself is built, bundled or tested.
- Dark themes. The app is light only.

### Anti-goals

- The kit's source must not change shape for the design tool's sake (no `forwardRef` rewrite, no
  router-free variants of components).
- A sync must never delete files a person added to the system by hand outside the paths it owns
  (section 4.6).
- A prototype must not present a look-alike as a kit component. A part the kit lacks is labelled a
  proposal.

## 3. Constraints found

- **The format.** The artifact's own guide (`SKILL.md` and `artifact-type/reference/format.md`,
  `from-code.md`, read from the artifact) fixes the layout: `project/design-system.json` (index),
  `tokens.json`, `README.md`, `components/bundle.js` (one classic script assigning
  `window.<namespace>`, at most 6 MB, no `import`, no literal `</script` or `<!--`),
  `components/bundle.css`, `components/index.d.ts`, `components/<Name>/README.md`,
  `components/<Name>/preview.html`, `components/lib/*.js`. The page generates `tokens.css`, the
  `api/` cards and `manifest.json`: a sync never writes those.
- **React 18 on canvases.** A Design canvas supplies React 18 to a system's components and will not
  load a second React (`artifact-type/reference/design-system-components.md` of the Design type).
  The app is on React 19, and 36 kit files take `ref` as a plain prop, which React 18 strips.
  `useDialog` also uses `useEffectEvent` (React 19.2); the design build supplies a stand-in on
  React 18. Nothing else in the kit is React 19-only (checked on beta `7d33c6a2`), and the build
  fails if that changes.
- **The router.** `Button`, `Card` and `Table` import `Link` from `react-router-dom`. A canvas and
  a preview have no router.
- **Icons.** Kit components import icons from `lucide-react`. A canvas places icons through a
  system component chosen by name.
- **Publishing.** Files of type `.jsx`, `.ts`, `.tsx`, `.scss` need `contentType: "text/plain"`; a
  call carries at most 255 files; the index goes alone in the last call, re-read right before.
- **The namespace** stays `GrepThinkDesignSystem_36e7e3`, so existing references keep working.
- **The repo's own rules.** `lint:design` owns kit naming and class ownership; coverage thresholds
  only go up; the entry chunk stays lean (nothing here may add to the app's bundle).

## 4. The sync

### 4.1 Approaches considered for React 18

- **A. Adapt in the sync build (chosen by the maintainer).** The kit's source stays as written.
  The design-system build routes element creation through a small adapter so a `ref` passed as a
  prop reaches the component on React 18. Proof is required: the kit's tests run a second time
  against the React 18 build. When canvases move to React 19 the adapter is deleted.
- **B. Rewrite the kit with `forwardRef`.** No adapter, but it churns 36 shipped, tested files into
  a pattern React 19 deprecates. Rejected: it changes the app for the design tool.
- **C. No real components on canvases.** Keep React 19 for the system's own previews and draw
  prototypes with CSS classes only. Rejected: prototypes become look-alikes that drift, which is
  the problem this work removes.

### 4.2 The build

`npm run design:build` (in `frontend/`) writes a complete file tree to `frontend/.design-system/`
(git-ignored), laid out exactly as it will be published (`project/...`). It is a separate Vite
library build with its own config; the app's `vite.config.ts` is not touched except where sharing
aliases requires it.

It produces:

| File | From |
| --- | --- |
| `components/bundle.js` | what `frontend/src/components` exports (see "What the bundle exports" below), as one IIFE that reads `window.React` / `window.ReactDOM` and assigns the namespace; line 1 is the `@ds-bundle` header listing the exports |
| `components/bundle.css` | a scoped base layer (below), the kit's compiled SCSS and `styles/keyframes.css`, with the custom properties that `tokens.json` carries left out of `:root` (the page declares them from `tokens.json`) |
| `tokens.json` | `frontend/src/styles/tokens/*.css` (colours, type and spacing, plus `marketing.css`: the public site's core palette, which the app does not load and a test keeps equal to the landing's Sass copy), as lists in the format's shape; each token's `usage` is its trailing comment; one theme, `light` |
| `components/index.d.ts` | the kit's exported prop types, as documentation |
| `components/<Name>/README.md` | the guide beside the component (4.4) |
| `components/<Name>/preview.html` | built from the preview beside the component (4.4) |
| `components/lib/react*.js` | React and ReactDOM 18.3.1 production UMD builds, vendored from the npm packages at a pinned version |
| `README.md` | the brand book: `design/readme.md` moves to `frontend/design-system/README.md` and is maintained there; the build appends nothing (the page appends its own Consuming section and index) |
| `assets/Logos/*` | the logo and marks the README names, from `frontend/src/assets/` |

**What the bundle exports.** Code decides, not the design manifest:

- every component exported from a folder of `frontend/src/components`, `TableSkeleton` and the
  other in-folder companions included;
- the hooks and helpers a canvas needs to drive them: `useTableSort`, `useDialog`,
  `useRovingFocus`, the Badge status map and the avatar helpers;
- `Icon` (below).

Left out: `ErrorBoundary` (app plumbing) and `icons/BrandIcons` (reached through `Icon`).
Design-era kit pieces that were never built in code (`Combobox`, `FileUpload`, `MarkdownEditor`,
`Stepper`, `ProfileMenu`, `SidebarNavItem`, `SidebarSectionTitle`) leave the system at the switch.
Their design files stay under `archived/`, and a prototype that needs one draws it as a proposal.

**Base styles and fonts.** The app's `index.css` sets a universal reset, the root font, line
height and text colour, bare `a` and `button` rules, and the kit's `.gt-visually-hidden` utility.
The kit leans on the box-sizing reset, the root font and `.gt-visually-hidden`; it sets its own
margins and focus rings. `bundle.css` therefore carries `.gt-visually-hidden` and opens with a base
layer scoped to the kit, with zero specificity and no bare element rules, so it cannot restyle a
prototype's own markup. Its scope S is derived from the kit's compiled CSS: the first class of
every rule, as a `gt-` prefix test, plus each other block by name (today only DatePickerField's
`dpf`). The layer sets `box-sizing: border-box` on `:where(S)`, its descendants and their
`::before` and `::after` (written outside `:where()`, which cannot hold pseudo-elements), and the
font family, line height and text colour on the outermost kit element only, since those inherit.
The format checks fail if a rule of the kit's compiled CSS starts from a class outside S. Poppins and Fira Code
are Google-hosted: `tokens.json` names them in `type.families` with no font files, each preview's
head carries the Google Fonts `<link>`, and the README's Consuming notes tell a canvas to add the
same link in its `<helmet>`.

Four substitutions happen only in this build:

1. **The React module.** Every `react` import resolves to a module that re-exports React 18's API
   by name (so a React 19-only import fails the build), adds the `useEffectEvent` stand-in, and
   exports `createElement` and `cloneElement` that carry a function component's ref in its props.
2. **The ref adapter.** The build's JSX runtime makes elements the way React 19 does: the element's
   type stays the component and a function component's `ref` travels in its props, so libraries
   that compare element types (React Router's `Routes`) still work and state survives a ref coming
   or going. Each export of the bundle is wrapped once in `forwardRef`, so a `ref` given by a
   canvas or a preview with the page's own React arrives too.
3. **`Link`.** `react-router-dom` resolves to a stub whose `Link` renders `<a href={to}>` and
   passes other props through.
4. **Icons.** The bundle exports `Icon` (`<Icon name="Trash2" size={16} />`) carrying exactly the
   lucide icons imported anywhere under `frontend/src/`, collected at build time. The README's
   iconography section lists the names. An unknown name renders nothing and warns in the console.

### 4.3 Checks (a sync refuses to publish unless all pass)

- **React 18 tests.** `npm run design:test` runs the kit's existing Vitest files with `react`,
  `react-dom` and the JSX runtime resolved as in the design build. `react-router-dom` stays the
  real package there (the Button, Card and Table tests use `MemoryRouter` and assert navigation;
  react-router 7 runs on React 18). The `Link` stub and `Icon` get small tests of their own. A test that
  cannot pass on React 18 for a reason unrelated to the adapter may be listed in a skip file with
  its reason; the list starts empty and each entry is reviewed.
- **Format checks.** A script validates the tree against the constraints in section 3: bundle size
  and forbidden strings, the header's names all present on `window.<namespace>` after a load in
  jsdom with the vendored React 18, token names and value grammar, every component with a guide and
  a preview, preview line 1 is a `@dsCard` marker, no file the page generates.
- **CI.** `design:build`, `design:test` and the format checks run in `.github/workflows/test.yml`
  on every pull request. They do not count toward the coverage thresholds.

### 4.4 Guides and previews, in code

Each kit component gains, beside its source:

- `README.md`: when to use it, what the consumer supplies, a short example, its variants. First
  sentence is the summary. Seeded from the current guides in the artifact
  (`project/components/<Name>/README.md`), then corrected against the shipped props.
- `<Name>.preview.tsx`: a default export rendering a few telling states, with no network and no
  app context. The build compiles each into `preview.html` (line 1
  `<!-- @dsCard group="<group>" height=N -->`), mounting from the bundle's namespace so a preview
  proves the published bundle, not the source.

Groups follow the design manifest's (`Primitives`, `Display`, `Feedback`, `Navigation`).
`lint:design` fails when a kit component lacks either file. Preview files are excluded from the
app build, from coverage and from the `react/only-export-components` rule.

A component the manifest lists inside another's folder (for example `AvatarGroup`, `TabPanel`,
`InlineConfirm`) shares that folder's guide and preview; it still appears in the bundle header.

### 4.5 Publishing

A project skill, `.claude/skills/design-sync-from-code/SKILL.md`, invoked as
`/design-sync-from-code`, tells Claude Code to:

1. Run `design:build`, `design:test` and the format checks; stop on any failure.
2. Read the artifact's index and file listing.
3. Publish the built tree in calls of at most 255 files, the index alone and last, with
   `lastChange` set (`by` the maintainer, `via` `Claude Code · grepthink2.0@<short sha>`, a note of
   what changed) and `tokens.json` `meta.source` recording the repo, ref and date.
4. Read back the bundle, the stylesheet, `tokens.json` and three guides, and compare checksums.
5. Report what changed, by path.

The skill publishes only from a clean checkout of `beta` or `main` unless told otherwise, and
names the commit it published. The artifact URL lives in the skill file.

When `/design-sync` can update Claude, it replaces this skill. Its config
(`.design-sync/config.json`) is not written by this work.

### 4.6 What a sync owns

A sync writes and may remove only: `README.md`, `tokens.json`, `components/bundle.js`,
`components/bundle.css`, `components/index.d.ts`, `components/lib/**`, `components/<Name>/**` for
names in the current build, `assets/Logos/**`, and the index's `lastChange`, `libraries` and
`namespace`. Everything else in the artifact is left alone.

### 4.7 The switch (first code sync)

- The design-era component files move to `archived/` in the artifact, keeping their paths:
  `components/<group>/**` (the JSX, `.d.ts`, CSS and gallery pages of all 13 groups, figma-reference
  included), `ui_kits/**`, `templates/**`, `guidelines/**`, `tokens/**`, `styles.css`,
  `keyframes.css`, `support.js`, `frontend/**`, `docs/**`, and the guides of components that are
  not in the kit. The maintainer confirms the list in the skill's first run before anything moves.
- `design_handoff_*/**`, `uploads/**`, `PORTING.md` and `assets/notes/**` stay as reference.
- In the repo, `design/` is frozen: `design/PORTING.md` gains a header saying the system is now
  built from code and pointing here, and `AGENTS.md` and `docs/agents/` are updated (the "Shared UI
  components" rules, the directory map, the import recipe). `lint:design`'s name check keeps
  reading `design/_ds_manifest.json` until a follow-up moves the name index into `frontend/`.

## 5. Prototypes

### 5.1 Flow

`brief → canvas built from the real kit → review comments → revisions → handoff → spec, plan, build`

A project skill, `.claude/skills/design-prototype/SKILL.md`, invoked as
`/design-prototype <brief folder>`:

1. Reads the brief at `docs/superpowers/handoffs/<date>-<topic>/README.md`.
2. Creates a Design canvas in Claude named after the brief, installs the GrepThink system on it
   (the Design type's own install steps), and records the canvas URL in the brief folder
   (`CANVAS.md`).
3. Builds the brief's screens and states as artboards at desktop (1280) and phone (390) widths.
   Kit components are mounted from the bundle; screen layout and feature content are canvas
   markup using the system's tokens.
4. Draws anything the kit lacks on the canvas with a visible "Proposal" label, and lists it.

Review happens on the canvas. The maintainer comments there and shares it from the page when
others should look. Run again with `--revise`, the skill reads the comments, revises, and replies
on each thread.

Run with `--handoff`, it writes `HANDOFF.md` in the brief folder: the screens, each proposed kit
piece with its props, states and tokens, new tokens, departures from the brief, and open
questions. That file feeds the usual spec. New kit pieces are built in `frontend/src/components`
first; the next sync adds them to the system.

A canvas keeps its own copy of the system, so an old prototype does not change until someone
updates it. `--update-system` re-installs the current version.

### 5.2 What it replaces

Claude Design rounds that returned zips, `design/uploads/`, pasting `PROMPT.md` by hand, and
`design/PORTING.md`'s import-and-port recipe. Briefs keep their place and shape under
`docs/superpowers/handoffs/`, minus the delivery sections that asked for kit files.

The two briefs written on 2026-11-19 (notifications and profiles; email templates) predate this.
The first becomes the first prototype run, once the sync has shipped. The email brief delivers
HTML email, not React, and is outside this flow.

## 6. Order of work

One pull request each, stacked on `beta`, each with its own review as AGENTS.md sizes it:

1. **Build and adapter:** the design build, the ref adapter, the `Link` stub, `Icon`, `tokens.json`
   and `index.d.ts` generation, `design:test`, the format checks, CI.
2. **Guides and previews:** a `README.md` and preview for every kit component, the `preview.html`
   build, the `lint:design` rule.
3. **The sync skill and the switch:** the skill, the brand book's move, the first code sync
   (run by the maintainer with Claude Code), the doc updates.
4. **The prototype skill**, proven on the notifications and profiles brief.

Planning and review stay in the main session; implementers are Opus subagents at extra-high
effort, one per pull request.

## 7. Left to the builder

- The adapter's mechanism and the Vite configuration, within 4.2 and 4.3.
- How `index.d.ts` is produced (the TypeScript 7 toolchain has no stable JS API; `tsc` emit plus
  concatenation is the expected route).
- How previews are compiled and how their heights are measured.
- The format-check script's structure and where the scripts live under `frontend/scripts/`.
- The exact wording of the two skills, following the artifact types' own guides at run time.

## 8. The format, as the checks pin it

Summarised from the artifact type's guide (release `1795108590-2e94`). The skills read the live
guide at run time; the build and its checks rely only on what is written here.

- **Index** (`project/design-system.json`): keys `v: 3`, `layout: "files"`, `createdOnFiles`,
  `title`, `namespace`, `libraries` (`[{name, version, global, file}]`), `groups`, `assetGroups`,
  `sections`, `blobs`, `docs`, `lastChange` (`{by, at, via, note}`; note at most 280 characters).
  The page maintains `sections`, `blobs` and `docs`. It lists components from the bundle header,
  then from each `components/<Name>/` folder that has a guide or a preview, so the index holds no
  component list and the switch needs no index rewrite beyond the keys in 4.6.
- **Bundle header**, line 1 of `bundle.js`:
  `/* @ds-bundle: {"format":4,"namespace":"<Ns>","components":[{"name":"Button"}, …]} */`.
- **`tokens.json`**: `{name, version, color: {themes: [{id, name}], tokens: [{name, value, usage}]},
  type: {fonts: [], families: {sans, mono}, groups: [{name, family, styles: [{name, fontSize,
  lineHeight, fontWeight}]}]}, spacing: {tokens}, radius: {tokens}, shadow: {tokens}, <other>:
  {tokens}, meta}`. Every family but `type` is a list. Names match
  `[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`, each used once across all families but `type`. Colour values:
  hex, or `rgb()/rgba()/hsl()/oklch()` with plain numbers, or an alias `"{other-token}"`; never
  `var()`, `color-mix()` or a named colour. Lengths: `px|rem|em|%` or a number. At most 600
  colours, 12 families, 60 tokens in each other family, 80 type styles. A value the grammar cannot
  hold stays in `bundle.css` and is reported by the build.
- **Preview**, `components/<Name>/preview.html`: line 1
  `<!-- @dsCard group="…" height=N -->` (optional `width`, `subtitle`), then a small complete
  document with a root element and one script. The frame preloads the tokens, `bundle.css`, the
  libraries and the bundle. No `<iframe>`, `<object>` or `<embed>`; at most 256 KB.
- **Caps**: `bundle.js` 6 MB, `bundle.css` 2 MB, a library file 2 MB, a guide 64 KB, the README
  200 KB.

## 9. Risks

- **The adapter hides a React 18 difference the tests miss** (effects timing, `useId` shapes,
  transitions). Mitigation: the full kit suite on React 18, plus the previews, which render the
  published bundle.
- **The artifact format changes.** Both skills read the type's current guide at run time rather
  than copying its rules; the format checks pin only what section 3 lists.
- **Token drift between `tokens.json` and the SCSS partials** (`_colors.scss`, `_variables.scss`).
  Out of scope here; the build reads only `styles/tokens/*.css`, and a follow-up may make the
  partials derive from them.
- **Canvases moving to React 19** makes the adapter dead weight. It is isolated in the design
  build so removing it is one change.

## Amendment, 2026-11-23: the first sync

Made while doing step 3 (section 6), with the maintainer.

- **Publishing (4.5).** `/design-sync` can publish to a Design System artifact now, but only what its
  own converter built: its publish step refuses a tree its driver did not build and check, and the
  converter compiles the kit its own way, without the ref adapter, the `Link` stub or `Icon`. It cannot
  publish `design:build`'s tree. So 4.5's steps stand, done by hand with the Artifact tool and written
  down in `docs/agents/frontend.md` ("Publishing to the artifact"). There is no project skill:
  `.claude/` is git-ignored.
- **Synced from code.** The index carries `"editing": "code"`. The page is then read-only for everyone,
  generates no file and appends nothing to the README, and a change to the system is a change to the
  code and another publish. Section 3's "the page generates `tokens.css`" no longer holds: the build
  writes `tokens.css`, compiled from `tokens.json` as the format lays it out, with the page's
  generated first line, and `design:check` requires it to equal `tokens.json` compiled.
- **What a sync owns (4.6)** gains `tokens.css` and the index's `editing`, and loses `assets/Logos/**`:
  the build writes no logos, and the marks stay where they are under `assets/`.
- **The bundle header (4.2, 4.4)** names only the cards, the components with a guide and a preview
  (42 at the first sync: the kit's 41 folders and `Icon`). The page draws a card for every name in the
  header, so a companion, hook or helper there was a card saying "No preview yet". Every export stays on
  the namespace and in `index.d.ts`, and is named in the guide of the component it belongs to.
  `design:check` fails when the header names a component without a preview in the kit or leaves out one
  with a preview, and when an export without a card is named in no guide.
- **The brand book (4.2)** is `frontend/design-system/README.md` (moved from `design/readme.md`), its
  text taken from the artifact's README of 2026-11-23, which was newer: the design-era file index and
  the source notes left out, the paths that moved cut, the link colour brought up to the tokens, and a
  "Using this system" section added, since the page appends no Consuming section to a system synced
  from code. The build lists the icons in it.
- **The switch (4.7)** moves the design-era files to `archived/`, as its pull request lists them, and
  the feature components' folders with them (section 2, non-goals).
