import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CriteriaEditor from '../components/CriteriaEditor';
import { cleanCriteria, criteriaFit, sameCriteria } from '../utils/criteria';

/** The editor with its rows in state, as a form holds them; `onChange` sees every change. */
function Harness({ initial, onChange }: { initial: string[]; onChange?: (rows: string[]) => void }) {
  const [rows, setRows] = useState(initial);
  return <CriteriaEditor value={rows} onChange={(next) => { setRows(next); onChange?.(next); }} />;
}

const setup = (initial: string[] = []) => {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  return onChange;
};
const rows = () => screen.queryAllByRole('textbox').map((input) => (input as HTMLInputElement).value);

describe('CriteriaEditor', () => {
  it('is a labelled group that starts with only its Add button', () => {
    setup();
    expect(screen.getByRole('group', { name: 'Acceptance criteria' })).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Add criterion' })).toBeEnabled();
  });

  it('adds a criterion with focus in it, and edits it', async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Add criterion' }));

    const first = screen.getByRole('textbox', { name: 'Criterion 1' });
    expect(first).toHaveFocus();
    await userEvent.type(first, 'Finds a trail by name');
    expect(onChange).toHaveBeenLastCalledWith(['Finds a trail by name']);
  });

  it('adds the next criterion with Enter in the last one, and never after a blank one', async () => {
    setup(['Finds a trail by name']);
    await userEvent.click(screen.getByRole('textbox', { name: 'Criterion 1' }));
    await userEvent.keyboard('{Enter}');

    const second = screen.getByRole('textbox', { name: 'Criterion 2' });
    expect(second).toHaveFocus();
    await userEvent.keyboard('{Enter}');                       // the new row is still blank
    expect(rows()).toEqual(['Finds a trail by name', '']);

    await userEvent.type(second, 'Says so when none match');
    await userEvent.click(screen.getByRole('textbox', { name: 'Criterion 1' }));
    await userEvent.keyboard('{Enter}');                       // not the last row
    expect(rows()).toEqual(['Finds a trail by name', 'Says so when none match']);
  });

  it('removes a criterion and leaves focus on the one that took its place', async () => {
    const onChange = setup(['One', 'Two', 'Three']);
    await userEvent.click(screen.getByRole('button', { name: 'Remove criterion 2' }));

    expect(onChange).toHaveBeenLastCalledWith(['One', 'Three']);
    expect(screen.getByRole('textbox', { name: 'Criterion 2' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Remove criterion 2' }));
    expect(screen.getByRole('textbox', { name: 'Criterion 1' })).toHaveFocus();   // the last one went

    await userEvent.click(screen.getByRole('button', { name: 'Remove criterion 1' }));
    expect(rows()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Add criterion' })).toHaveFocus();
  });

  it('moves a criterion up and down, focus going with it', async () => {
    const onChange = setup(['One', 'Two', 'Three']);
    expect(screen.getByRole('button', { name: 'Move criterion 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move criterion 3 down' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Move criterion 3 up' }));
    expect(onChange).toHaveBeenLastCalledWith(['One', 'Three', 'Two']);
    expect(screen.getByRole('button', { name: 'Move criterion 2 up' })).toHaveFocus();

    await userEvent.keyboard('{Enter}');                       // again, from the keyboard
    expect(rows()).toEqual(['Three', 'One', 'Two']);
    // At the top its Move up is disabled, so focus takes the row's other move.
    expect(screen.getByRole('button', { name: 'Move criterion 1 down' })).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(rows()).toEqual(['One', 'Three', 'Two']);
    expect(screen.getByRole('button', { name: 'Move criterion 2 down' })).toHaveFocus();
  });

  it('holds 20 criteria at most, counting only the rows that hold one, and says so', async () => {
    setup([...Array.from({ length: 19 }, (_, i) => `Criterion ${i + 1}`), '']);
    const add = screen.getByRole('button', { name: 'Add criterion' });
    expect(add).toBeEnabled();                                  // 19 criteria and a blank row
    expect(screen.queryByText(/of 20/)).toBeNull();

    await userEvent.type(screen.getByRole('textbox', { name: 'Criterion 20' }), 'The last one');
    expect(add).toBeDisabled();
    expect(screen.getByText('20 of 20: a story holds no more')).toBeInTheDocument();
    expect(add).toHaveAccessibleDescription('20 of 20: a story holds no more');
  });

  it('adds no row on Enter at 20 criteria, and the hint says why', async () => {
    setup(Array.from({ length: 20 }, (_, i) => `Criterion ${i + 1}`));
    await userEvent.click(screen.getByRole('textbox', { name: 'Criterion 20' }));
    await userEvent.keyboard('{Enter}');

    expect(screen.getAllByRole('textbox')).toHaveLength(20);
    const hint = screen.getByText('20 of 20: a story holds no more');
    expect(hint.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('says how many are over when blank rows filled in take the list past 20', async () => {
    setup([...Array.from({ length: 20 }, (_, i) => `Criterion ${i + 1}`), '']);
    await userEvent.type(screen.getByRole('textbox', { name: 'Criterion 21' }), 'One too many');
    expect(screen.getByText('21 of 20: remove one to save')).toBeInTheDocument();
  });

  it('flags a criterion past 300 characters, counting its trimmed text, and keeps its text', async () => {
    setup(['x'.repeat(300)]);
    const field = screen.getByRole('textbox', { name: 'Criterion 1' });
    expect(field).not.toHaveAttribute('aria-invalid');

    await userEvent.type(field, 'y');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveValue(`${'x'.repeat(300)}y`);
    const row = field.closest('li')!;
    expect(within(row).getByText('301 of 300 characters')).toBeInTheDocument();
  });

  it('does not flag spaces around a criterion, which saving trims, and shows the count from 240', () => {
    setup([` ${'x'.repeat(300)}  `, 'x'.repeat(240), 'x'.repeat(239)]);
    const [padded, near, short] = screen.getAllByRole('textbox');
    expect(padded).not.toHaveAttribute('aria-invalid');
    expect(criteriaFit([` ${'x'.repeat(300)}  `])).toBe(true);   // what Save counts agrees
    expect(within(padded.closest('li')!).getByText('300 of 300 characters')).toBeInTheDocument();
    expect(within(near.closest('li')!).getByText('240 of 300 characters')).toBeInTheDocument();
    expect(within(short.closest('li')!).queryByText(/of 300 characters/)).toBeNull();
  });

  it('trims a criterion when it loses focus', async () => {
    const onChange = setup([]);
    await userEvent.click(screen.getByRole('button', { name: 'Add criterion' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Criterion 1' }), '  Finds a trail  ');
    await userEvent.tab();

    expect(onChange).toHaveBeenLastCalledWith(['Finds a trail']);
    expect(screen.getByRole('textbox', { name: 'Criterion 1' })).toHaveValue('Finds a trail');
  });
});

describe('criteria helpers', () => {
  it('saves each criterion trimmed and drops the blank ones', () => {
    expect(cleanCriteria(['  One ', '', '   ', 'Two'])).toEqual(['One', 'Two']);
  });

  it('fits the API: at most 20, each at most 300 characters once trimmed', () => {
    expect(criteriaFit([` ${'x'.repeat(300)} `, ''])).toBe(true);
    expect(criteriaFit(['x'.repeat(301)])).toBe(false);
    expect(criteriaFit(Array.from({ length: 21 }, () => 'x'))).toBe(false);
    expect(criteriaFit([...Array.from({ length: 20 }, () => 'x'), ' '])).toBe(true);
  });

  it('compares two lists in order', () => {
    expect(sameCriteria(['One', 'Two'], ['One', 'Two'])).toBe(true);
    expect(sameCriteria(['One', 'Two'], ['Two', 'One'])).toBe(false);
    expect(sameCriteria(['One'], ['One', 'Two'])).toBe(false);
  });
});
