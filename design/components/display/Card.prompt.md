Standard white container card. Header/footer rows get 1px `--gt-border` dividers.

```jsx
<Card title="Team Status Report" subtitle="Due Jan 18, 2026" footer={<Button>Submit</Button>}>…</Card>
<Card shadow="hairline" padded={false}><Table … /></Card>
```

`shadow="card"` (signature 0 0 2.61px) · `"hairline"` (border + 0 0 4px) · `"none"`.
