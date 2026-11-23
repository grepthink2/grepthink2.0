A password field with an eye button that shows or hides what was typed, for sign-in, sign-up and password reset.

## Use

```jsx
<PasswordField value={password} onChange={(e) => setPassword(e.target.value)} />
<PasswordField label="New password" autoComplete="new-password" helperText="At least 8 characters." />
```

## Props that matter

- `label`, default "Password".
- `autoComplete`, default `current-password` (sign-in). Pass `new-password` on sign-up and reset, so a password manager offers a new one.
- `value` with `onChange` (the native change event), or `defaultValue`.
- `helperText`, `error`, `optional`, `hideLabel`, `compact`, `maxLength` and every other Input prop, except `type`, `prefixText`, `suffix` and `action`, which the field sets itself.
- `disabled` disables the eye too.

The eye is a small IconButton named "Show password" that stays named so: its pressed state says the password is showing, and only its tooltip switches between "Show password" and "Hide password". The field turns off autocapitalise and spellcheck.

## The consumer supplies

- The value, the validation message ("Use at least 8 characters."), and the form's submit button: on the sign-in pages a full-width `lg` Button.

## Do and don't

- Do say the password rules in `helperText` before someone types, not only in the error after.
- Don't build a show/hide toggle of your own beside an Input: use this.
- Don't pass `type`: the eye switches it.
