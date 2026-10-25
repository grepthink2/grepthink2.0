The What's new model — the pure parts of `features/releases/`: versions (`version.ts`), the "New" and "unseen" rules (`seenStore.ts` / `useWhatsNew.ts`), the calendar date (`releaseDate.ts`) and a reader for the notes files (`releaseNotes.ts`). No UI; the galleries feed the brief's sample Markdown through it.

```js
const releases = releasesFromNotes(window.GT_RELEASE_NOTES_SAMPLE);   // newest first
isUnseen('0.92.0', null)          // true  — a first visit shows the dot
isUnseen('0.92.0', '0.91.0')      // true  — a release since
isUnseen('0.92.0', '0.93.0')      // false — a rollback counts as seen
isNewSince(releases[0], null, 0)  // true  — first visit: only the newest entry is "New"
isNewSince(releases[1], '0.91.0', 1) // true  — 0.91.1 is newer than 0.91.0
formatReleaseDate('2026-10-23')   // "October 23, 2026", in every time zone
```

- **Versions** are `MAJOR.MINOR.PATCH`, digits only; `compareVersions` is numeric part by part (0.9.0 < 0.10.0 < 0.91.0 < 1.0.0) and an invalid string sorts below every valid one.
- **The date is a calendar date, not an instant**: build it from its parts and format in UTC. The repo's rule that shows instants in the viewer's zone does not apply.
- **`parseReleaseNotes`** reads the front matter's `date` and the three `##` markers, hands each section's bullet list on as Markdown (the entry draws the group labels itself, so file heading levels never clash with the modal's) and returns sections in the canonical order. It only reads; the repo's `releaseNotes.test.ts` is what rejects a malformed file.
- `RELEASE_GROUPS` is the one place the order and the labels live.
