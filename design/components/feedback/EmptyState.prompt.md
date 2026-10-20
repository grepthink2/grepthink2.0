Empty, quiet and failed regions. Four variants cover the app's 84 empty states.

```jsx
<EmptyState icon={<FolderOpen size={28} />} title="No projects yet" description="Projects your class creates appear here." action={<Button>Create project</Button>} titleAs="h2" />
<EmptyState variant="card" icon={<BarChart3 size={18} />} title="No messages in this range" />
<EmptyState variant="quiet" title="No upcoming meetings." />
<EmptyState variant="error" title="Couldn't load team meetings." onRetry={reload} />
<NoClassSelected onSelectClass={openClassSelector} />
```

- **page** — centred, 64px `--gt-primary-soft` icon well, 20px title, 14px secondary description, actions.
- **card** — inside a card, chart or table row (analytics' `.gt-empty--card`, now shared): min 120px, 36px sunken disc, 13px title, caption hint.
- **quiet** — left-aligned 12.5px secondary text, no icon well (the schedule's quiet lines).
- **error** — the quiet look plus a **Try again** link (`RefreshCw`), `role="status"`. Never a red panel; persistent page-level failures are an Alert.
- `titleAs` sets the heading level from the context (h2 on a page, h3 in a section, p in a table row).
- **No class selected** is written once: GraduationCap, "No class selected", "Choose a class to see this page. You can switch classes any time from the class selector.", and an outline **Choose a class** that opens the selector.
- `Skeleton` lives here too (loading placeholders; see Spinner for when to use which).
