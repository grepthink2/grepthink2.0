Password input with a show / hide eye. WAI-ARIA: the eye is a toggle Button (`aria-pressed`).

```jsx
<PasswordField value={pw} onChange={(e) => setPw(e.target.value)} error={err} />
<PasswordField label="New password" autoComplete="new-password" helperText="At least 8 characters" />
```

- The eye is `IconButton size="sm"` in the input group's action slot. Its accessible name stays "Show password"; `aria-pressed="true"` means the password is visible. (A name that flips to "Hide password" while also pressed reads as a double negative, so only the tooltip flips: "Show password" / "Hide password".)
- `autoCapitalize="none"`, no spellcheck; `autoComplete` `current-password` / `new-password`. Use `lg` buttons + `fullWidth` on the sign-in pages; the field itself is the 40px default (44 on phones).
