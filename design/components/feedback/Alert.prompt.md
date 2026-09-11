Inline alert on the semantic soft-bg/text pairs — embedded in a view, not floating (floating = Toast).

```jsx
<Alert tone="warning" title="TSR due in 2 days">Submit before Jan 18, 11:59 PM.</Alert>
<Alert tone="error" onDismiss={hide}>That code doesn't match an open class.</Alert>
```

Tones: `success` · `warning` · `error` · `info`.
