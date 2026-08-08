Inline alert + floating toast, both on the semantic soft-bg/text pairs.

```jsx
<Alert tone="warning" title="TSR due in 2 days">Submit before Jan 18, 11:59 PM.</Alert>
<ToastStack><Toast tone="success" title="TSR submitted" onDismiss={pop} /></ToastStack>
```

Tones: `success` · `warning` · `error` · `info`. Error alerts get `role="alert"`.
