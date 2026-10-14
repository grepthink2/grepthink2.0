import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CommandPalette } from '../components/CommandPalette';
import type { SearchIndexState } from '../hooks/useSearchIndex';
import type { SearchItem } from '../searchModel';

const state = vi.hoisted(() => ({
  preview: { isPreviewing: false },
  // visibleClasses: k2 is a class the user hid, so it is in the roster but not here.
  ctx: { visibleClasses: [{ id: 'k1', name: 'CSE 115B' }], setSelectedClass: vi.fn() },
}));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => state.preview }));
vi.mock('@/lib/classContext', () => ({ useClass: () => state.ctx }));

const ITEMS: SearchItem[] = [
  { id: 't1', type: 'task', key: 'GT-12', title: 'Roster CSV importer', href: '/app/projects/p1/board?sprint=s1&task=t1', status: 'todo', subtitle: 'Grepthink 2.0' },
  { id: 'u1', type: 'person', title: 'Rosa Trinh', href: '/app/messages/compose?to=u1&name=Rosa%20Trinh', subtitle: 'TA · CSE 115B' },
  { id: 'p1', type: 'project', title: 'Roster Radar', href: '/app/projects/p1', subtitle: 'CSE 115B · 4 members' },
  { id: 'k1', type: 'class', title: 'CSE 115B', href: '/app/dashboard', subtitle: 'Fall 2026' },
  { id: 'k2', type: 'class', title: 'CSE 101 (hidden)', href: '/app/my-classes', subtitle: 'Spring 2026' },
  { id: 'a1', type: 'assignment', title: 'TSR 3', href: '/app/assignments/a1', subtitle: 'TSR · due Oct 12', class_id: 'k1' },
];

function Where() {
  const loc = useLocation();
  return <output data-testid="path">{loc.pathname + loc.search}</output>;
}

/** The palette as AppView mounts it: open state in the parent, the hotkey inside the palette. */
function Host({ index, initialOpen }: { index: SearchIndexState; initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>trigger</button>
      <CommandPalette open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)} userId="me" index={index} />
    </>
  );
}

const NO_ITEMS: SearchItem[] = [];

/** An index whose "Try again" really starts a load, so the error row unmounts under the click. */
function RetryHost() {
  const [status, setStatus] = useState<SearchIndexState['status']>('error');
  const refresh = useCallback((force?: boolean) => { if (force) setStatus('loading'); }, []);
  return <Host index={{ items: NO_ITEMS, status, refresh }} initialOpen />;
}

const indexOf = (over: Partial<SearchIndexState> = {}): SearchIndexState => ({ items: ITEMS, status: 'ready', refresh: vi.fn(), ...over });

function renderPalette(index = indexOf(), initialOpen = true) {
  return render(
    <MemoryRouter initialEntries={['/app/home']}>
      <Host index={index} initialOpen={initialOpen} />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>,
  );
}

function chord(init: KeyboardEventInit & { prevented?: boolean } = {}) {
  const { prevented, ...rest } = init;
  const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true, ...rest });
  if (prevented) event.preventDefault();
  act(() => { window.dispatchEvent(event); });
}

const dialog = () => screen.getByRole('dialog', { name: 'Search' });
const input = () => screen.getByRole('combobox');
const closed = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

beforeEach(() => {
  localStorage.clear();
  state.preview.isPreviewing = false;
  state.ctx.setSelectedClass.mockReset();
});

describe('CommandPalette — opening and closing', () => {
  it('opens on ⌘K, warms the index, focuses the input, and closes on a second press', async () => {
    const index = indexOf();
    renderPalette(index, false);
    expect(screen.queryByRole('dialog')).toBeNull();
    chord();
    expect(dialog()).toBeInTheDocument();
    expect(index.refresh).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input()).toHaveFocus());
    chord();
    await closed();
  });

  it('never opens on a chord something else already handled', () => {
    renderPalette(indexOf(), false);
    chord({ prevented: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Esc from the input, from a scope chip, via the esc keycap, and on a backdrop click', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'ros');
    fireEvent.keyDown(input(), { key: 'Escape' });
    await closed();

    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
    await user.type(input(), 'ros');
    const chip = screen.getByRole('button', { name: /^Projects/ });
    chip.focus();
    fireEvent.keyDown(chip, { key: 'Escape' });
    await closed();

    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    await closed();

    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
    fireEvent.mouseDown(dialog().parentElement!);
    await closed();
  });

  it('returns focus to the trigger after closing', async () => {
    renderPalette(indexOf(), false);
    const trigger = screen.getByRole('button', { name: 'trigger' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(input()).toHaveFocus());
    fireEvent.keyDown(input(), { key: 'Escape' });
    await closed();
    expect(trigger).toHaveFocus();
  });

  it('keeps focus in the dialog after "See all", a chip, or a click on panel text, so Esc still closes', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'cse');
    await user.click(screen.getByRole('button', { name: 'See all 2' }));
    expect(input()).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await closed();

    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
    await user.type(input(), 'cse');
    await user.click(screen.getByRole('button', { name: /^Projects/ }));
    expect(input()).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await closed();

    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
    await user.type(input(), 'zzz');
    await user.click(screen.getByText('Try a name, a task key like GT-12, or a project.'));
    expect(dialog()).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await closed();
  });

  it('closes on Esc wherever focus is, even after "Try again" swaps the error row out', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><RetryHost /></MemoryRouter>);
    await user.type(input(), 'ros');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByLabelText('Loading results')).toBeInTheDocument();
    expect(input()).toHaveFocus();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await closed();
  });

  it('leaves an Esc that cancels an IME composition to the IME', () => {
    renderPalette();
    fireEvent.keyDown(input(), { key: 'Escape', isComposing: true });
    fireEvent.keyDown(input(), { key: 'Escape', keyCode: 229 });
    expect(dialog().parentElement).not.toHaveClass('gt-palette-backdrop--closing');
  });

  it('renders into <body>, outside the app tree, so it stacks above inline modals', () => {
    const { container } = renderPalette();
    expect(container).not.toContainElement(dialog());
    expect(dialog().parentElement?.parentElement).toBe(document.body);
  });

  it('leaves focus where the opened page put it', async () => {
    const editor = document.createElement('input'); // a page that focuses its own field on mount
    document.body.appendChild(editor);
    onTestFinished(() => editor.remove());
    renderPalette(indexOf(), false);
    const trigger = screen.getByRole('button', { name: 'trigger' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(input()).toHaveFocus());
    fireEvent.change(input(), { target: { value: 'radar' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    editor.focus();
    await closed();
    expect(editor).toHaveFocus();
  });
});

describe('CommandPalette — searching', () => {
  it('shows the hint while idle, then ranks on every keystroke and highlights the match', async () => {
    const user = userEvent.setup();
    renderPalette();
    expect(screen.getByText('Search GrepThink')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter by type' })).toBeNull();
    await user.type(input(), 'ros');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('Roster CSV importer'),
      expect.stringContaining('Rosa Trinh'),
      expect.stringContaining('Roster Radar'),
    ]);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[0].querySelector('mark')).toHaveTextContent('Ros');
    expect(screen.getByRole('group', { name: 'Filter by type' })).toBeInTheDocument();
    expect(screen.getByText('1–3 of 3')).toBeInTheDocument();
  });

  it('treats a whitespace query as empty and says so for a miss', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), '   ');
    expect(screen.getByText('Search GrepThink')).toBeInTheDocument();
    await user.clear(input());
    await user.type(input(), 'zzz');
    expect(screen.getByText('No results for “zzz”')).toBeInTheDocument();
  });

  it('moves with the arrows and opens the active row with Enter, then closes', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'ros');
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('path')).toHaveTextContent('/app/messages/compose?to=u1&name=Rosa%20Trinh');
    await closed();
  });

  it('narrows with a scope chip and with "See all"', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'cse');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
    await user.click(screen.getByRole('button', { name: /^Classes/ }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('CSE 115B'),
      expect.stringContaining('CSE 101 (hidden)'),
    ]);
    await user.click(screen.getByRole('button', { name: /^All/ }));
    await user.click(screen.getByRole('button', { name: 'See all 2' }));
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('selects a visible class in ClassContext and navigates; a hidden class only navigates', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'cse 115b');
    await user.click(screen.getAllByRole('option')[0]);
    expect(state.ctx.setSelectedClass).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/app/dashboard');
    await closed();

    state.ctx.setSelectedClass.mockReset();
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
    await user.type(input(), 'cse 101');
    await user.click(screen.getAllByRole('option')[0]);
    expect(state.ctx.setSelectedClass).not.toHaveBeenCalled();
    expect(screen.getByTestId('path')).toHaveTextContent('/app/my-classes');
  });

  it('selects an assignment’s class along with the navigation, since its page reads the selected class', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'tsr 3');
    await user.click(screen.getAllByRole('option')[0]);
    expect(state.ctx.setSelectedClass).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/app/assignments/a1');
    await closed();
  });

  it('hides assignments and classes in student preview', async () => {
    state.preview.isPreviewing = true;
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'tsr');
    expect(screen.getByText('No results for “tsr”')).toBeInTheDocument();
    await user.clear(input());
    await user.type(input(), 'cse');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Rosa Trinh'),
      expect.stringContaining('Roster Radar'),
    ]);
  });

  it('remembers opened items as Recent across a close and reopen', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'radar');
    await user.keyboard('{Enter}');
    await closed();
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }));
    const list = screen.getByRole('listbox', { name: 'Recent' });
    expect(within(list).getByRole('option')).toHaveTextContent('Roster Radar');
  });

  it('shows the index’s copy of a recent item, so a chat read since shows no unread badge', () => {
    const chat: SearchItem = { id: 'c1', type: 'conversation', title: 'Grepthink 2.0', href: '/app/messages/c1', subtitle: 'Team channel' };
    localStorage.setItem('gt.search.recent.me', JSON.stringify([{ ...chat, unread: 3 }]));
    renderPalette(indexOf({ items: [...ITEMS, { ...chat, unread: 0 }] }));
    const list = screen.getByRole('listbox', { name: 'Recent' });
    expect(within(list).getByRole('option')).toHaveTextContent('Grepthink 2.0');
    expect(within(list).queryByLabelText('3 unread')).toBeNull();
  });

  it('lists the stored recents until the index loads, then only those it still has', () => {
    localStorage.setItem('gt.search.recent.me', JSON.stringify([
      { id: 'gone', type: 'project', title: 'Old team', href: '/app/projects/gone' },
      { id: 'p1', type: 'project', title: 'Roster Radar', href: '/app/projects/p1' },
    ]));
    const recentTitles = () => within(screen.getByRole('listbox', { name: 'Recent' })).getAllByRole('option').map((o) => o.textContent);
    const { rerender } = render(<MemoryRouter><Host index={indexOf({ items: [], status: 'loading' })} initialOpen /></MemoryRouter>);
    expect(recentTitles()).toEqual([expect.stringContaining('Old team'), expect.stringContaining('Roster Radar')]);

    rerender(<MemoryRouter><Host index={indexOf()} initialOpen /></MemoryRouter>);
    expect(recentTitles()).toEqual([expect.stringContaining('Roster Radar')]);
  });

  it('leaves Enter and the arrows to the IME while it is composing', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'ros');
    fireEvent.keyDown(input(), { key: 'ArrowDown', isComposing: true });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });
    expect(screen.getByTestId('path').textContent).toBe('/app/home');
    expect(dialog()).toBeInTheDocument();
  });

  it('opens only the first click while the exit animation plays', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'ros');
    const [first, second] = screen.getAllByRole('option');
    fireEvent.click(first);
    fireEvent.click(second);
    expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board?sprint=s1&task=t1');
    await closed();
  });

  it('marks the combobox expanded, pointing at the listbox, only while a list is shown', async () => {
    const user = userEvent.setup();
    renderPalette();
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-controls');
    await user.type(input(), 'ros');
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    expect(input()).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    await user.type(input(), 'zzz');
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-controls');
  });

  it('keeps the list still while the exit animation plays', async () => {
    const user = userEvent.setup();
    renderPalette();
    await user.type(input(), 'ros');
    fireEvent.click(screen.getAllByRole('option')[2]); // a recent ranks +2: Roster Radar would pass Rosa
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Roster CSV importer'),
      expect.stringContaining('Rosa Trinh'),
      expect.stringContaining('Roster Radar'),
    ]);
    await closed();
  });

  it('pages with ← → only from a collapsed caret at the text edge', async () => {
    const user = userEvent.setup();
    const more: SearchItem[] = Array.from({ length: 8 }, (_, i) => (
      { id: `x${i}`, type: 'project' as const, title: `Roster extra ${i}`, href: `/app/projects/x${i}` }
    ));
    renderPalette(indexOf({ items: [...ITEMS, ...more] }));
    await user.type(input(), 'ros');
    expect(screen.getByText('1–8 of 11')).toBeInTheDocument();
    fireEvent.keyDown(input(), { key: 'ArrowRight' });
    expect(screen.getByText('9–11 of 11')).toBeInTheDocument();
    (input() as HTMLInputElement).setSelectionRange(0, 3); // ⌘A: ← collapses the selection
    fireEvent.keyDown(input(), { key: 'ArrowLeft' });
    expect(screen.getByText('9–11 of 11')).toBeInTheDocument();
    (input() as HTMLInputElement).setSelectionRange(0, 0);
    fireEvent.keyDown(input(), { key: 'ArrowLeft' });
    expect(screen.getByText('1–8 of 11')).toBeInTheDocument();
  });
});

describe('CommandPalette — index states', () => {
  it('shows skeletons on a first load, a spinner while refetching, and the error row only without a list', () => {
    const { rerender } = render(
      <MemoryRouter><Host index={indexOf({ items: [], status: 'loading' })} initialOpen /></MemoryRouter>,
    );
    fireEvent.change(input(), { target: { value: 'ros' } });
    expect(screen.getByLabelText('Loading results')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();

    rerender(<MemoryRouter><Host index={indexOf({ status: 'refetching' })} initialOpen /></MemoryRouter>);
    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0);

    const index = indexOf({ items: [], status: 'error' });
    rerender(<MemoryRouter><Host index={index} initialOpen /></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('Search isn’t available right now');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(index.refresh).toHaveBeenLastCalledWith(true);
  });
});
