An inline message for a condition that lasts until something changes (preview mode, a failed load, a save error above a form's buttons), in one of four tones.

## Use

```jsx
<Alert tone="warning" title="The late window closes Friday">
  Reports submitted after the deadline are marked late.
</Alert>
<Alert
  tone="error"
  title="Couldn't save your changes"
  actions={<Button size="sm" variant="outline" onClick={retry}>Try again</Button>}
>
  Check your connection; your edits are still here.
</Alert>
```

A notice the person may hide gets a × through `onDismiss`:

```jsx
<Alert tone="info" title="You're viewing this class as a student" onDismiss={() => setShowPreview(false)}>
  Nothing you do here is saved.
</Alert>
```

## Props that matter

- `tone`, default `info`: `success`, `warning` or `error`. Each has its soft fill, text colour and icon.
- `title`: a bold first line (visible text, never the HTML attribute).
- Children: the body; paragraphs and links both fit.
- `actions`: buttons under the body, small outline Buttons ("Try again", "Restore draft").
- `onDismiss`: adds a "Dismiss" ×.

An `error` alert is announced at once (`role="alert"`), so mount it when the error happens; the other tones are polite status messages.

## The consumer supplies

- The words: what happened and what to do next. The handlers for its actions, and for `onDismiss` hiding it.

## Do and don't

- Do put a form's save error in an Alert above its buttons, and each field's own error under the field.
- Do use a Toast instead for a passing confirmation ("Saved"), and an EmptyState with Try again for a region that failed to load.
- Don't stack several alerts for one problem.
- Don't make an error alert dismissible while the error still holds.
