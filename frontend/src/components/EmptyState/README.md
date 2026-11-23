What a region shows when it has nothing in it yet, nothing matching, or failed to load: a short title, a line of help and the next step.

## Use

```jsx
<EmptyState
  icon={<FolderOpen size={28} />}
  title="No projects yet"
  description="Projects your class creates appear here."
  action={<Button>Create project</Button>}
  titleAs="h2"
/>
<EmptyState variant="card" icon={<BarChart3 size={18} />} title="No messages in this range" />
<EmptyState variant="quiet" title="No upcoming meetings." />
<EmptyState variant="error" title="Couldn't load team meetings." onRetry={reload} />
```

## Props that matter

- `variant`, default `page`:
  - `page`: centred, with a 64px tinted icon well, a 20px title, the description and the action.
  - `card`: the small one inside a card, a chart or a table row.
  - `quiet`: a left-aligned line with no icon, for a schedule or a list in a sidebar.
  - `error`: the quiet look with a "Try again" link (`onRetry`, `retryLabel`), announced as a status. Never a red panel.
- `title` (visible text) and `description`.
- `icon`: a lucide icon, 28px on a page and 18px in a card; not shown for `quiet` and `error`.
- `action`: the Button(s) of the next step.
- `titleAs`, default `h3`: the heading level for where it sits (`h2` on a page, `p` in a table row).
- `compact`: less padding on a page.

## The consumer supplies

- The words: what is missing and how to get it. For `error`, the retry.

## Do and don't

- Do say why it is empty and what to do ("Projects your class creates appear here.").
- Do use `card` inside cards and tables, so the empty state keeps the container's size.
- Don't use a red panel for a failed region: use `error`, or an Alert for a lasting failure.

## NoClassSelected

The one empty state for a page that needs a class: a graduation cap, "No class selected", how to pick one, and an outline "Choose a class" button when `onSelectClass` is given.

```jsx
<NoClassSelected onSelectClass={openClassSelector} variant="card" titleAs="h3" />
```

- `onSelectClass`: opens the class selector (the app passes its `openClassSelector`). `variant`, default `page`, or `card`. `titleAs`, default `h2`.
