Action menu composed inside a `<Popover padded={false}>` — dense 32px rows (44 on phones), optional 16px lucide icons, mono shortcut hints, destructive rows, separators. WAI-ARIA: Menu pattern — ↑ ↓ Home End move, Enter activates, Esc closes. The class and school switchers stay Menus (single-choice `radio` rows), not Comboboxes.

```jsx
<Popover open={open} onClose={close} padded={false} align="end"
  anchor={<IconButton ariaLabel="More" onClick={toggle}><MoreHorizontal size={16} /></IconButton>}>
  <Menu onClose={close} autoFocus ariaLabel="Task actions">
    <MenuItem icon={<Pencil size={16} />} onSelect={edit}>Edit</MenuItem>
    <MenuItem icon={<Link size={16} />} shortcut="⌘C" onSelect={copy}>Copy link</MenuItem>
    <MenuSeparator />
    <MenuItem icon={<Trash2 size={16} />} destructive onSelect={del}>Delete</MenuItem>
  </Menu>
</Popover>
```


Adopted from the codebase: `checked` rows (`menuitemcheckbox`, multi-select lists such as labels), `checked` + `radio` rows (`menuitemradio`, one choice — the sprint picker) and `autoFocus="checked"` (a single-choice menu opens on the current choice). A checkable row without an icon shows a 16px check slot so the state isn't colour alone.

```jsx
<Menu ariaLabel="Sprint" autoFocus="checked" onClose={close}>
  {sprints.map((s) => <MenuItem key={s.id} radio checked={s.id === current} onSelect={() => pick(s.id)}>{s.name}</MenuItem>)}
</Menu>
```

Added for the profile menu (What's new, 2026-10-23): **`MenuGroup`** — a caps label over a run of rows (`role="group"` named by it; the arrow keys skip the label) — and **`trailing`** on `MenuItem`, a slot at the row's end for a marker. The "New" marker is `<Badge status="release.new" size="sm" aria-hidden />`; the row is described by a visually hidden "New release notes" (`aria-describedby`), so its name stays "What's new".

```jsx
<Menu ariaLabel="Profile" autoFocus onClose={close}>
  <MenuGroup label="School">
    {schools.map((s) => <MenuItem key={s.id} radio checked={s.id === current} onSelect={() => pickSchool(s.id)}>{s.name}</MenuItem>)}
  </MenuGroup>
  <MenuSeparator />
  <MenuItem icon={<Settings size={16} />} onSelect={openSettings}>Settings</MenuItem>
  <MenuItem icon={<Info size={16} />} trailing={unseen && <Badge status="release.new" size="sm" aria-hidden />} aria-describedby={unseen ? descId : undefined} onSelect={openWhatsNew}>What's new</MenuItem>
  <MenuSeparator />
  <MenuItem icon={<LogOut size={16} />} destructive onSelect={logOut}>Log Out</MenuItem>
</Menu>
```
