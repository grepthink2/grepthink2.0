Action menu composed inside a `<Popover padded={false}>` — dense 32px rows, optional 16px lucide icons, mono shortcut hints, destructive rows, separators. Arrows move, Enter activates, Esc closes.

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
