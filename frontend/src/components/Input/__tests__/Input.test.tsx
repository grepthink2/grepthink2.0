import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Mail } from 'lucide-react';
import { cssRules } from '@/test/cssRules';
import { Input } from '../Input';

function Controlled({ initial = '', ...props }: { initial?: string } & Parameters<typeof Input>[0]) {
  const [value, setValue] = useState(initial);
  return <Input {...props} value={value} onChange={(e) => setValue(e.target.value)} />;
}

describe('Input', () => {
  it('is a text input named by its label, and reports changes with the event', async () => {
    const onChange = vi.fn();
    render(<Input label="Project name" value="" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Project name' });
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveClass('gt-input');
    expect(input).toHaveValue('');
    await userEvent.type(input, 'G');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.lastCall?.[0].target).toBe(input);
  });

  it('shows the value it is given', async () => {
    render(<Controlled label="Project name" initial="GrepThink" />);
    const input = screen.getByRole('textbox', { name: 'Project name' });
    expect(input).toHaveValue('GrepThink');
    await userEvent.type(input, ' 2.0');
    expect(input).toHaveValue('GrepThink 2.0');
  });

  it('works uncontrolled with defaultValue', async () => {
    render(<Input label="Email" type="email" defaultValue="slug@ucsc.edu" />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveValue('slug@ucsc.edu');
    await userEvent.clear(input);
    await userEvent.type(input, 'ana@ucsc.edu');
    expect(input).toHaveValue('ana@ucsc.edu');
  });

  it('puts native props and ref on the input, className on the field and inputClassName on the input', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <Input label="Room" name="location" placeholder="E2 room 180" autoComplete="off" className="x" inputClassName="y" data-key="room" ref={ref} />,
    );
    const input = screen.getByRole('textbox', { name: 'Room' });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute('name', 'location');
    expect(input).toHaveAttribute('placeholder', 'E2 room 180');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('data-key', 'room');
    expect(input).toHaveClass('gt-input', 'y');
    expect(container.firstChild).toHaveClass('gt-field', 'x');
    expect(input).not.toHaveClass('x');
  });

  it('is described by its help line, or by its error, which marks it invalid', () => {
    const { rerender } = render(<Input label="Email" helperText="Use your school address" />);
    const input = screen.getByRole('textbox', { name: 'Email' });
    expect(input).toHaveAccessibleDescription('Use your school address');
    expect(input).not.toHaveAttribute('aria-invalid');

    rerender(<Input label="Email" helperText="Use your school address" error="Use your @ucsc.edu address." />);
    expect(input).toHaveAccessibleDescription('Use your @ucsc.edu address.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('merges a caller aria-describedby with its own lines', () => {
    render(
      <>
        <p id="form-note">Times are in Pacific time.</p>
        <Input label="Start" helperText="On campus" aria-describedby="form-note" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Start' })).toHaveAccessibleDescription('Times are in Pacific time. On campus');
  });

  it('keeps aria-invalid to itself, set from error', () => {
    // @ts-expect-error: a caller's aria-invalid would be overwritten; pass `error`
    const field = <Input label="Title" aria-invalid />;
    render(field);
    expect(screen.getByRole('textbox', { name: 'Title' })).not.toHaveAttribute('aria-invalid');
  });

  it('sits alone without adornments, and in one input group with them', () => {
    const { container, rerender } = render(<Input label="Hours" />);
    expect(container.querySelector('.gt-input-group')).toBeNull();

    rerender(
      <Input
        label="Hours"
        iconLeft={<Mail size={16} />}
        suffix="hrs"
        action={<button type="button">Reset</button>}
      />,
    );
    const group = container.querySelector('.gt-input-group');
    expect(group).not.toBeNull();
    expect(group?.querySelector('.gt-input-group__icon')).toHaveAttribute('aria-hidden', 'true');
    expect(group?.querySelector('.gt-input-group__suffix')).toHaveTextContent('hrs');
    expect(group?.querySelector('.gt-input-group__action')).toContainElement(screen.getByRole('button', { name: 'Reset' }));
    expect(group).toContainElement(screen.getByRole('textbox', { name: 'Hours' }));
  });

  it('links a text prefix to the input', () => {
    render(<Input label="LinkedIn" optional prefixText="linkedin.com/in/" defaultValue="ashton-liu" />);
    const input = screen.getByRole('textbox', { name: 'LinkedIn (optional)' });
    expect(input).toHaveAccessibleDescription('linkedin.com/in/');
    expect(screen.getByText('linkedin.com/in/')).toHaveClass('gt-input-group__prefix');
  });

  it('compact makes the input and its group 32px', () => {
    const { container, rerender } = render(<Input label="Filter" hideLabel compact />);
    expect(screen.getByRole('textbox', { name: 'Filter' })).toHaveClass('gt-input', 'gt-input--compact');
    rerender(<Input label="Filter" hideLabel compact iconLeft={<Mail size={15} />} />);
    expect(container.querySelector('.gt-input-group')).toHaveClass('gt-input-group--compact');
  });

  it('disables the input, its group and its label', () => {
    const { container } = render(<Input label="Team" defaultValue="Team 4" disabled helperText="Set by your instructor" suffix="#" />);
    expect(screen.getByRole('textbox', { name: 'Team' })).toBeDisabled();
    expect(container.querySelector('.gt-input-group')).toHaveClass('gt-input-group--disabled');
    expect(container.firstChild).toHaveClass('gt-field--disabled');
  });

  it('marks an optional field and passes required to the input without a visible mark', () => {
    const { rerender } = render(<Input label="Pronouns" optional />);
    expect(screen.getByRole('textbox', { name: 'Pronouns (optional)' })).not.toBeRequired();
    rerender(<Input label="Title" required />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeRequired();
    expect(screen.queryByText('*')).toBeNull();
  });

  it('shows the counter from 80% of maxLength, or always with showCount, and never sets the native limit', async () => {
    const { container, rerender } = render(<Controlled label="Title" maxLength={10} />);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).not.toHaveAttribute('maxlength');
    await userEvent.type(input, '1234567');
    expect(container.querySelector('.gt-field__count')).toBeNull();
    await userEvent.type(input, '8');
    expect(screen.getByText('8 / 10')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('8 of 10 characters');

    // Eight of 80 is under 80%: only showCount brings the counter up.
    rerender(<Controlled label="Title" maxLength={80} showCount />);
    expect(screen.getByText('8 / 80')).toBeInTheDocument();
  });

  it('keeps text past the limit and flags it', async () => {
    const { container } = render(<Controlled label="Title" maxLength={5} />);
    const input = screen.getByRole('textbox', { name: 'Title' });
    await userEvent.type(input, 'Sprint');
    expect(input).toHaveValue('Sprint');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(container.firstChild).toHaveClass('gt-field--over');
    expect(screen.getByText('6 / 5')).toBeInTheDocument();
  });

  it('counts what is typed while uncontrolled', () => {
    render(<Input label="Title" defaultValue="Retro" maxLength={80} showCount />);
    expect(screen.getByText('5 / 80')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Retro notes' } });
    expect(screen.getByText('11 / 80')).toBeInTheDocument();
  });

  it('gives two copies of one form distinct ids', () => {
    render(<><Input label="Title" /><Input label="Title" /></>);
    const [a, b] = screen.getAllByRole('textbox', { name: 'Title' });
    expect(a.id).not.toBe(b.id);
  });

  it('is at least 44px tall on phones', () => {
    render(<Input label="Title" />);
    const [input] = cssRules('.gt-input', 'max-width: 767px');
    expect(input.getPropertyValue('min-height')).toBe('44px');
    const [group] = cssRules('.gt-input-group', 'max-width: 767px');
    expect(group.getPropertyValue('min-height')).toBe('44px');
    const [inner] = cssRules('.gt-input-group .gt-input', 'max-width: 767px');
    expect(inner.getPropertyValue('min-height')).toBe('42px');
  });

  it('keeps a disabled value readable: a sunken fill and tertiary text, no opacity', () => {
    render(<Input label="Title" />);
    const [disabled] = cssRules('.gt-input:disabled');
    expect(disabled.getPropertyValue('background')).toBe('var(--gt-surface-sunken)');
    expect(disabled.getPropertyValue('color')).toBe('var(--gt-text-tertiary)');
    expect(disabled.getPropertyValue('opacity')).toBe('');
  });

  it('draws its boundary with the control border token', () => {
    render(<Input label="Title" />);
    const [base] = cssRules('.gt-input');
    expect(base.getPropertyValue('border')).toContain('var(--gt-border-control)');
    const [hover] = cssRules('.gt-input:hover:not(:disabled)');
    expect(hover.getPropertyValue('border-color')).toBe('var(--gt-border-control-hover)');
  });

  it('drops its transitions under reduced motion', () => {
    render(<Input label="Title" />);
    const [reduced] = cssRules('.gt-input', 'prefers-reduced-motion');
    expect(reduced.getPropertyValue('transition')).toBe('none');
  });
});
