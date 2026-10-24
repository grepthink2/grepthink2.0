The What's new modal — `features/releases/components/WhatsNewModal.tsx`, rendered by both hosts (the landing page and the app shell). It wraps the kit's `Modal` and holds the frame; `ReleaseFeed` is the body. WAI-ARIA: the Dialog (Modal) pattern, from `Modal` / `useDialog`.

```jsx
{/* the landing page */}
<WhatsNewModal open={open} onClose={close} tone="dark" releases={releases} currentVersion={APP_VERSION} lastSeen={lastSeenAtOpen} status={status} />
{/* the app: opened from the profile menu, focus returns to the profile button */}
<WhatsNewModal open={open} onClose={close} tone="light" releases={releases} currentVersion={APP_VERSION} lastSeen={lastSeenAtOpen} status={status} onReload={() => window.location.reload()} />
```

- **Head**: the title "What's new" names the dialog; the subtitle "Version 0.91.0" (the visitor's version) describes it; the kit's × ("Close", `IconButton`). **No footer**; the body scrolls alone (`overscroll-behavior: contain` on the kit's body, so reaching its end never scrolls the page).
- **Size**: `md` (560px — the reference's one-column rhythm; entries read at 13.5px without wrapping into short lines) and the kit's phone layout (12px margins, `max-height: calc(100vh - 24px)`, the head pinned while a long feed scrolls under it).
- **Two looks, one component**: `tone="dark"` on the landing page — the Modal's dark variant covers the scrim, the head, the ×, `.gt-md`, the Skeletons, the EmptyState and the marker, and the feed follows with `gt-release-feed--dark`. The app passes `light` (the default). The app never renders dark.
- **Behaviour** the frame brings: focus moves to the sheet on open (no field inside), Tab stays inside, Esc / scrim / × close, focus goes back to the opener. The host marks the version seen on open and keeps passing the `lastSeen` it opened with, so the "New" markers do not move while the modal is up.
- **States** are `ReleaseFeed`'s: `status` loading / ready / failed; an empty `releases` list shows the empty look.
