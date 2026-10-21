import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { FilterChip } from '../FilterChip';

describe('FilterChip', () => {
  it('FilterChip toggles pressed', async () => {
    function Toggle() {
      const [on, setOn] = useState(false);
      return <FilterChip selected={on} onClick={() => setOn(!on)} icon={<svg data-testid="kind" />}>TA meetings</FilterChip>;
    }
    const { container } = render(<Toggle />);
    const chip = screen.getByRole('button', { name: 'TA meetings' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(chip).toHaveClass('gt-filter-chip');
    expect(chip).not.toHaveClass('gt-filter-chip--selected');
    expect(screen.getByTestId('kind').parentElement).toHaveAttribute('aria-hidden', 'true');

    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveClass('gt-filter-chip--selected');
    // While selected, a check replaces the icon, so the state is not colour alone.
    expect(screen.queryByTestId('kind')).not.toBeInTheDocument();
    expect(container.querySelector('.gt-filter-chip__icon .lucide-check')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.gt-filter-chip__icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('as a radio, it is checked rather than pressed, and keeps its icon', () => {
    const { container } = render(<FilterChip kind="radio" selected icon={<svg data-testid="kind" />}>7 days</FilterChip>);
    const chip = screen.getByRole('radio', { name: '7 days' });
    expect(chip).toHaveAttribute('aria-checked', 'true');
    expect(chip).not.toHaveAttribute('aria-pressed');
    expect(chip).toHaveClass('gt-filter-chip--selected');
    expect(screen.getByTestId('kind')).toBeInTheDocument();
    expect(container.querySelector('.lucide-check')).toBeNull();
  });

  it('count renders, after the label and in the name', () => {
    render(<FilterChip count={3}>TA meetings</FilterChip>);
    const chip = screen.getByRole('button', { name: 'TA meetings 3' });
    expect(chip.lastElementChild).toHaveClass('gt-filter-chip__count');
    expect(chip.lastElementChild).toHaveTextContent('3');
  });

  it('is md by default and sm on request', () => {
    const { rerender } = render(<FilterChip>Kinds</FilterChip>);
    expect(screen.getByRole('button')).not.toHaveClass('gt-filter-chip--sm');
    rerender(<FilterChip size="sm">Kinds</FilterChip>);
    expect(screen.getByRole('button')).toHaveClass('gt-filter-chip--sm');
  });

  it('disabled is the native attribute, and a disabled chip takes no click', async () => {
    const onClick = vi.fn();
    render(<FilterChip disabled onClick={onClick} title="Select a class first">Class to date</FilterChip>);
    const chip = screen.getByRole('button', { name: 'Class to date' });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute('title', 'Select a class first');
    await userEvent.click(chip);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is a type="button" by default and passes className, native props and ref', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<FilterChip className="x" data-key="f" ref={ref}>Mine</FilterChip>);
    const chip = screen.getByRole('button', { name: 'Mine' });
    expect(ref.current).toBe(chip);
    expect(chip).toHaveAttribute('type', 'button');
    expect(chip).toHaveClass('gt-filter-chip', 'x');
    expect(chip).toHaveAttribute('data-key', 'f');
  });

  it('keeps role, aria-pressed and aria-checked to itself', () => {
    // @ts-expect-error: kind decides the role
    const roled = <FilterChip role="tab">A</FilterChip>;
    // @ts-expect-error: selected decides aria-pressed
    const pressed = <FilterChip aria-pressed>B</FilterChip>;
    // @ts-expect-error: selected decides aria-checked
    const checked = <FilterChip kind="radio" aria-checked>C</FilterChip>;
    render(<div>{roled}{pressed}{checked}</div>);
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('radio', { name: 'C' })).toHaveAttribute('aria-checked', 'false');
  });

  it('ports the chip’s sizes, states and phone height, and sets what the global button rule would', () => {
    render(<FilterChip>Kinds</FilterChip>);
    const [chip] = cssRules('.gt-filter-chip');
    expect(chip.getPropertyValue('height')).toBe('32px');
    expect(chip.getPropertyValue('box-sizing')).toBe('border-box');
    expect(chip.getPropertyValue('padding')).toBe('0px 14px');
    expect(chip.getPropertyValue('border')).toBe('1px solid var(--gt-border)');
    expect(chip.getPropertyValue('font-weight')).toBe('var(--gt-weight-medium)');
    expect(chip.getPropertyValue('transition')).toContain('background-color');
    expect(cssRules('.gt-filter-chip--sm')[0].getPropertyValue('height')).toBe('26px');
    // One rule styles the class and both checked states.
    const [selected] = cssRules('.gt-filter-chip--selected');
    expect(selected.getPropertyValue('background')).toBe('var(--gt-primary)');
    expect(selected.getPropertyValue('color')).toBe('var(--gt-text-inverse)');
    expect(cssRules('.gt-filter-chip:disabled')[0].getPropertyValue('opacity')).toBe('var(--gt-opacity-disabled)');
    expect(cssRules('.gt-filter-chip:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
    expect(cssRules('.gt-filter-chip--sm', 'max-width: 767px')[0].getPropertyValue('height')).toBe('44px');
    expect(cssRules('.gt-filter-chip', 'prefers-reduced-motion')[0].getPropertyValue('transition')).toBe('none');
  });
});
