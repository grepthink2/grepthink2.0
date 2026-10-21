import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Select } from '../Select';

const DURATIONS = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 h' },
  { value: '90', label: '1 h 30 min', disabled: true },
];

describe('Select', () => {
  it('renders its options from the prop, named by its label', () => {
    render(<Select label="Duration" defaultValue="60" options={DURATIONS} />);
    const select = screen.getByRole('combobox', { name: 'Duration' });
    expect(select).toHaveClass('gt-select__control');
    expect(select).toHaveValue('60');
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['30 min', '1 h', '1 h 30 min']);
    expect(options[2]).toBeDisabled();
    expect(select.closest('.gt-select')?.querySelector('.gt-select__chevron')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders optgroup groups from the prop', () => {
    render(
      <Select
        label="Sprint"
        compact
        defaultValue="s3"
        options={[
          { label: 'Current', options: [{ value: 's3', label: 'Sprint 3' }] },
          { label: 'Past', options: [{ value: 's2', label: 'Sprint 2' }, { value: 's1', label: 'Sprint 1' }] },
        ]}
      />,
    );
    const select = screen.getByRole('combobox', { name: 'Sprint' });
    const past = within(select).getByRole('group', { name: 'Past' });
    expect(within(past).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sprint 2', 'Sprint 1']);
    expect(select.closest('.gt-select')).toHaveClass('gt-select', 'gt-select--compact');
  });

  it('shows a disabled placeholder option while the value is empty', () => {
    const { rerender } = render(<Select label="Role" placeholder="Choose a role" value="" onChange={() => {}} options={DURATIONS} />);
    const select = screen.getByRole('combobox', { name: 'Role' });
    expect(select).toHaveValue('');
    const placeholder = within(select).getByRole('option', { name: 'Choose a role' });
    expect(placeholder).toBeDisabled();
    expect(placeholder).toHaveValue('');
    expect((placeholder as HTMLOptionElement).selected).toBe(true);

    // Uncontrolled, the placeholder is still what shows first.
    rerender(<Select key="u" label="Role" placeholder="Choose a role" options={DURATIONS} />);
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue('');
  });

  it('takes option and optgroup children, which replace options', () => {
    render(
      <Select label="Term" defaultValue="w27" options={DURATIONS}>
        <optgroup label="2026">
          <option value="f26">Fall 2026</option>
        </optgroup>
        <option value="w27">Winter 2027</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Term' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Fall 2026', 'Winter 2027']);
    expect(within(select).getByRole('group', { name: '2026' })).toBeInTheDocument();
    expect(select).toHaveValue('w27');
  });

  it('reports a choice through onChange', async () => {
    const picked: string[] = [];
    render(<Select label="Duration" value="60" onChange={(e) => picked.push(e.target.value)} options={DURATIONS} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Duration' }), '30');
    expect(picked).toEqual(['30']);
  });

  it('is described by its help line, or by its error, which marks it invalid', () => {
    const { container, rerender } = render(<Select label="Role" helperText="Shown on the roster" options={DURATIONS} />);
    const select = screen.getByRole('combobox', { name: 'Role' });
    expect(select).toHaveAccessibleDescription('Shown on the roster');
    expect(select).not.toHaveAttribute('aria-invalid');
    rerender(<Select label="Role" helperText="Shown on the roster" error="Pick a role." options={DURATIONS} />);
    expect(select).toHaveAccessibleDescription('Pick a role.');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(container.firstChild).toHaveClass('gt-field--error');
  });

  it('keeps a caller aria-describedby, and aria-invalid to itself', () => {
    // @ts-expect-error: a caller's aria-invalid would be overwritten; pass `error`
    const invalid = <Select label="Duration" aria-invalid options={DURATIONS} />;
    const { rerender } = render(invalid);
    expect(screen.getByRole('combobox', { name: 'Duration' })).not.toHaveAttribute('aria-invalid');
    rerender(
      <>
        <p id="slot-note">Slots are 15 minutes apart.</p>
        <Select label="Duration" aria-describedby="slot-note" helperText="Up to 4 h" options={DURATIONS} />
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Duration' })).toHaveAccessibleDescription('Slots are 15 minutes apart. Up to 4 h');
  });

  it('passes native props and ref to the select, className to the field, and marks an optional one', () => {
    const ref = createRef<HTMLSelectElement>();
    const { container } = render(
      <Select label="Duration" optional name="durationMinutes" className="x" ref={ref} disabled options={DURATIONS} />,
    );
    const select = screen.getByRole('combobox', { name: 'Duration (optional)' });
    expect(ref.current).toBe(select);
    expect(select).toHaveAttribute('name', 'durationMinutes');
    expect(select).toBeDisabled();
    expect(container.firstChild).toHaveClass('gt-field', 'gt-field--disabled', 'x');
  });

  it('is at least 44px tall on phones and drops its transitions under reduced motion', () => {
    render(<Select label="Duration" options={DURATIONS} />);
    const [phone] = cssRules('.gt-select__control', 'max-width: 767px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
    const [reduced] = cssRules('.gt-select__control', 'prefers-reduced-motion');
    expect(reduced.getPropertyValue('transition')).toBe('none');
  });
});
