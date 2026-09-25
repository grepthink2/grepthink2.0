Toast for async outcomes — white surface, 3px left accent bar + 16px icon in the semantic color, optional text action, × dismiss. Auto-dismiss 5s (error 8s; error with action = sticky). Render via ToastStack: bottom-right, max 3, newest on top.

```jsx
<ToastStack toasts={[
  { id: 1, variant: 'error', message: "Couldn't move GT-12 — dropped back to To do.", actionLabel: 'Undo', onAction: undo },
  { id: 2, variant: 'success', message: 'Repository saved' },
]} onDismiss={pop} />
```

Variants: `success` · `error` · `info`/`neutral` (semantic token pairs only). Reduced motion enters with opacity only. For inline (non-floating) notices use `Alert` instead.
