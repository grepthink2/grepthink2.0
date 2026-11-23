A side sheet that slides in over the page (an editor that keeps the page in view, or the phone navigation), with the Modal's behaviour.

## Use

```jsx
<Drawer
  open
  onClose={close}
  portal={false}
  title="Edit assignment"
  subtitle="CSE 115A · Fall 2026"
  footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={close}>Save</Button></>}
>
  <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
</Drawer>
```

`portal={false}` draws it in place, filling its parent (the preview gives it a page-height box). In a screen, leave it out: it then covers the window, traps focus, locks the page's scroll and gives focus back when it closes.

## Props that matter

- `open` and `onClose`: Esc, the scrim and the × call it, for the topmost dialog only.
- `title` names the drawer and `subtitle` describes it; without a title, pass `ariaLabel` ("Main menu").
- `footer`: the action row pinned at the bottom: outline Cancel, then the primary action.
- `side`, default `right` (editors); `left` for the phone navigation.
- `width`: px or any CSS length, default 420px. It is full width on phones.
- `closeDisabled`: holds it open while it saves.
- `initialFocusRef`: what takes focus on open; otherwise `data-autofocus`, then the first field.

The header and footer stay put while the body scrolls. It slides 24px in and fades over 0.2s, and only fades under reduced motion.

## The consumer supplies

- `open` and the close, the title, the body and the footer's buttons with their handlers.

## Do and don't

- Do use a Drawer when the person needs the page beside the form; otherwise a Modal.
- Don't open a Drawer over a Modal, or the other way round.
- Don't put navigation for a wide screen in a Drawer: it is the phone's menu.
