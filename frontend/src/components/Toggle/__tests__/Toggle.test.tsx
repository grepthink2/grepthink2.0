import { createRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Toggle } from '../Toggle';

describe('Toggle', () => {
  it('is a switch named by its label, flipped from anywhere on its row', async () => {
    const { container } = render(<Toggle label="Assignment reminders" />);
    const sw = screen.getByRole('switch', { name: 'Assignment reminders' });
    expect(sw).toHaveAttribute('type', 'checkbox');
    expect(sw).not.toBeChecked();
    expect(container.querySelector('.gt-toggle__track')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(screen.getByText('Assignment reminders'));
    expect(sw).toBeChecked();
    await userEvent.keyboard(' ');
    expect(sw).not.toBeChecked();
  });

  it('is described by its description, which aligns the track to the first line', () => {
    const { container } = render(<Toggle label="Email me when a TSR is due" description="Sent the day before, at 9 AM" />);
    const sw = screen.getByRole('switch', { name: 'Email me when a TSR is due' });
    expect(sw).toHaveAccessibleDescription('Sent the day before, at 9 AM');
    expect(container.firstChild).toHaveClass('gt-toggle', 'gt-toggle--with-desc');
  });

  it('works controlled', async () => {
    function Controlled() {
      const [on, setOn] = useState(true);
      return <Toggle label="Digest" checked={on} onChange={(e) => setOn(e.target.checked)} />;
    }
    render(<Controlled />);
    const sw = screen.getByRole('switch', { name: 'Digest' });
    expect(sw).toBeChecked();
    await userEvent.click(sw);
    expect(sw).not.toBeChecked();
  });

  it('cannot be flipped while disabled', async () => {
    const { container } = render(<Toggle label="Digest" disabled />);
    const sw = screen.getByRole('switch', { name: 'Digest' });
    expect(sw).toBeDisabled();
    expect(container.firstChild).toHaveClass('gt-toggle--disabled');
    await userEvent.click(screen.getByText('Digest'));
    expect(sw).not.toBeChecked();
  });

  it('passes native props and ref to the input and className to its row', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(<Toggle label="Digest" name="digest" className="x" ref={ref} data-key="d" />);
    const sw = screen.getByRole('switch', { name: 'Digest' });
    expect(ref.current).toBe(sw);
    expect(sw).toHaveAttribute('name', 'digest');
    expect(sw).toHaveAttribute('data-key', 'd');
    expect(container.firstChild).toHaveClass('gt-toggle', 'x');
  });

  it('keeps its switch role to itself', () => {
    // @ts-expect-error: a caller's role would be overwritten; a Toggle is always a switch
    const field = <Toggle label="Digest" role="checkbox" />;
    render(field);
    expect(screen.getByRole('switch', { name: 'Digest' })).toBeInTheDocument();
  });

  it('draws the off track with the control border, 44px rows on phones, and no slide under reduced motion', () => {
    render(<Toggle label="x" />);
    const [track] = cssRules('.gt-toggle__track');
    expect(track.getPropertyValue('background')).toBe('var(--gt-border-control)');
    const [phone] = cssRules('.gt-toggle', 'max-width: 767px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
    const [reduced] = cssRules('.gt-toggle__thumb', 'prefers-reduced-motion');
    expect(reduced.getPropertyValue('transition')).toBe('none');
  });
});
