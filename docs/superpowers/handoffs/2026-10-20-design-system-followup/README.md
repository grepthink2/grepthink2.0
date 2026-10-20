# Brief for Claude Design — design-system follow-up round (2026-10-20)

The alignment round's export landed in the codebase on 2026-10-20 (`design/` imported in PR #256), and the port is
under way. This short round fixes one thing the export broke, folds back what the codebase changed, records the
port's answers to your `NOTES.md` questions, and adds the one shared control the app still lacks.

Run it before, or as the first part of, the next screen round (Settings, or the C2 final-review sign-up screens).
It changes no screen layouts.

## 1. Restore the GrepThink logo

**What happened.** The 2026-10-19 export removed the `<style>` block from `assets/grepthink-logo.svg`. That block held
the three rules that colour the logo's shapes:
- `.cls-1` is white `#fff` (27 shapes);
- `.cls-2` and `.cls-3` are dark green `#006837` (7 shapes).

The shapes still carry their classes. With no rule for those classes, every shape falls back to black, so the logo now
draws as a black silhouette wherever a design screen shows it:
- the landing kit, its contact page, OG image and preview frame;
- the app screens for search, team meetings, schedule, analytics and the scrum board.

The reference copy of the app's logo, `frontend/src/assets/grepthink l logo.svg`, has been in the same stripped form
since it was first copied in on 2026-09-24. The app's own file in the codebase is intact; only the design side is
affected.

**Most likely cause.** The no-raw-hex rule was applied to an asset file. That rule covers component CSS, and code that
reads tokens, because `lint:design` scans the codebase's styles and scripts. An SVG used as an image cannot read
`--gt-*` custom properties at all, so its colours have to stay literal.

**Do:**
- Replace `assets/grepthink-logo.svg` with the attached `grepthink-logo.svg`. That is its version from before the
  2026-10-19 export.
- Replace `frontend/src/assets/grepthink l logo.svg` with the attached `grepthink l logo.svg`, the app's own file.
- Copy both byte for byte: no re-export, no recolouring, no minifying.

**Rule from now on.** Files under `assets/` and `frontend/src/assets/` are brand and image assets, and keep their
colours as delivered. Never strip or tokenise an SVG's fills.

## 2. Fold back what the codebase changed

The port's first PR (merged 2026-10-20) changed some shared styling. Mirror these changes so that the next re-port
stays a no-op.

1. **Shared keyframes.**
   - Four keyframes now live once, in the codebase's `frontend/src/styles/keyframes.css`, which `main.tsx` loads:
     `gt-pop-in`, `gt-rise-in` (a 4px rise), `gt-spin` and `skeleton-shimmer`.
   - `_motion.scss` and `_skeleton.scss` now keep only their mixins. Before, every stylesheet that imported them
     emitted its own copy of each keyframe (33 copies apiece).
   - Refresh the reference copies under `frontend/src/styles/` from the three attached files: `keyframes.css` is new,
     and `_motion.scss` and `_skeleton.scss` change.
2. **Toast's entrance keyframe is `gt-toast-rise-in` in the codebase.**
   - The design named it `gt-rise-in`, an 8px rise. That collides with the motion layer's 4px `gt-rise-in`, which
     messages use, and whichever stylesheet loads last wins for both.
   - Rename it in `components/feedback/feedback.css`: the `@keyframes` rule, the `.gt-toast` animation, and the
     reduced-motion rule.
3. **One keyframe name, one definition.**
   - Name a component's keyframes after the component, as `gt-drawer-in-right` already does, unless it is one of the
     four shared ones above.
   - `display.css`'s `gt-skeleton-shimmer` has the same steps as the shared `skeleton-shimmer`, so use the shared name.
4. **`lint:design` now runs two checks.**
   - The first is the raw-hex scan.
   - The second is an ownership check (`frontend/scripts/ownership.mjs`). A feature stylesheet fails when a selector
     begins with a shared component's class, and feature markup fails when it writes a shared class by hand.
   - Update the `lint:design` bullet in `PORTING.md`.
5. **Skeleton's class is `gt-skeleton`** in the codebase too (it was `skeleton`), matching your name.
6. **Codebase additions to record** in `PORTING.md` → "Known deltas":
   - Button takes a `to` prop that renders a react-router link;
   - Tooltip hides an open bubble on Esc (item 3.4 below).

## 3. The port's answers to `NOTES.md` §5

Record these in `NOTES.md` or `PORTING.md`. Where an item says to change something, change it this round.

1. **`title` props** stay as they are.
2. **The ⌘K palette joins the dialog stack** when its area migrates, so Esc closes the palette before a dialog under
   it. Show that order in the search gallery.
3. **PasswordField** keeps the constant name "Show password" with `aria-pressed`. Your call is accepted.
4. **Tooltip:** Esc hides an open bubble, for WCAG 1.4.13. The port adds this now. Add it to `Tooltip.jsx` and its
   `.prompt.md`.
5. **`loadingLabel`** gets no lint rule.
6. **Single-choice filters** in the kit screens become `FilterChipGroup type="single"`:
   - the palette's scopes;
   - the analytics range, with "Custom…" staying a separate button after the group;
   - the roster's "All students / Unteamed".
7. **StatCard `info`:** only one Dashboard metric has an explanation today. Registered Students reads "Students
   registered in GrepThink". Use that; the other tiles carry no info trigger.
8. **Team meetings:** rebuild the kit screen (`ui_kits/grepthink/team-meetings.html` and `TeamMeetingsScreen.jsx`) from
   the shared Button, fields, Alert and InlineConfirm, as the codebase now does.
9. **`--gt-border-control`** at #858585 is accepted.

## 4. One new control: Slider

The TSR's contributions step sets each teammate's share with a native range input
(`features/app/components/TSRS/ContributionsTab.tsx`). Today it is styled by that feature alone, and the kit has
nothing to replace it.

Design `primitives/Slider` (`.jsx` + `.d.ts` + `.prompt.md`, plus a gallery):
- a labelled range on the field shell (`FieldShell`), with min, max and step;
- the value shown beside it, with an optional unit ("%");
- an optional paired number input, kept in sync;
- disabled and error states;
- keyboard behaviour per the WAI-ARIA slider pattern: arrows, Page Up/Down, Home/End;
- a 44px touch target on phones;
- tokens only.

## 5. Deliver

1. The two logo files restored (§1) and the reference copies refreshed (§2.1).
2. The keyframe renames in `feedback.css` and `display.css` (§2.2–2.3).
3. `PORTING.md`: the `lint:design` bullet, and the Known deltas (§2.4–2.6).
4. `NOTES.md`: §3 recorded, plus the kit screens and the Tooltip change it asks for.
5. `primitives/Slider` (§4), with a line in `readme.md` → "Intentional additions".
6. `_ds_manifest.json` updated, as in earlier rounds.

No other new components, and no screen redesigns. Raw hex stays out of component CSS (assets excepted, §1).
