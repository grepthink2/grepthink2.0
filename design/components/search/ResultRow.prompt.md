Palette rows. `ResultRow` = type disc + key/title (match highlighted) + entity-specific context line + type label (swaps to ↵ when active). `ResultGroup` = uppercase label with count and "See all n".

```jsx
<ResultGroup label="Tasks" count={12} onSeeAll={() => setScope('task')} />
<ResultRow item={task} query="roster" active id="gt-opt-0" onSelect={open} onHover={() => setActive(0)} />
```

Context by type — task: status dot · Due Oct 12 · 3 pts · 4h · tags; story: Sprint 3 · 8 pts · 3/5 tasks done; chat: Direct / Team channel · date + unread badge; person/team/project/class: subtitle · n members · term.
