One-time code boxes — class join code (8 characters) and email verification (6 digits, 3 screens). WAI-ARIA: a `role="group"` of text inputs named by one label; each box is "Character 3 of 8" / "Digit 3 of 6".

```jsx
<CodeInput label="Class code" length={8} groupSize={4} value={code} onChange={setCode} onComplete={join} error={err} />
<CodeInput label="Verification code" length={6} numeric value={otp} onChange={setOtp} onComplete={verify} autoFocus />
```

- Typing advances; Backspace clears the box (or steps back and clears the previous one); ← → Home End move. Pasting anywhere fills from that box; the first box has `autocomplete="one-time-code"` for phone autofill.
- The value has no holes: tapping any box focuses the first empty one, so the row is one target (boxes are 44 × 52, shrinking to fit an 8-box code on a 320px phone; 52px tall stays above 44).
- Boxes: Fira Code 20/500, uppercase, `--gt-border-control`; focus accent + ring; error border + the error line under the group; disabled sunken.
- Call `onComplete` to submit; on a wrong code show the error and keep the value so the user can fix one box.
