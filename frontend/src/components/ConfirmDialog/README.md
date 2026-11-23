Asks before an action that cannot be undone: a small dialog that names the action, says what will happen, and runs it on Confirm.

## Use

```jsx
<ConfirmDialog
  open
  portal={false}
  destructive
  title="Delete Sprint 3 planning?"
  message="It disappears from your team's calendars."
  confirmLabel="Delete"
  busyLabel="Deleting…"
  onConfirm={failSoon}
  onCancel={cancel}
/>
```

In the preview, Delete fails after a moment, to show the busy state and then the error. `portal={false}` draws it in place, for a canvas or a gallery; in a screen leave it out.

## Props that matter

- `open`; `title`, the question ("Delete Sprint 3 planning?"); `message`, the thing and the consequence.
- `confirmLabel` (default "Confirm"), `busyLabel` ("Deleting…"), `cancelLabel` (default "Cancel").
- `destructive`: Confirm becomes the solid red button.
- `onConfirm`: may return a promise. While it runs, Confirm shows `busyLabel` with a spinner, Cancel and the × wait, and Esc and the scrim do nothing. If it rejects, the dialog stays open with an error under the message (`errorText`, default "That didn't work. Try again."). On success, close it yourself.
- `onCancel`: Cancel, Esc, the scrim and the × call it.
- `busy` and `error`: set from outside, in place of what the promise gives.

Cancel takes focus first. It is an alert dialog on the Modal's small sheet.

## The consumer supplies

- The question and the consequence in plain words, and `open` with the close on success.

## Do and don't

- Do confirm only what cannot be undone; an undoable action gets an Undo in a Toast instead.
- Don't open it from inside another dialog: use InlineConfirm there.
- Don't use "Are you sure?" as the title: name the action.

## InlineConfirm

The row-level delete inside a dialog, never a dialog over a dialog: the row turns into a muted strip with the sentence, outline Cancel and red Delete.

```jsx
<InlineConfirm
  autoFocus={false}
  message="Delete 'Sprint 3 planning'? It disappears from your team's calendars."
  busy={rowBusy}
  onConfirm={() => setRowBusy(true)}
  onCancel={() => setRowBusy(false)}
/>
```

- `message` names the group. `confirmLabel` (default "Delete"), `busyLabel` (default "Deleting…"), `cancelLabel`.
- `busy`: Delete shows `busyLabel` and keeps focus.
- `autoFocus`, default `true`: Cancel takes focus when the row turns into the confirm. The preview turns it off so the card does not take focus.
- Esc cancels without closing the dialog around it.
