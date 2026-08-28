Empty state with round tinted icon well + optional CTA; `Skeleton` is the shimmer placeholder.

```jsx
<EmptyState icon={<FolderOpen size={28} />} title="No projects yet"
  description="Browse open projects or create your own." action={<Button>Browse projects</Button>} />
<Skeleton width={220} height={16} />
```
