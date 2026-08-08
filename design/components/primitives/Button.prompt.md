Primary action button — use for any clickable action; `primary` (green CTA) once per view, `secondary`/`ghost` for supporting actions, `danger` for destructive ones.

```jsx
<Button variant="primary" size="md" onClick={save}>Save changes</Button>
<Button variant="secondary" iconLeft={<Plus size={16} />}>New project</Button>
<Button variant="danger" loading>Deleting…</Button>
```

Variants: `primary` · `secondary` · `ghost` · `danger`. Sizes: `sm` · `md` · `lg`. Props: `loading`, `disabled`, `fullWidth`, `iconLeft`, `iconRight`.
