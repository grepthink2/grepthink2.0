The one dialog shell (the codebase builds one Modal; 24 hand-built modals move onto it). WAI-ARIA: Dialog (Modal) pattern.

```jsx
<Modal open={open} onClose={close} title="Edit project" size="lg" closeDisabled={saving}
  tabs={<Tabs idBase="ep" ariaLabel="Edit project" value={tab} onChange={setTab} tabs={TABS} collapseOnPhone />}
  footer={<><Button variant="outline" onClick={close} disabled={saving}>Cancel</Button><Button type="submit" form="ep-form" loading={saving} loadingLabel="Saving…">Save changes</Button></>}>
  …
</Modal>
<Modal open variant="message" size="sm" title="Join a class" subtitle="Enter the code from your instructor">…</Modal>
```

Behaviour: `role="dialog"` + `aria-modal` on the **sheet** (not the scrim), labelled by the title, described by the subtitle (and by `aria-describedby`, which ConfirmDialog points at its message). Focus moves in on the next task — `initialFocusRef`, else `[data-autofocus]`, else the first field, else the sheet (a field that took focus as it mounted keeps it) — Tab stays inside over the real tab stops (drawn, `tabIndex >= 0`, one radio per group), and on close focus returns to the opener, past a dialog that closed in the same update. Esc and a scrim click close **only the topmost** dialog; Esc is ignored while composing, repeating or already handled; Popover, InfoPopover, Combobox, DatePickerField and the ⌘K palette take Esc first (captured / stopped). `closeDisabled` holds it open while saving. Body scroll locks (counted, so dialogs closing in any order never unlock the page under one still open).

Layout: header and footer pinned, the body scrolls (`max-height: 88vh`). Sizes sm 400 (confirms, messages) · md 560 (forms) · lg 760 (Edit Project's wide sheet). **Form header** (default): title 18/600 left, subtitle 13 secondary, × top-right (`IconButton` md "Close"), `tabs` under the title; footer right-aligned (outline Cancel, primary submit) over a hairline. **Message header**: centred 28px title, no footer rule. Phones: 12px margins, footer buttons stretch, 44px controls.

Layer: `--gt-z-modal` (100) — above the sidebar (99) and header, below toasts (1000) and the date picker (1100). Opens with a 0.15s fade; closes with a 0.15s fade, instant under reduced motion. No scale.

**No dialogs over dialogs.** A row-level delete inside a dialog is an inline confirm row (`InlineConfirm`, the team-meetings `.gt-tm-row--confirm` model): the row turns into "Delete 'Sprint 3 planning'? It disappears from your team's calendars." with outline **Cancel** (focused) and danger **Delete**; Esc cancels. A destructive action outside a dialog is a ConfirmDialog.
