The one dialog shell: a titled sheet over a dimmed page, for a short form or a message someone must deal with before going on.

## Use

```jsx
<Modal
  open
  onClose={close}
  portal={false}
  title="Edit project"
  subtitle="Bike Share Map · Team 4"
  footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={close}>Save changes</Button></>}
>
  <p>Your team sees the new name and description as soon as you save.</p>
</Modal>
```

`portal={false}` renders the dialog in place, inside its parent: what a canvas artboard or a gallery wants. In a screen, leave it out. The dialog then renders in `<body>` above everything, moves focus in and keeps Tab inside, locks the page's scroll, and gives focus back to the button that opened it when it closes.

## Props that matter

- `open` and `onClose`: Esc, a click on the scrim and the × call `onClose`, for the topmost dialog only.
- `title` names the dialog (a visible heading, never the HTML `title` attribute); `subtitle` describes it. With no title, give it an `ariaLabel`.
- `footer`: the action row pinned under the body, right-aligned. Outline Cancel first, then the primary action.
- `size`, default `md`: `sm` 400px (confirms, messages), `md` 560px (forms), `lg` 760px (a wide form with tabs).
- `variant`, default `form`: `form` puts an 18px title on the left and the footer over a hairline; `message` centres a 28px title.
- `tabs`: a Tabs strip under the title, for a form in sections.
- `closeDisabled`: holds the dialog open while it saves. The × is disabled, and Esc and the scrim do nothing.
- `initialFocusRef`: what takes focus on open. Without it, an element marked `data-autofocus`, then the first field, then the sheet.
- `hideClose` drops the ×; `role="alertdialog"` is for a confirmation (ConfirmDialog sets it).
- `bodyLabel` makes a long read a named, focusable scroll region, so the keyboard can scroll it.
- `tone="dark"` is the landing page's look (What's new). The app stays light.

The header and footer stay put while the body scrolls, up to 88% of the window's height. On phones the sheet keeps 12px margins and the footer buttons stretch.

## The consumer supplies

- `open`, and an `onClose` that sets it false.
- The title, and the footer's buttons with their own handlers: `loading` on the submit button while it saves, with `closeDisabled` on the dialog.
- The body: fields with visible labels, or a short message.

## Do and don't

- Do use one Modal per task, sized to its content.
- Don't open a dialog over a dialog. A delete inside a dialog is an InlineConfirm row; a destructive action on a page is a ConfirmDialog.
- Don't use a Modal for a side panel that keeps the page in view: that is a Drawer.
- Don't put the primary action anywhere but the footer.
