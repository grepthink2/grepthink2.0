import React from 'react';
import { Input } from './Input.jsx';
import { IconButton } from './IconButton.jsx';

const Eye = ({ off }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {off
      ? <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><path d="m2 2 20 20" /></>
      : <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>}
  </svg>
);

/**
 * Password input with a show / hide eye in the trailing slot. The eye is a toggle button: its
 * name stays "Show password" and `aria-pressed` carries the state (the tooltip says Show / Hide).
 */
export function PasswordField({ label = 'Password', autoComplete = 'current-password', ...rest }) {
  const [shown, setShown] = React.useState(false);
  return (
    <Input
      {...rest}
      label={label}
      type={shown ? 'text' : 'password'}
      autoComplete={autoComplete}
      autoCapitalize="none"
      spellCheck={false}
      action={(
        <IconButton size="sm" ariaLabel="Show password" pressed={shown} tooltip={shown ? 'Hide password' : 'Show password'}
          disabled={rest.disabled} onClick={() => setShown((s) => !s)}>
          <Eye off={shown} />
        </IconButton>
      )}
    />
  );
}
