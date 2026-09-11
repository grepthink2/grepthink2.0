Green-sidebar nav item (white text; active = light chip + left half-pill; red unread badge). Pair with `SidebarSectionTitle` for "MAIN / ACTIVITY / SETTINGS" groups. Render on the green sidebar background.

```jsx
<SidebarSectionTitle>Main</SidebarSectionTitle>
<SidebarNavItem icon={<Home size={18} />} label="Home" active />
<SidebarNavItem icon={<MessageSquare size={18} />} label="Messages" badge={8} />
```
