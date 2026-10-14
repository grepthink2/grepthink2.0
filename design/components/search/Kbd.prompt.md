Keycap hint for shortcuts and palette footers (⌘K, ↑ ↓, ↵, esc). Never the only affordance — always beside a visible label.

```jsx
<Kbd keys={[modKey(), 'K']} />
<Kbd>esc</Kbd>
```

Props: `keys` (chord), `onDark` for the green sidebar.
