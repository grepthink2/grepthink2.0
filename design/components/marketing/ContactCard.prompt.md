The `/contact` page card: eyebrow, title, lede and a name / email / message form (with the bot honeypot), plus sending / success / error states. The page owns the POST.

```jsx
<ContactCard subtitle="Questions about grepthink for your class? Send us a note and we'll get back to you."
  values={v} onChange={setV} status={status} onSubmit={send} />
```

Marketing exception: fields focus with a 3px green-50 glow instead of the app's blue ring.
