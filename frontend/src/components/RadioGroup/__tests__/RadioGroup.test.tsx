import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { RadioGroup, type RadioOption } from '../RadioGroup';

const VISIBILITY: RadioOption[] = [
  { value: 'open', label: 'Open', description: 'Anyone can request to join' },
  { value: 'invite', label: 'Invite only' },
  { value: 'closed', label: 'Closed', disabled: true },
];
const STATUS: RadioOption[] = [
  { value: 'draft', label: 'Draft', description: 'Only staff can see it' },
  { value: 'published', label: 'Published', description: 'Students see it on their home page' },
];

describe('RadioGroup', () => {
  it('is a group named by its legend and reports the chosen value', async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [v, setV] = useState('open');
      return <RadioGroup legend="Project visibility" value={v} onChange={(next) => { onChange(next); setV(next); }} options={VISIBILITY} />;
    }
    render(<Controlled />);
    const group = screen.getByRole('group', { name: 'Project visibility' });
    expect(group.tagName).toBe('FIELDSET');
    expect(screen.getByText('Project visibility')).toHaveClass('gt-radio-group__legend');
    const open = within(group).getByRole('radio', { name: 'Open' });
    expect(open).toBeChecked();
    await userEvent.click(screen.getByText('Invite only'));
    expect(onChange).toHaveBeenLastCalledWith('invite');
    expect(within(group).getByRole('radio', { name: 'Invite only' })).toBeChecked();
    expect(open).not.toBeChecked();
  });

  it('names each option by its label and describes it with its description', () => {
    render(<RadioGroup legend="Project visibility" options={VISIBILITY} />);
    const open = screen.getByRole('radio', { name: 'Open' });
    expect(open).toHaveAccessibleDescription('Anyone can request to join');
    expect(screen.getByRole('radio', { name: 'Invite only' })).not.toHaveAccessibleDescription();
  });

  it('is named by ariaLabel when it has no legend', () => {
    const { container } = render(<RadioGroup ariaLabel="Sort order" options={VISIBILITY} />);
    expect(screen.getByRole('group', { name: 'Sort order' })).toBeInTheDocument();
    expect(container.querySelector('legend')).toBeNull();
  });

  it('keeps aria-label to itself, set from ariaLabel', () => {
    // @ts-expect-error: a caller's aria-label would be overwritten; pass `ariaLabel`
    const field = <RadioGroup aria-label="Sort" ariaLabel="Sort order" options={VISIBILITY} />;
    render(field);
    expect(screen.getByRole('group', { name: 'Sort order' })).toBeInTheDocument();
  });

  it('shares one name across its radios, generated when omitted', () => {
    const { rerender } = render(<RadioGroup legend="Visibility" options={VISIBILITY} />);
    const names = screen.getAllByRole('radio').map((r) => r.getAttribute('name'));
    expect(new Set(names).size).toBe(1);
    expect(names[0]).toBeTruthy();
    rerender(<RadioGroup legend="Visibility" name="visibility" options={VISIBILITY} />);
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('name'))).toEqual(['visibility', 'visibility', 'visibility']);
  });

  it('a disabled option cannot be chosen, and a disabled group disables them all', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<RadioGroup legend="Visibility" value="open" onChange={onChange} options={VISIBILITY} />);
    const closed = screen.getByRole('radio', { name: 'Closed' });
    expect(closed).toBeDisabled();
    expect(closed.closest('.gt-radio')).toHaveClass('gt-radio--disabled');
    await userEvent.click(screen.getByText('Closed'));
    expect(onChange).not.toHaveBeenCalled();
    rerender(<RadioGroup legend="Visibility" value="open" onChange={onChange} options={VISIBILITY} disabled />);
    screen.getAllByRole('radio').forEach((r) => expect(r).toBeDisabled());
  });

  it('moves and selects with the arrow keys, as native radios do', async () => {
    const onChange = vi.fn();
    render(<RadioGroup legend="Status" defaultValue="draft" onChange={onChange} options={STATUS} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Draft' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Published' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Published' })).toBeChecked();
    expect(onChange).toHaveBeenLastCalledWith('published');
  });

  it('works uncontrolled from defaultValue', async () => {
    render(<RadioGroup legend="Status" variant="card" defaultValue="draft" options={STATUS} />);
    const published = screen.getByRole('radio', { name: 'Published' });
    expect(screen.getByRole('radio', { name: 'Draft' })).toBeChecked();
    await userEvent.click(screen.getByText('Published'));
    expect(published).toBeChecked();
    expect(published.closest('.gt-radio')).toHaveClass('gt-radio--checked');
  });

  it('the card variant renders each option as a card with its title and description', () => {
    const { container } = render(<RadioGroup legend="Status" variant="card" value="published" onChange={() => {}} options={STATUS} />);
    expect(container.firstChild).toHaveClass('gt-radio-group', 'gt-radio-group--card');
    const cards = container.querySelectorAll('.gt-radio.gt-radio--card');
    expect(cards).toHaveLength(2);
    expect(cards[1]).toHaveClass('gt-radio--checked');
    expect(cards[0]).not.toHaveClass('gt-radio--checked');
    expect(within(cards[1] as HTMLElement).getByText('Published')).toHaveClass('gt-radio__label');
    expect(within(cards[1] as HTMLElement).getByText('Students see it on their home page')).toHaveClass('gt-radio__desc');
  });

  it('lays out inline only in the list variant', () => {
    const { container, rerender } = render(<RadioGroup legend="Status" inline options={STATUS} />);
    expect(container.firstChild).toHaveClass('gt-radio-group--inline');
    rerender(<RadioGroup legend="Status" inline variant="card" options={STATUS} />);
    expect(container.firstChild).not.toHaveClass('gt-radio-group--inline');
  });

  it('passes className, native props and ref to the fieldset', () => {
    const ref = createRef<HTMLFieldSetElement>();
    render(<RadioGroup legend="Status" className="x" id="status" data-key="s" ref={ref} options={STATUS} />);
    const group = screen.getByRole('group', { name: 'Status' });
    expect(ref.current).toBe(group);
    expect(group).toHaveClass('gt-radio-group', 'x');
    expect(group).toHaveAttribute('id', 'status');
    expect(group).toHaveAttribute('data-key', 's');
  });

  it('keeps ids valid for values with spaces', () => {
    render(<RadioGroup legend="Role" options={[{ value: 'product owner', label: 'Product Owner', description: 'Owns the backlog' }]} />);
    const radio = screen.getByRole('radio', { name: 'Product Owner' });
    expect(radio).toHaveAccessibleDescription('Owns the backlog');
    expect(radio.getAttribute('aria-labelledby')).not.toMatch(/\s/);
  });

  it('rings the focused card, draws the dot with the control border, and gives rows 44px on phones', () => {
    render(<RadioGroup legend="Status" options={STATUS} />);
    const [ring] = cssRules('.gt-radio--card:has(.gt-radio__input:focus-visible)');
    expect(ring.getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
    const [dot] = cssRules('.gt-radio__dot');
    expect(dot.getPropertyValue('border')).toContain('var(--gt-border-control)');
    const [phone] = cssRules('.gt-radio', 'max-width: 767px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
    const [reduced] = cssRules('.gt-radio__dot', 'prefers-reduced-motion');
    expect(reduced.getPropertyValue('transition')).toBe('none');
  });
});
