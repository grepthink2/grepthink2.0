The one loading indicator. `role="status"` with a visually hidden label; `decorative` inside busy buttons.

```jsx
<Spinner label="Loading members" />
<Spinner size={24} label="Loading analytics" />
<Button loading loadingLabel="Saving…">Save</Button>   {/* uses <Spinner decorative /> */}
```

Spinner or Skeleton:
- **Skeleton** when the layout of the coming content is known — lists, cards, tables, tiles (`aria-busy` on the region).
- **Spinner** for an action in flight (busy button, "Loading more…" row, a combobox search) or a region smaller than ~48px whose shape is unknown.
- Never both for the same region. Never a full-page spinner over content that can render as skeletons.

Sizes 14 / 16 / 20 / 24; 2px ring (2.5px at 24) in `currentColor` with a transparent quarter, 0.7s linear. Reduced motion: keeps turning at 1.6s (`!important`, so the app's global kill switch can't freeze it — the codebase's `gt-spinner` mixin).
