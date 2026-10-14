Global ⌘K search dialog for GrepThink — top-aligned 640px panel over a blurred scrim; input row, scope chips (All · Tasks · Stories · People · Chats · Projects · Teams · Classes · Assignments with counts), ranked results with group labels, footer with key hints and a compact pager (8 per page).

```jsx
const [open, setOpen] = useState(false);
<SearchTrigger onOpen={() => setOpen(true)} />
<CommandPalette open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}
  onSearch={(q, scope) => searchEverything(q, scope)} recent={recent} role={profile.role}
  onSelect={(item, route) => route && navigate(route)} />
```

Behavior: ⌘K/Ctrl+K toggles; Esc, the esc keycap, or a click on the scrim closes (150ms fade/slide out); focus goes to the input on open and back to the trigger on close; ↑↓ move (wraps), Home/End, ↵ opens, PageUp/PageDown or ←/→ at the text edge page; mouse hover and keyboard share one highlight (`--gt-info-soft`); `aria-activedescendant` keeps focus in the input. States: idle (Recent or a hint), loading (3 skeleton rows), refetching (spinner, previous results held), empty ("No results for “q”"), error (quiet retry — no red panel).
