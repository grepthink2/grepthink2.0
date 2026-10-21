import { useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from '@/components/IconButton/IconButton';
import { Input, type InputProps } from '@/components/Input/Input';

export interface PasswordFieldProps extends Omit<InputProps, 'type' | 'action' | 'prefixText' | 'suffix'> {
  /** @default 'Password' */
  label?: ReactNode;
  /** 'current-password' on sign-in, 'new-password' on sign-up and reset. @default 'current-password' */
  autoComplete?: string;
}

/**
 * Input with a show / hide password toggle, ported from design/components/primitives/PasswordField.jsx:
 * an IconButton `sm` eye in the input group's action slot. The eye is a toggle button: its name stays
 * "Show password" and `aria-pressed` carries the state (a name that flipped to "Hide password" while
 * pressed would read as a double negative); only its tooltip says Show / Hide. No autocapitalise or
 * spellcheck. Every other Input prop, `ref` included, reaches the Input. It has no stylesheet of its
 * own: the design gives it none.
 */
export function PasswordField({ label = 'Password', autoComplete = 'current-password', disabled = false, ...rest }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      {...rest}
      label={label}
      disabled={disabled}
      type={shown ? 'text' : 'password'}
      autoComplete={autoComplete}
      autoCapitalize="none"
      spellCheck={false}
      action={(
        <IconButton
          size="sm"
          ariaLabel="Show password"
          pressed={shown}
          tooltip={shown ? 'Hide password' : 'Show password'}
          disabled={disabled}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </IconButton>
      )}
    />
  );
}
