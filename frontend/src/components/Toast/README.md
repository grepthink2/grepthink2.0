A short message that floats in at the bottom right after something happened (saved, moved, failed), with an optional action such as Undo, and fades away on its own.

## Use

Shown with the stack and its queue, as a screen does:

```jsx
<Button variant="outline" size="sm" onClick={() => push('success', 'Meeting scheduled')}>Show a toast</Button>
<ToastStack toasts={toasts} onDismiss={dismiss} />
```

One toast on its own, as the preview lays them out:

```jsx
<Toast
  variant="error"
  message="Couldn't move GT-12; it dropped back to To do."
  actionLabel="Undo"
  onAction={undo}
  onDismiss={() => hide('moved')}
/>
```

## Props that matter

- `variant`, default `info`: `success`, `error`, `info` or `neutral` (drawn as `info`). Each has its accent bar and icon.
- `message`: one sentence.
- `actionLabel` with `onAction`: a text button such as "Undo" or "Retry".
- `onDismiss`: shows the × and lets the toast time out.
- `duration` in ms: by default 5 seconds, 8 for an error, and an error with an action stays until dismissed. `0` keeps it.

An error toast is announced at once (`role="alert"`); the others politely.

## The consumer supplies

- The message and its action. Toasts go through ToastStack and useToasts.

## Do and don't

- Do use a Toast for the outcome of an action the person just took, and an Undo where the action can be undone.
- Do use an Alert for something that lasts until it is fixed.
- Don't put anything essential only in a Toast: it goes away.

## ToastStack

The fixed container at the bottom right of the window: newest first, at most three shown.

- `toasts`: the queue (`{ id, variant, message, actionLabel?, onAction?, duration? }`); `onDismiss(id)`.

## useToasts

The queue for a ToastStack: `const { toasts, push, dismiss } = useToasts()`. `push(variant, message, extra?)` adds a toast and returns its id; `dismiss(id)` removes one.
