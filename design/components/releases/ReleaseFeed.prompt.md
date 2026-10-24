The What's new modal's content — `features/releases/components/ReleaseFeed.tsx`, the `lazy()` chunk the frame loads on first open (with the parsed notes and MarkdownText). Four states, built on the kit.

```jsx
<ReleaseFeed releases={releases} lastSeen={lastSeenAtOpen} status="ready" />
<ReleaseFeed status="loading" />
<ReleaseFeed status="failed" onReload={() => window.location.reload()} />
<ReleaseFeed releases={[]} />            {/* empty — cannot ship (the test requires a file), but it has a look */}
```

- **Ready**: `ReleaseEntry` per release, newest first, a hairline between entries. The "New" markers come from `isNewSince(release, lastSeen, index)`: newer than the version this browser last saw; on a first visit only the newest.
- **Loading**: two ghost entries of `Skeleton` rows (a heading, a version, a label, three lines), `aria-busy` and a visually hidden "Loading release notes" status. Usually a blink.
- **Failed**: the card `EmptyState` with one line, "The release notes didn't load.", and a primary **Reload** button (`Button size="sm"`) that reloads the page — a retry would ask for the same file a deploy removed. `role="status"` on the wrapper.
- **Empty**: the card `EmptyState` ("No release notes yet").
- **Dark** (`tone="dark"`, inside `Modal tone="dark"`): the feed adds `gt-release-feed--dark`; the heading, version, labels, bullets and hairlines take the `--gt-dark-*` ramp. `.gt-md`, the Skeletons, the EmptyState and the marker are already the dark Modal's.
- The host keeps the `lastSeen` it opened with: marking the version seen on open must not move the markers while the modal is up.
