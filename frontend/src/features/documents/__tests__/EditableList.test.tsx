import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EditableList from '../components/EditableList';

interface Row {
  id: string;
  text: string;
}

let next = 0;

function Harness({ initial, max = 5, editable = true }: { initial: Row[]; max?: number; editable?: boolean }) {
  const [rows, setRows] = useState(initial);
  return (
    <EditableList
      label="Things"
      items={rows}
      itemKey={(r) => r.id}
      itemName={(r) => `“${r.text}”`}
      editable={editable}
      onChange={setRows}
      max={max}
      newItem={() => ({ id: `new-${(next += 1)}`, text: '' })}
      addLabel="Add a thing"
      emptyText="Nothing yet."
      renderItem={(r) => (editable
        ? <input aria-label={`Text of ${r.text || 'new'}`} value={r.text} onChange={(e) => setRows((all) => all.map((x) => (x.id === r.id ? { ...x, text: e.target.value } : x)))} />
        : <span>{r.text}</span>)}
    />
  );
}

const rows = (...texts: string[]) => texts.map((text, i) => ({ id: `r${i}`, text }));
const order = () => within(screen.getByRole('list', { name: 'Things' })).getAllByRole('listitem').map((li) => li.textContent?.trim() || (li.querySelector('input') as HTMLInputElement).value);

describe('EditableList', () => {
  it('moves a row and keeps the keyboard on it, saying where it went', async () => {
    render(<Harness initial={rows('one', 'two', 'three')} />);
    const down = screen.getByRole('button', { name: 'Move “one” down' });
    down.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).value)).toEqual(['two', 'one', 'three']);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move “one” down' }));
    expect(screen.getByText('“one” moved to 2 of 3')).toBeInTheDocument();
  });

  it('gives focus to the row’s other move when it reaches an end', async () => {
    render(<Harness initial={rows('one', 'two')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move “two” up' }));
    expect(screen.getByRole('button', { name: 'Move “two” up' })).toBeDisabled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Move “two” down' }));
  });

  it('hands focus to the row that took a removed one’s place, else to Add', async () => {
    render(<Harness initial={rows('one', 'two')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove “one”' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Text of two' }));
    expect(screen.getByText('“one” removed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove “two”' }));
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add a thing' }));
  });

  it('says each removal, even one that reads like the one before', async () => {
    render(<Harness initial={rows('same', 'same', 'other')} />);
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove “same”' })[0]);
    const region = screen.getByText('“same” removed');
    const first = region.textContent;
    await userEvent.click(screen.getByRole('button', { name: 'Remove “same”' }));
    // The same words again: the region's text must still change for a screen reader to speak it.
    expect(region.textContent).not.toBe(first);
    expect(region.textContent?.trim()).toBe('“same” removed');
  });

  it('adds a row and puts the cursor in it', async () => {
    render(<Harness initial={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a thing' }));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Text of new' }));
  });

  it('turns Add off at the limit and says why', () => {
    render(<Harness initial={rows('one', 'two')} max={2} />);
    const add = screen.getByRole('button', { name: 'Add a thing' });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription('2 of 2: the list holds no more');
  });

  it('shows the rows without controls when read only', () => {
    render(<Harness initial={rows('one')} editable={false} />);
    expect(order()).toEqual(['one']);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
