import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** The picker on Sprint 2 of a board counting points, with one more control after it to Tab to. */
function renderPicker() {
  const onSelect = vi.fn();
  render(
    <>
      <SprintPicker sprints={SPRINTS} selectedId="sp2" onSelect={onSelect} unit="points" />
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

  it("counts hours in every row when the board's burnup is in hours, and only for a sprint that has some", async () => {
    const sprints = [
      makeSprint({
        id: 'sp1', name: 'Sprint 1',
        progress: { tasks_done: 3, tasks_total: 5, points_done: 0, points_total: 4, hours_done: 12, hours_total: 20 },
      }),
      makeSprint({
        id: 'sp2', name: 'Sprint 2', starts_at: '2026-08-24', ends_at: '2026-09-06',
        progress: { tasks_done: 0, tasks_total: 2, points_done: 0, points_total: 5, hours_done: 0, hours_total: 0 },
      }),
    ];
    render(<SprintPicker sprints={sprints} selectedId="sp1" onSelect={vi.fn()} unit="hours" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sprint: Sprint 1' }));

    const meta = (name: string) => row(name).querySelector('.sprint-picker__meta');
    expect(meta('Sprint 1')).toHaveTextContent(/^Aug 10 – Aug 23 · 3\/5 tasks · 12\/20 h$/);
    expect(meta('Sprint 2')).toHaveTextContent(/^Aug 24 – Sep 6 · 0\/2 tasks$/);
  });

  it('lists a sprint by its dates alone when the board has no progress for it (an older backend)', async () => {
    render(<SprintPicker sprints={[makeSprint({ progress: undefined })]} selectedId="sp1" onSelect={vi.fn()} unit="points" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sprint: Sprint 1' }));

    const only = row('Sprint 1');
    expect(only).toHaveTextContent(/Aug 10 – Aug 23$/);
    expect(only.querySelector('.sprint-picker__bar')).toBeNull();
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

  describe('keeps the menu on screen', () => {
    const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 34, height: 34, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    /** A `viewport`-wide page, the trigger's right side at `triggerRight`, a `menuWidth` menu hanging from it. */
    const layout = (viewport: number, triggerRight: number, menuWidth: number) => {
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(viewport);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('sprint-picker__trigger')) return rect(triggerRight - 90, 90);
        if (this.classList.contains('gt-popover')) return rect(triggerRight - menuWidth, menuWidth);
        return rect(0, 0);
      });
    };
    const openMenu = async () => {
      await userEvent.click(renderPicker().trigger);
      return screen.getByRole('menu').closest('.gt-popover') as HTMLElement;
    };
    afterEach(() => vi.restoreAllMocks());

    it('hangs it from the trigger when it fits', async () => {
      layout(1024, 854, 362);
      expect((await openMenu()).style.right).toBe('');
    });
    it('moves it right until its left side is in line with the board, 24 px in (the gear and New Story follow the trigger)', async () => {
      layout(500, 331, 362);
      expect((await openMenu()).style.right).toBe('-55px'); // its left side lands at 331 − 362 + 55 = 24
    });
    it('centres it on a phone, with less than 48 px to spare', async () => {
      layout(382, 213, 336);
      expect((await openMenu()).style.right).toBe('-146px'); // (382 − 336) / 2 = 23 on either side
    });
  });
});
