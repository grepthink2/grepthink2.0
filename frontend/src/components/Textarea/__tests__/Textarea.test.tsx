import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Textarea } from '../Textarea';

const WENT_WELL = 'Ana unblocked the API tests on Tuesday.';

function Controlled({ initial = '', ...props }: { initial?: string } & Parameters<typeof Textarea>[0]) {
  const [value, setValue] = useState(initial);
  return <Textarea {...props} value={value} onChange={(e) => setValue(e.target.value)} />;
}

describe('Textarea', () => {
  it('is a multi-line field named by its label, four rows by default', () => {
    const { rerender } = render(<Textarea label="What went well?" />);
    const area = screen.getByRole('textbox', { name: 'What went well?' });
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveClass('gt-textarea');
    expect(area).toHaveAttribute('rows', '4');
    rerender(<Textarea label="What went well?" rows={2} />);
    expect(area).toHaveAttribute('rows', '2');
  });

  it('shows "n / max" whenever maxLength is set, linked to the control, without the native limit', () => {
    render(<Textarea label="What went well?" value={WENT_WELL} onChange={() => {}} maxLength={500} />);
    const area = screen.getByRole('textbox', { name: 'What went well?' });
    expect(screen.getByText(`${WENT_WELL.length} / 500`)).toBeInTheDocument();
    expect(area).toHaveAccessibleDescription(`${WENT_WELL.length} of 500 characters`);
    expect(area).not.toHaveAttribute('maxlength');
  });

  it('hides the counter with showCount={false}', () => {
    const { container } = render(<Textarea label="Note" maxLength={500} showCount={false} />);
    expect(container.querySelector('.gt-field__count')).toBeNull();
  });

  it('keeps text past the limit and flags it', async () => {
    const { container } = render(<Controlled label="Note" maxLength={5} />);
    const area = screen.getByRole('textbox', { name: 'Note' });
    await userEvent.type(area, 'Retro notes');
    expect(area).toHaveValue('Retro notes');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(container.firstChild).toHaveClass('gt-field--over');
    expect(screen.getByText('11 / 5').parentElement).toHaveClass('gt-field__count', 'gt-field__count--over');
  });

  it('is described by its error, which marks it invalid, ahead of the counter', () => {
    render(
      <Textarea label="Note" optional value={'x'.repeat(512)} onChange={() => {}} maxLength={500} error="Shorten this by 12 characters." />,
    );
    const area = screen.getByRole('textbox', { name: 'Note (optional)' });
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area).toHaveAccessibleDescription('Shorten this by 12 characters. 512 of 500 characters');
  });

  it('is described by its help line and keeps a caller aria-describedby first', () => {
    render(
      <>
        <p id="tsr-note">Your team sees this.</p>
        <Textarea label="Feedback" helperText="A sentence or two" aria-describedby="tsr-note" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Feedback' })).toHaveAccessibleDescription('Your team sees this. A sentence or two');
  });

  it('keeps aria-invalid to itself, set from error', () => {
    // @ts-expect-error: a caller's aria-invalid would be overwritten; pass `error`
    const field = <Textarea label="Note" aria-invalid />;
    render(field);
    expect(screen.getByRole('textbox', { name: 'Note' })).not.toHaveAttribute('aria-invalid');
  });

  it('counts what is typed while uncontrolled', () => {
    render(<Textarea label="Note" defaultValue="Bring" maxLength={500} />);
    expect(screen.getByText('5 / 500')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: 'Bring the demo' } });
    expect(screen.getByText('14 / 500')).toBeInTheDocument();
  });

  it('reports changes, passes native props and ref to the textarea and className to the field', async () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    const { container } = render(
      <Textarea label="Note" name="note" placeholder="Anything to bring" className="x" ref={ref} onChange={onChange} />,
    );
    const area = screen.getByRole('textbox', { name: 'Note' });
    expect(ref.current).toBe(area);
    expect(area).toHaveAttribute('name', 'note');
    expect(area).toHaveAttribute('placeholder', 'Anything to bring');
    expect(container.firstChild).toHaveClass('gt-field', 'x');
    await userEvent.type(area, 'a');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('disables the textarea and its label', () => {
    const { container } = render(<Textarea label="Feedback" defaultValue="Locked after the deadline." disabled />);
    expect(screen.getByRole('textbox', { name: 'Feedback' })).toBeDisabled();
    expect(container.firstChild).toHaveClass('gt-field--disabled');
  });

  it('drops its transitions under reduced motion', () => {
    render(<Textarea label="Note" />);
    const [reduced] = cssRules('.gt-textarea', 'prefers-reduced-motion');
    expect(reduced.getPropertyValue('transition')).toBe('none');
    const [base] = cssRules('.gt-textarea');
    expect(base.getPropertyValue('border')).toContain('var(--gt-border-control)');
  });
});
