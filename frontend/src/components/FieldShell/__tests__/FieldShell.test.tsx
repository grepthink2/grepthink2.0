import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldShell, type FieldShellContext } from '../FieldShell';

/** A plain input wired to the shell the way the kit's controls wire theirs. */
const control = ({ id, describedBy, invalid }: FieldShellContext) => (
  <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
);

describe('FieldShell', () => {
  it('associates the label with the control', () => {
    render(<FieldShell label="Title">{control}</FieldShell>);
    const input = screen.getByLabelText('Title');
    expect(input.tagName).toBe('INPUT');
    expect(screen.getByText('Title')).toHaveClass('gt-field__label');
    expect(input.closest('.gt-field')).not.toBeNull();
  });

  it('describes the control with its help line', () => {
    render(<FieldShell label="Room" helperText="Building and room number">{control}</FieldShell>);
    const input = screen.getByRole('textbox', { name: 'Room' });
    expect(input).toHaveAccessibleDescription('Building and room number');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Building and room number')).toHaveClass('gt-field__help');
  });

  it('an error replaces the help line, marks the control invalid and describes it', () => {
    const { container } = render(
      <FieldShell label="Title" helperText="Shown to your team" error="Give the meeting a title.">{control}</FieldShell>,
    );
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveAccessibleDescription('Give the meeting a title.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Shown to your team')).toBeNull();
    const error = screen.getByText('Give the meeting a title.');
    expect(error).toHaveClass('gt-field__error');
    expect(error.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveClass('gt-field', 'gt-field--error');
    // Not a live region: the form moves focus to the first invalid field instead.
    expect(error.closest('[aria-live]')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the accessible name when the label is hidden', () => {
    render(<FieldShell label="Search members" hideLabel>{control}</FieldShell>);
    expect(screen.getByRole('textbox', { name: 'Search members' })).toBeInTheDocument();
    const label = screen.getByText('Search members');
    expect(label).toHaveClass('gt-visually-hidden');
    expect(label).not.toHaveClass('gt-field__label');
  });

  it('gives two copies of one field distinct ids', () => {
    render(
      <>
        <FieldShell label="Title" helperText="One">{control}</FieldShell>
        <FieldShell label="Title" helperText="Two">{control}</FieldShell>
      </>,
    );
    const [first, second] = screen.getAllByRole('textbox', { name: 'Title' });
    expect(first.id).not.toBe(second.id);
    expect(first).toHaveAccessibleDescription('One');
    expect(second).toHaveAccessibleDescription('Two');
  });

  it('uses the id it is given for the control and derives the others from it', () => {
    render(<FieldShell id="meeting-title" label="Title" helperText="Help" count={3} max={80}>{control}</FieldShell>);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).toHaveAttribute('id', 'meeting-title');
    expect(input).toHaveAttribute('aria-describedby', 'meeting-title-help meeting-title-count');
    expect(screen.getByText('Title')).toHaveAttribute('id', 'meeting-title-label');
  });

  it('marks an optional field "(optional)" and a required one not at all', () => {
    const { rerender } = render(<FieldShell label="Pronouns" optional>{control}</FieldShell>);
    expect(screen.getByRole('textbox', { name: 'Pronouns (optional)' })).toBeInTheDocument();
    expect(screen.getByText('(optional)')).toHaveClass('gt-field__optional');

    rerender(<FieldShell label="Title">{({ id }) => <input id={id} required />}</FieldShell>);
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeRequired();
    expect(screen.queryByText('(optional)')).toBeNull();
    // No marker of any kind: the label holds its text alone.
    expect(screen.getByText('Title').children).toHaveLength(0);
    expect(screen.queryByText('*')).toBeNull();
  });

  it('renders the label as a span for a control group named by aria-labelledby', () => {
    render(
      <FieldShell label="Class code" group helperText="8 characters from your instructor">
        {({ labelId, describedBy }) => (
          <div role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
            <input aria-label="Character 1 of 8" />
          </div>
        )}
      </FieldShell>,
    );
    const label = screen.getByText('Class code');
    expect(label.tagName).toBe('SPAN');
    expect(label).not.toHaveAttribute('for');
    const group = screen.getByRole('group', { name: 'Class code' });
    expect(group).toHaveAccessibleDescription('8 characters from your instructor');
  });

  it('counts against a soft limit, linked to the control, and flags the field past it', () => {
    const { container, rerender } = render(<FieldShell label="Note" count={128} max={500}>{control}</FieldShell>);
    const input = screen.getByRole('textbox', { name: 'Note' });
    expect(screen.getByText('128 / 500')).toHaveAttribute('aria-hidden', 'true');
    expect(input).toHaveAccessibleDescription('128 of 500 characters');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(container.querySelector('.gt-field__count')).not.toHaveClass('gt-field__count--over');

    rerender(<FieldShell label="Note" count={512} max={500}>{control}</FieldShell>);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(container.firstChild).toHaveClass('gt-field--over');
    expect(container.querySelector('.gt-field__count')).toHaveClass('gt-field__count--over');
    expect(screen.getByText('512 / 500')).toBeInTheDocument();
  });

  it('puts the error before the counter in the description', () => {
    render(<FieldShell label="Note" count={512} max={500} error="Shorten this by 12 characters.">{control}</FieldShell>);
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveAccessibleDescription(
      'Shorten this by 12 characters. 512 of 500 characters',
    );
  });

  it('speaks only when the count crosses 20 left, reaches the limit and goes over', () => {
    const shell = (count: number) => <FieldShell label="Note" count={count} max={100}>{control}</FieldShell>;
    const { container, rerender } = render(shell(10));
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toHaveClass('gt-visually-hidden');
    expect(live).toBeEmptyDOMElement();

    rerender(shell(79));
    expect(live).toBeEmptyDOMElement();
    rerender(shell(80));
    expect(live).toHaveTextContent('20 characters left');
    // Not on every keystroke inside the band.
    rerender(shell(85));
    expect(live).toHaveTextContent('20 characters left');
    rerender(shell(99));
    expect(live).toHaveTextContent('20 characters left');
    rerender(shell(100));
    expect(live).toHaveTextContent('Character limit reached');
    rerender(shell(101));
    expect(live).toHaveTextContent('1 character over the limit');
    rerender(shell(104));
    expect(live).toHaveTextContent('1 character over the limit');
    rerender(shell(99));
    expect(live).toHaveTextContent('1 character left');
    rerender(shell(50));
    expect(live).toBeEmptyDOMElement();
    rerender(shell(112));
    expect(live).toHaveTextContent('12 characters over the limit');
  });

  it('has no counter, footer or live region without a limit', () => {
    const { container } = render(<FieldShell label="Title">{control}</FieldShell>);
    expect(container.querySelector('.gt-field__footer')).toBeNull();
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Title' })).not.toHaveAttribute('aria-describedby');
  });

  it('marks a disabled field, appends className, takes plain children and passes ref to its root', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <FieldShell label="Team" disabled className="x" ref={ref}>
        <input aria-label="Team" disabled />
      </FieldShell>,
    );
    expect(container.firstChild).toHaveClass('gt-field', 'gt-field--disabled', 'x');
    expect(ref.current).toBe(container.firstChild);
    expect(screen.getByRole('textbox', { name: 'Team' })).toBeDisabled();
  });

  it('renders no label element without a label', () => {
    const { container } = render(<FieldShell>{({ id }) => <input id={id} aria-label="Filter" />}</FieldShell>);
    expect(container.querySelector('label, .gt-field__label')).toBeNull();
  });
});
