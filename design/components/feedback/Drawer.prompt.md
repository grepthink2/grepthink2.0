A side sheet for an editor that needs the page behind it for context (the assignment editor), or the phone navigation. WAI-ARIA: Dialog (Modal) pattern — the same `useDialog` behaviour as Modal: topmost-only Esc / scrim, focus in / trapped / returned, `closeDisabled`, scroll lock.

```jsx
<Drawer open={editing} onClose={close} title="Edit assignment" subtitle="TSR 4 · due Oct 24"
  footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button loading={saving} loadingLabel="Saving…">Save</Button></>}>
  …form…
</Drawer>
<Drawer open={menuOpen} onClose={closeMenu} side="left" width={280} ariaLabel="Main menu">…</Drawer>
```

- 420px from the right (editors) or from the left (phone nav), full height, `--gt-shadow-modal`, at `--gt-z-modal` over the scrim. Header (title 16/600, subtitle, × "Close") and footer are pinned with hairlines; the body scrolls.
- Motion: slides 24px + fades in over 0.2s, reverses on close; under reduced motion it only fades. Full width on phones, footer buttons stretch.
- Use a Modal for a short focused task; a Drawer when the user benefits from seeing the list or page it edits.
