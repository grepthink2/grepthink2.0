import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Checkbox } from '../Checkbox';

describe('Checkbox', () => {
  it('is a native checkbox named by its label alone, toggled from anywhere on its row', async () => {
    const { container } = render(<Checkbox label="Notify my team" description="Members get an email when this posts" />);
    const box = screen.getByRole('checkbox', { name: 'Notify my team' });
    expect(box).toHaveClass('gt-check__input');
    expect(box).not.toBeChecked();
    expect(container.firstChild).toHaveClass('gt-check');
    expect(container.querySelector('.gt-check__box')).toHaveAttribute('aria-hidden', 'true');

    await userEvent.click(screen.getByText('Notify my team'));
    expect(box).toBeChecked();
    await userEvent.click(screen.getByText('Members get an email when this posts'));
    expect(box).not.toBeChecked();
  });

  it('is described by its description, not named by it', () => {
    render(<Checkbox label="Notify my team" description="Members get an email when this posts" />);
    const box = screen.getByRole('checkbox', { name: 'Notify my team' });
    expect(box).toHaveAccessibleDescription('Members get an email when this posts');
  });

  it('works controlled, reporting each change', async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [on, setOn] = useState(false);
      return <Checkbox label="Select all" checked={on} onChange={(e) => { onChange(e.target.checked); setOn(e.target.checked); }} />;
    }
    render(<Controlled />);
    const box = screen.getByRole('checkbox', { name: 'Select all' });
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard(' ');
    expect(box).not.toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('sets indeterminate on the input, and still hands the caller its ref', () => {
    const ref = createRef<HTMLInputElement>();
    const { rerender } = render(<Checkbox label="Select all" indeterminate ref={ref} />);
    const box = screen.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement;
    expect(ref.current).toBe(box);
    expect(box.indeterminate).toBe(true);
    expect(box).toBePartiallyChecked();
    rerender(<Checkbox label="Select all" ref={ref} />);
    expect(box.indeterminate).toBe(false);
  });

  it('stays indeterminate after a click whose parent re-renders without changing it', async () => {
    function Parent() {
      const [clicks, setClicks] = useState(0);
      return <Checkbox label="Select all" indeterminate checked={false} onChange={() => setClicks((c) => c + 1)} data-clicks={clicks} />;
    }
    render(<Parent />);
    const box = screen.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement;
    await userEvent.click(box);
    expect(box).toHaveAttribute('data-clicks', '1');
    expect(box.indeterminate).toBe(true);
  });

  it('stays indeterminate after a click its parent ignores', async () => {
    render(<Checkbox label="Select all" indeterminate checked={false} onChange={() => {}} />);
    const box = screen.getByRole('checkbox', { name: 'Select all' }) as HTMLInputElement;
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(box.indeterminate).toBe(true);
  });

  it('cannot be toggled while disabled', async () => {
    const { container } = render(<Checkbox label="Archived" disabled defaultChecked />);
    const box = screen.getByRole('checkbox', { name: 'Archived' });
    expect(box).toBeDisabled();
    expect(container.firstChild).toHaveClass('gt-check--disabled');
    await userEvent.click(screen.getByText('Archived'));
    expect(box).toBeChecked();
  });

  it('passes native props to the input, className to its row, and keeps a caller aria-describedby', () => {
    const { container } = render(
      <>
        <p id="hint">Only staff see this.</p>
        <Checkbox label="Hidden" name="hidden" value="yes" className="x" data-key="h" aria-describedby="hint" description="Out of the roster" />
      </>,
    );
    const box = screen.getByRole('checkbox', { name: 'Hidden' });
    expect(box).toHaveAttribute('name', 'hidden');
    expect(box).toHaveAttribute('value', 'yes');
    expect(box).toHaveAttribute('data-key', 'h');
    expect(box).toHaveAccessibleDescription('Only staff see this. Out of the roster');
    expect(container.querySelector('.gt-check')).toHaveClass('gt-check', 'x');
  });

  it('can be named from outside when it has no label', () => {
    render(
      <>
        <span id="row-name">Ana Ruiz</span>
        <Checkbox aria-labelledby="row-name" />
      </>,
    );
    expect(screen.getByRole('checkbox', { name: 'Ana Ruiz' })).toBeInTheDocument();
  });

  it('covers its whole row with the hidden native input', () => {
    render(<Checkbox label="x" />);
    const [row] = cssRules('.gt-check');
    expect(row.getPropertyValue('position')).toBe('relative');
    const [input] = cssRules('.gt-check__input');
    expect(input.getPropertyValue('position')).toBe('absolute');
    expect(input.getPropertyValue('opacity')).toBe('0');
    const [box] = cssRules('.gt-check__box');
    expect(box.getPropertyValue('border')).toContain('var(--gt-border-control)');
    const [disabled] = cssRules('.gt-check--disabled');
    expect(disabled.getPropertyValue('opacity')).toBe('var(--gt-opacity-disabled)');
  });

  it('gives each row 44px on phones and drops its transitions under reduced motion', () => {
    render(<Checkbox label="x" />);
    const [phone] = cssRules('.gt-check', 'max-width: 767px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
    const [reduced] = cssRules('.gt-check__box', 'prefers-reduced-motion');
    expect(reduced.getPropertyValue('transition')).toBe('none');
  });
});
