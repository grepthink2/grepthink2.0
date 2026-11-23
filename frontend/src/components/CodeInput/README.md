One-time code boxes, one character each: eight for a class join code, six digits for an email verification code.

## Use

```jsx
<CodeInput label="Class code" length={8} groupSize={4} value={code} onChange={setCode} onComplete={join} />
<CodeInput
  label="Verification code"
  length={6}
  numeric
  value={otp}
  onChange={setOtp}
  onComplete={verify}
  error="That code has expired. We sent you a new one."
/>
```

## Props that matter

- `label`: one name for the whole row, required. Each box is announced as "Character 3 of 8" or "Digit 3 of 6".
- `length`, default 6.
- `numeric`: digits only, with the phone's number pad. Otherwise letters and digits, upper-cased.
- `value` with `onChange`, which receives the cleaned string; it works uncontrolled too.
- `onComplete`: called once every box is filled, and again only when a full code changes. Submit or verify there.
- `groupSize`: a short rule after every n boxes (4 gives "ABCD – 1234"); decorative.
- `helperText`, `error` (under the row; every box turns red), `disabled`.
- `autoFocus`: focuses the first empty box when it appears, for a screen whose only task is the code.

Typing fills a box and moves on; Backspace clears it, or steps back from an empty one. A paste, or the phone's one-time-code autofill, fills every box from there. A tap past the value lands on the first empty box, so the row behaves as one target.

## The consumer supplies

- The label, the submit in `onComplete`, and the error. On a wrong code, show the error and keep the value so the person can fix one box.

## Do and don't

- Do use it only for a code someone copies from elsewhere (an email, their instructor).
- Do keep the value after a wrong code, so one box can be fixed.
- Don't use it for a password or a PIN the person chooses: that is a PasswordField.
