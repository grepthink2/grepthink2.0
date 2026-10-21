import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasswordField } from '../PasswordField';

describe('PasswordField', () => {
  it('is a password input labelled Password, for the current password by default', () => {
    render(<PasswordField defaultValue="hunter22" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'current-password');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(input).toHaveClass('gt-input');
  });

  it('shows and hides the password with a toggle whose name stays "Show password"', async () => {
    const { container } = render(<PasswordField defaultValue="hunter22" />);
    const input = screen.getByLabelText('Password');
    const eye = screen.getByRole('button', { name: 'Show password' });
    expect(eye).toHaveAttribute('aria-pressed', 'false');
    expect(eye.closest('.gt-input-group__action')).not.toBeNull();
    expect(container.querySelector('.gt-tooltip__bubble')).toHaveTextContent('Show password');

    await userEvent.click(eye);
    expect(input).toHaveAttribute('type', 'text');
    // A toggle keeps its name; aria-pressed carries the state. Only the tooltip flips.
    expect(screen.getByRole('button', { name: 'Show password' })).toBe(eye);
    expect(eye).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('.gt-tooltip__bubble')).toHaveTextContent('Hide password');

    await userEvent.click(eye);
    expect(input).toHaveAttribute('type', 'password');
    expect(eye).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables the toggle with the field', () => {
    render(<PasswordField disabled />);
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
  });

  it('takes the other Input props: label, autoComplete, help, error and ref', () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(
      <PasswordField label="New password" autoComplete="new-password" helperText="At least 8 characters" ref={ref} />,
    );
    const input = screen.getByLabelText('New password');
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input).toHaveAccessibleDescription('At least 8 characters');

    rerender(<PasswordField label="New password" autoComplete="new-password" error="Use at least 8 characters." ref={ref} />);
    expect(input).toHaveAccessibleDescription('Use at least 8 characters.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
