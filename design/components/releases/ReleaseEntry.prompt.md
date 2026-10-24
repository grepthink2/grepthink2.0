One release in the What's new feed — `features/releases/components/ReleaseEntry.tsx`. Built on the kit: the "New" marker is `Badge status="release.new" size="sm"`, the lists are `MarkdownText` (`variant="compact"` in the port), the labels and the heading are this layer's own (`.gt-release__*`).

```jsx
<ReleaseEntry release={release} isNew={isNewSince(release, lastSeen, index)} />
```

- **Anatomy**: `<article>` → `<header>` with the date as the heading (`<time dateTime="2026-10-23">October 23, 2026</time>`, 15/600), the version beside it (Fira Code 12, tertiary) and the marker; then one `<section>` per present group — a caps label (11/600, tertiary, `--gt-tracking-wide`) over the bullet list. Groups always read New, Improved, Fixed; a missing one is simply not rendered.
- **Entries are marked by their date**, as in the Claude Code desktop app's What's new: no timeline rail, no dots, no line between them — the feed separates entries with a hairline and 18px.
- **The marker and the New group never read alike**: the marker is a blue pill in the heading row, the group label a plain caps heading. An entry can carry both.
- **Reading size**: the lists render at 13.5px / 1.55 (14px on phones) — set from `.gt-release__group .gt-md`, never on the kit's block.
- The dark look is the Modal's (`tone="dark"`): the feed adds `gt-release-feed--dark`, and the entry's heading, version, labels and bullets follow the `--gt-dark-*` ramp from that class.
