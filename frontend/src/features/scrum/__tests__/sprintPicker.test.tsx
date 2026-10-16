import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SprintPicker from '../components/SprintPicker';
import { makeSprint } from './fixtures';

/** Sprint 1 planned and a quarter done; Sprint 2 under way with no tasks yet; Sprint 3 done, unestimated. */
const SPRINTS = [
  makeSprint({
    id: 'sp1', name: 'Sprint 1', status: 'planned',
    progress: { tasks_done: 1, tasks_total: 4, points_done: 3, points_total: 8 },
  }),
  makeSprint({
    id: 'sp2', name: 'Sprint 2', status: 'active', starts_at: '2026-08-24', ends_at: '2026-09-06',
    progress: { tasks_done: 0, tasks_total: 0, points_done: 0, points_total: 13 },
  }),
  makeSprint({
    id: 'sp3', name: 'Sprint 3', status: 'completed', starts_at: '2026-09-07', ends_at: '2026-09-20',
    progress: { tasks_done: 2, tasks_total: 2, points_done: 0, points_total: 0 },
  }),
];

/** The picker on Sprint 2, with one more control after it to Tab to. */
function renderPicker() {
  const onSelect = vi.fn();
  render(
    <>
      <SprintPicker sprints={SPRINTS} selectedId="sp2" onSelect={onSelect} />
      <button type="button">After</button>
    </>,
  );
  return { onSelect, trigger: screen.getByRole('button', { name: 'Sprint: Sprint 2' }) };
}

/** A sprint's row: its accessible name starts with the sprint's name. */
const row = (name: string) => screen.getByRole('menuitemradio', { name: new RegExp(`^${name}`) });

/**
 * A press as Safari, and Firefox on macOS, make it: a pressed button never takes focus, and unless
 * the mousedown is default-prevented, whatever had focus is blurred and nothing is focused.
 * (Chrome focuses the pressed button, as user-event's click does.)
 */
function pressFocusingNothing(el: HTMLElement) {
  if (fireEvent.mouseDown(el)) act(() => (document.activeElement as HTMLElement | null)?.blur());
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

describe('SprintPicker', () => {
  it('is a closed menu button naming the selected sprint', () => {
    const { trigger } = renderPicker();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on a click, on the selected sprint, with every sprint in order and its progress', async () => {
    const { trigger } = renderPicker();
    await userEvent.click(trigger);

    expect(screen.getByRole('menu', { name: 'Sprints' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const names = screen.getAllByRole('menuitemradio').map((r) => within(r).getByText(/^Sprint \d$/).textContent);
    expect(names).toEqual(['Sprint 1', 'Sprint 2', 'Sprint 3']);
    expect(row('Sprint 2')).toHaveAttribute('aria-checked', 'true');
    expect(row('Sprint 2')).toHaveFocus();

    const first = row('Sprint 1');
    expect(first).toHaveAttribute('aria-checked', 'false');
    expect(within(first).getByText('Planned')).toBeInTheDocument();
    expect(first).toHaveTextContent(/Aug 10 – Aug 23/);
    expect(first).toHaveTextContent('1/4 tasks · 3/8 pts');
    expect(within(first).getByText('25%')).toBeInTheDocument();
    expect(first.querySelector('.sprint-picker__bar-fill')).toHaveStyle({ width: '25%' });
  });

  it('says when a sprint has no tasks yet, and prints points only for a sprint that has some', async () => {
    const { trigger } = renderPicker();
    await userEvent.click(trigger);

    const second = row('Sprint 2');
    expect(second).toHaveTextContent('No tasks yet');
    expect(within(second).queryByText(/%/)).toBeNull();

    const third = row('Sprint 3');
    expect(third).toHaveTextContent('2/2 tasks');
    expect(third).not.toHaveTextContent('pts');
    expect(within(third).getByText('100%')).toBeInTheDocument();
  });

  it('picks another sprint and closes', async () => {
    const { onSelect, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(row('Sprint 1'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('sp1');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on the selected sprint without picking it again, focus back on the trigger', async () => {
    const { onSelect, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(row('Sprint 2'));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on Esc, focus back on the trigger', async () => {
    const { onSelect, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('opens from the keyboard on the selected sprint, and Enter picks the focused one', async () => {
    const { onSelect, trigger } = renderPicker();
    await userEvent.tab();
    expect(trigger).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(row('Sprint 2')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(row('Sprint 3')).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('sp3');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on ArrowUp too, on the selected sprint', async () => {
    renderPicker();
    await userEvent.tab();
    await userEvent.keyboard('{ArrowUp}');
    expect(row('Sprint 2')).toHaveFocus();
  });

  it('closes when Tab moves focus out of the menu', async () => {
    const { trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.keyboard('{End}');         // the last row, so the next Tab leaves the menu
    await userEvent.tab();

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('closes when Shift+Tab moves focus back to the trigger', async () => {
    const { trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.keyboard('{Home}');
    await userEvent.tab({ shift: true });

    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on a click outside', async () => {
    const { trigger } = renderPicker();
    await userEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes when its trigger is clicked again, focus on the trigger', async () => {
    const { trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(trigger);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('picks with a press that focuses nothing, as Safari makes it', async () => {
    const { onSelect, trigger } = renderPicker();
    await userEvent.click(trigger);
    pressFocusingNothing(row('Sprint 1'));

    expect(onSelect).toHaveBeenCalledWith('sp1');
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
