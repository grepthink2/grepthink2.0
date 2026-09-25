Anchored floating surface — the base for menus, autocompletes and settings panels. White, `1px --gt-border`, radius 10, `--gt-shadow-pop`; 6px offset from the anchor; enter = 6px slide + fade 0.15s; closes on Esc/outside click; never traps focus.

```jsx
<Popover open={open} onClose={() => setOpen(false)} placement="bottom" align="end"
  anchor={<IconButton ariaLabel="Board settings" onClick={() => setOpen(!open)}><Settings size={16} /></IconButton>}>
  …panel content…
</Popover>
```

`size="sm"` → radius 7 + tighter padding; `padded={false}` for flush content like `<Menu>`.
