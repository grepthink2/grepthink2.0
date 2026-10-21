import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Popover } from '@/components/Popover/Popover';
import { DatePickerField, type DatePickerFieldProps } from '../DatePickerField';

/** Tue Oct 20, 2026, at noon on the runner's clock: the same calendar day in every zone. */
const NOW = new Date(2026, 9, 20, 12);

let user: ReturnType<typeof userEvent.setup>;
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});
afterEach(() => {
  vi.useRealTimers();
});

/** A field that keeps its value, as a form would; `onChange` sees every value it is sent. */
function Field({ initial = '', onChange, ...props }: Partial<DatePickerFieldProps> & { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <DatePickerField
      label="Due date"
      {...props}
      value={value}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
}

const trigger = (name: string | RegExp = /^Due date/) => screen.getByRole('button', { name });
const calendar = () => screen.getByRole('dialog', { name: 'Choose date' });
const day = (name: string | RegExp) => within(calendar()).getByRole('button', { name });

describe('DatePickerField', () => {
  it('names its trigger with the label and the value, and says it opens a dialog', async () => {
    render(<Field initial="2026-10-20" />);
    const button = trigger('Due date Oct 20, 2026');
    expect(button).toHaveClass('dpf__trigger', 'dpf__trigger--filled');
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveClass('dpf__trigger--open');
    expect(calendar()).toBeInTheDocument();
  });

  it('reads its placeholder while empty', () => {
    const { rerender } = render(<DatePickerField label="Start date" value="" onChange={() => {}} />);
    expect(trigger('Start date Select a date')).not.toHaveClass('dpf__trigger--filled');
    rerender(<DatePickerField label="Start date" value="" showTime onChange={() => {}} />);
    expect(trigger('Start date Select date & time')).toBeInTheDocument();
    rerender(<DatePickerField label="Start date" value="" placeholder="Any day" onChange={() => {}} />);
    expect(trigger('Start date Any day')).toBeInTheDocument();
  });

  it('says required in the name and shows no mark; optional shows "(optional)"', () => {
    const { rerender } = render(<DatePickerField label="Ends" required value="2026-10-24" onChange={() => {}} />);
    expect(trigger('Ends Oct 24, 2026 required')).toBeInTheDocument();
    expect(screen.getByText('required')).toHaveClass('gt-visually-hidden');
    rerender(<DatePickerField label="Ends" optional value="2026-10-24" onChange={() => {}} />);
    expect(trigger('Ends (optional) Oct 24, 2026')).toBeInTheDocument();
  });

  it('shows the date and time with showTime', () => {
    render(<DatePickerField label="Review slot" showTime value="2026-11-02 15:00" onChange={() => {}} />);
    expect(trigger('Review slot Nov 2, 2026 · 3:00 PM')).toBeInTheDocument();
  });

  it('opens on the chosen day, with focus on it, in a grid named by its month', async () => {
    render(<Field initial="2026-10-24" />);
    await user.click(trigger());
    const dialog = calendar();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.parentElement).toBe(document.body);
    expect(within(dialog).getByRole('grid', { name: 'October 2026' })).toBeInTheDocument();
    const chosen = day('Saturday, October 24th, 2026, selected');
    expect(chosen).toHaveFocus();
    expect(chosen).toHaveClass('dpf__cal-day', 'dpf__cal-day--selected');
    expect(chosen.closest('td')).toHaveAttribute('aria-selected', 'true');
    const today = day('Tuesday, October 20th, 2026');
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(today).toHaveClass('dpf__cal-day--today');
    expect(today).toHaveAttribute('tabindex', '-1');
    // Only the chosen day says so: focus sits on the button, not on the cell that is aria-selected.
    expect(within(dialog).getAllByRole('button', { name: /, selected$/ })).toEqual([chosen]);
    expect(within(dialog).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  it('opens on today while empty', async () => {
    render(<Field />);
    await user.click(trigger());
    expect(day('Tuesday, October 20th, 2026')).toHaveFocus();
  });

  it('sets the day picked, closes and returns focus to the trigger', async () => {
    const onChange = vi.fn();
    render(<Field initial="2026-10-20" onChange={onChange} />);
    await user.click(trigger());
    await user.click(day('Saturday, October 24th, 2026'));
    expect(onChange).toHaveBeenCalledWith('2026-10-24');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger('Due date Oct 24, 2026')).toHaveFocus();
  });

  it('picks with Enter on the focused day', async () => {
    const onChange = vi.fn();
    render(<Field initial="2026-10-20" onChange={onChange} />);
    await user.click(trigger());
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onChange).toHaveBeenCalledWith('2026-10-21');
  });

  describe('Esc', () => {
    it('closes the calendar, returns focus to the trigger and never reaches a dialog behind it', async () => {
      const modalEsc = vi.fn();
      document.addEventListener('keydown', modalEsc); // registered first, like a modal
      const onChange = vi.fn();
      render(<Field initial="2026-10-20" onChange={onChange} />);
      await user.click(trigger());
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger()).toHaveFocus();
      expect(trigger()).toHaveAttribute('aria-expanded', 'false');
      expect(modalEsc).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();

      // With the calendar closed, the next Esc is the dialog's.
      await user.keyboard('{Escape}');
      expect(modalEsc).toHaveBeenCalledTimes(1);
      document.removeEventListener('keydown', modalEsc);
    });

    it('closes only the calendar when it opens from a popover, or a panel that listens on window first', async () => {
      const onClose = vi.fn();
      const panelEsc = vi.fn();
      function Panel() {
        const [value, setValue] = useState('');
        return (
          <Popover open onClose={onClose} anchor={<button>Custom</button>}>
            <DatePickerField label="From" value={value} onChange={setValue} />
          </Popover>
        );
      }
      render(<Panel />);
      // A panel that takes Esc on window, in the capture phase, from the moment it opened.
      window.addEventListener('keydown', panelEsc, true);
      await user.click(trigger(/^From/));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(panelEsc).not.toHaveBeenCalled();
      expect(trigger(/^From/)).toHaveFocus();
      window.removeEventListener('keydown', panelEsc, true);
    });
  });

  it('takes a pick made inside a popover, which a press on the calendar leaves open', async () => {
    const onChange = vi.fn();
    function Panel() {
      const [open, setOpen] = useState(true);
      const [value, setValue] = useState('');
      return (
        <>
          <p>Elsewhere</p>
          <Popover open={open} onClose={() => setOpen(false)} anchor={<button type="button">Custom</button>}>
            <DatePickerField label="From" value={value} onChange={(next) => { onChange(next); setValue(next); }} />
          </Popover>
        </>
      );
    }
    render(<Panel />);
    await user.click(trigger(/^From/));
    await user.click(day('Saturday, October 24th, 2026'));
    expect(onChange).toHaveBeenCalledWith('2026-10-24');
    expect(trigger('From Oct 24, 2026')).toBeInTheDocument();
    // A press outside both still closes the popover.
    await user.click(screen.getByText('Elsewhere'));
    expect(screen.queryByRole('button', { name: /^From/ })).toBeNull();
  });

  it('closes when focus moves to a layer opened after it, which then gets its own Esc', async () => {
    render(
      <>
        <Field initial="2026-10-20" />
        <input aria-label="Search everything" />
      </>,
    );
    await user.click(trigger());
    // A palette opened over the page takes the focus without a press, and listens for Esc as the
    // ⌘K palette does: on the document, in the capture phase, from when it opened.
    const paletteEsc = vi.fn();
    document.addEventListener('keydown', paletteEsc, true);
    const palette = screen.getByRole('textbox', { name: 'Search everything' });
    act(() => palette.focus());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(palette).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(paletteEsc).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', paletteEsc, true);
  });

  it('stays open when focus leaves the window, with nowhere else to go', async () => {
    render(<Field initial="2026-10-20" />);
    await user.click(trigger());
    fireEvent.blur(day('Tuesday, October 20th, 2026, selected'), { relatedTarget: null });
    expect(calendar()).toBeInTheDocument();
  });

  it('moves the focused day with the arrow keys, Home, End, PageUp and PageDown', async () => {
    render(<Field initial="2026-10-20" />);
    await user.click(trigger());
    await user.keyboard('{ArrowLeft}');
    expect(day('Monday, October 19th, 2026')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(day('Monday, October 26th, 2026')).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowRight}');
    expect(day('Tuesday, October 20th, 2026, selected')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(day('Sunday, October 18th, 2026')).toHaveFocus();
    await user.keyboard('{End}');
    expect(day('Saturday, October 24th, 2026')).toHaveFocus();
    await user.keyboard('{PageDown}');
    expect(within(calendar()).getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    expect(day('Tuesday, November 24th, 2026')).toHaveFocus();
    await user.keyboard('{Shift>}{PageUp}{/Shift}');
    expect(day('Monday, November 24th, 2025')).toHaveFocus();
    await user.keyboard('{Shift>}{PageDown}{/Shift}{PageUp}');
    expect(day('Saturday, October 24th, 2026')).toHaveFocus();
    // A day past the end of the next month lands on its last day.
    await user.keyboard('{ArrowDown}{End}');
    expect(day('Saturday, October 31st, 2026')).toHaveFocus();
    await user.keyboard('{PageDown}');
    expect(day('Monday, November 30th, 2026')).toHaveFocus();
  });

  it('changes the month from its buttons, keeping focus on the button', async () => {
    render(<Field initial="2026-10-20" />);
    await user.click(trigger());
    const next = within(calendar()).getByRole('button', { name: 'Next month' });
    await user.click(next);
    expect(within(calendar()).getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    expect(next).toHaveFocus();
    await user.click(within(calendar()).getByRole('button', { name: 'Previous month' }));
    await user.click(within(calendar()).getByRole('button', { name: 'Previous month' }));
    expect(within(calendar()).getByRole('grid', { name: 'September 2026' })).toBeInTheDocument();
    // The grid's one tab stop moved with the month, to its first day.
    expect(day('Tuesday, September 1st, 2026')).toHaveAttribute('tabindex', '0');
  });

  it('marks days outside disabledBefore and disabledAfter unavailable, still reachable, never picked', async () => {
    const onChange = vi.fn();
    render(<Field initial="2026-10-20" onChange={onChange} disabledBefore={new Date(2026, 9, 15)} disabledAfter={new Date(2026, 9, 25, 18, 30)} />);
    await user.click(trigger());
    const early = day('Wednesday, October 14th, 2026');
    const late = day('Monday, October 26th, 2026');
    expect(early).toHaveAttribute('aria-disabled', 'true');
    expect(late).toHaveAttribute('aria-disabled', 'true');
    expect(day('Thursday, October 15th, 2026')).not.toHaveAttribute('aria-disabled');
    expect(day('Sunday, October 25th, 2026')).not.toHaveAttribute('aria-disabled');
    await user.click(late);
    expect(onChange).not.toHaveBeenCalled();
    expect(calendar()).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(day('Tuesday, October 27th, 2026')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is described by its error, or its help line', () => {
    const { container, rerender } = render(<DatePickerField label="Ends" value="" onChange={() => {}} helperText="Your time (PT)" />);
    expect(trigger(/^Ends/)).toHaveAccessibleDescription('Your time (PT)');
    rerender(<DatePickerField label="Ends" value="" onChange={() => {}} helperText="Your time (PT)" error="Pick an end date." />);
    expect(trigger(/^Ends/)).toHaveAccessibleDescription('Pick an end date.');
    expect(container.firstChild).toHaveClass('gt-field', 'dpf', 'dpf--error', 'gt-field--error');
  });

  it('does not open while disabled, and closes if it turns disabled while open', async () => {
    const { rerender } = render(<DatePickerField label="Locked" value="2026-09-24" onChange={() => {}} disabled />);
    expect(trigger(/^Locked/)).toBeDisabled();
    rerender(<DatePickerField label="Locked" value="2026-09-24" onChange={() => {}} />);
    await user.click(trigger(/^Locked/));
    expect(calendar()).toBeInTheDocument();
    rerender(<DatePickerField label="Locked" value="2026-09-24" onChange={() => {}} disabled />);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Nothing is left listening: Esc reaches the page again.
    const pageEsc = vi.fn();
    document.addEventListener('keydown', pageEsc);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(pageEsc).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', pageEsc);
  });

  it('closes on a press outside, keeping the value, without taking the focus', async () => {
    render(
      <>
        <button type="button">Elsewhere</button>
        <Field initial="2026-10-20" />
      </>,
    );
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    expect(trigger('Due date Oct 20, 2026')).toBeInTheDocument();
  });

  it('opens from its label, and closes when its trigger or label is pressed again', async () => {
    render(<Field initial="2026-10-20" />);
    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByText('Due date'));
    expect(calendar()).toBeInTheDocument();
    await user.click(screen.getByText('Due date'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('keeps Tab inside the calendar', async () => {
    render(<Field initial="2026-10-20" showTime />);
    await user.click(trigger());
    const dialog = calendar();
    const prev = within(dialog).getByRole('button', { name: 'Previous month' });
    const done = within(dialog).getByRole('button', { name: 'Done' });
    done.focus();
    await user.tab();
    expect(prev).toHaveFocus();
    await user.tab({ shift: true });
    expect(done).toHaveFocus();
  });

  describe('showTime', () => {
    it('labels the time input Time and controls it from the value', async () => {
      const onChange = vi.fn();
      render(<Field initial="2026-11-02 15:00" showTime onChange={onChange} />);
      await user.click(trigger());
      const time = within(calendar()).getByLabelText('Time');
      expect(time).toHaveAttribute('type', 'time');
      expect(time).toHaveAttribute('step', '900');
      expect(time).toHaveValue('15:00');
      fireEvent.change(time, { target: { value: '16:30' } });
      expect(onChange).toHaveBeenLastCalledWith('2026-11-02 16:30');
      expect(time).toHaveValue('16:30');
      expect(trigger('Due date Nov 2, 2026 · 4:30 PM')).toBeInTheDocument();
    });

    it('keeps the calendar open on a pick, at 08:00 when no time is set', async () => {
      const onChange = vi.fn();
      render(<Field showTime onChange={onChange} />);
      await user.click(trigger());
      expect(within(calendar()).getByLabelText('Time')).toHaveValue('08:00');
      expect(within(calendar()).getByRole('button', { name: 'Done' })).toBeDisabled();
      await user.click(day('Thursday, October 22nd, 2026'));
      expect(onChange).toHaveBeenLastCalledWith('2026-10-22 08:00');
      expect(calendar()).toBeInTheDocument();
      expect(day('Thursday, October 22nd, 2026, selected')).toHaveClass('dpf__cal-day--selected');
    });

    it('keeps a time set before the day for the day picked next', async () => {
      const onChange = vi.fn();
      render(<Field showTime onChange={onChange} />);
      await user.click(trigger());
      fireEvent.change(within(calendar()).getByLabelText('Time'), { target: { value: '10:15' } });
      expect(onChange).not.toHaveBeenCalled();
      await user.click(day('Friday, October 23rd, 2026'));
      expect(onChange).toHaveBeenLastCalledWith('2026-10-23 10:15');
    });

    it('shows a cleared time as empty, and a later pick at 08:00', async () => {
      const onChange = vi.fn();
      render(<Field initial="2026-10-22 09:00" showTime onChange={onChange} />);
      await user.click(trigger());
      const time = within(calendar()).getByLabelText('Time');
      fireEvent.change(time, { target: { value: '' } });
      expect(onChange).toHaveBeenLastCalledWith('2026-10-22 ');
      expect(time).toHaveValue('');
      await user.click(day('Saturday, October 24th, 2026'));
      expect(onChange).toHaveBeenLastCalledWith('2026-10-24 08:00');
    });

    it('closes with Done, keeping the value', async () => {
      render(<Field initial="2026-10-22 09:00" showTime />);
      await user.click(trigger());
      await user.click(day('Saturday, October 24th, 2026'));
      await user.click(within(calendar()).getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger('Due date Oct 24, 2026 · 9:00 AM')).toHaveFocus();
    });

    it('Cancel and Esc put back the value it opened with', async () => {
      const onChange = vi.fn();
      render(<Field initial="2026-10-22 09:00" showTime onChange={onChange} />);
      await user.click(trigger());
      await user.click(day('Saturday, October 24th, 2026'));
      await user.click(within(calendar()).getByRole('button', { name: 'Cancel' }));
      expect(onChange).toHaveBeenLastCalledWith('2026-10-22 09:00');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger('Due date Oct 22, 2026 · 9:00 AM')).toHaveFocus();

      await user.click(trigger());
      fireEvent.change(within(calendar()).getByLabelText('Time'), { target: { value: '11:00' } });
      await user.keyboard('{Escape}');
      expect(onChange).toHaveBeenLastCalledWith('2026-10-22 09:00');
      expect(trigger('Due date Oct 22, 2026 · 9:00 AM')).toHaveFocus();

      // Nothing changed: nothing to put back.
      onChange.mockClear();
      await user.click(trigger());
      await user.click(within(calendar()).getByRole('button', { name: 'Cancel' }));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('placement', () => {
    const rect = (top: number, bottom: number, left = 40) =>
      ({ top, bottom, left, right: left + 200, width: 200, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it('sits 6px below the trigger, or flips above it when there is no room below', async () => {
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(300);
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
      const { unmount } = render(<Field initial="2026-10-20" />);
      vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(rect(100, 140));
      await user.click(trigger());
      expect(calendar()).not.toHaveClass('dpf__popover--up');
      expect(calendar().style.top).toBe('146px');
      expect(calendar().style.left).toBe('40px');
      unmount();

      render(<Field initial="2026-10-20" />);
      vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(rect(window.innerHeight - 60, window.innerHeight - 20));
      await user.click(trigger());
      expect(calendar()).toHaveClass('dpf__popover', 'dpf__popover--up');
      expect(calendar().style.top).toBe(`${window.innerHeight - 60 - 300 - 6}px`);
    });

    it('moves a calendar flipped above its trigger when a month of more weeks makes it taller', async () => {
      // 60px of header and footer, and 40px a week.
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('dpf__popover') ? 60 + this.querySelectorAll('tbody tr').length * 40 : 0;
      });
      render(<Field initial="2026-04-15" />);
      const top = window.innerHeight - 60;
      vi.spyOn(trigger(), 'getBoundingClientRect').mockReturnValue(rect(top, top + 40));
      await user.click(trigger());
      // April 2026 has five weeks, May six.
      expect(calendar().style.top).toBe(`${top - (60 + 5 * 40) - 6}px`);
      await user.click(within(calendar()).getByRole('button', { name: 'Next month' }));
      expect(within(calendar()).getByRole('grid', { name: 'May 2026' })).toBeInTheDocument();
      expect(calendar().style.top).toBe(`${top - (60 + 6 * 40) - 6}px`);
    });
  });

  it('passes ref to the trigger, and id and className to the field', () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(<DatePickerField id="due" label="Due date" value="" onChange={() => {}} className="x" ref={ref} />);
    expect(ref.current).toBe(trigger());
    expect(trigger()).toHaveAttribute('id', 'due');
    expect(screen.getByText('Due date')).toHaveAttribute('for', 'due');
    expect(container.firstChild).toHaveClass('dpf', 'x');
  });

  it('stays above modals, with 44px days and trigger on phones and a fade under reduced motion', async () => {
    render(<Field />);
    const [popover] = cssRules('.dpf__popover');
    expect(popover.getPropertyValue('z-index')).toBe('var(--gt-z-picker)');
    expect(popover.getPropertyValue('position')).toBe('fixed');
    const [days] = cssRules('.dpf__cal-day', 'max-width: 767px');
    expect(days.getPropertyValue('width')).toBe('2.75rem');
    const [phone] = cssRules('.dpf__trigger', 'max-width: 767px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
    const [nav] = cssRules('.dpf__cal-nav', 'max-width: 767px');
    expect(nav.getPropertyValue('min-width')).toBe('44px');
    expect(nav.getPropertyValue('min-height')).toBe('44px');
    const [reduced] = cssRules('.dpf__popover', 'prefers-reduced-motion');
    expect(reduced.getPropertyValue('animation')).toContain('gt-fade-in');
  });

  it('resets what the app\'s scaffold button rule gives its raw buttons', () => {
    render(<Field />);
    // The last value declared for the selector, as the cascade would pick between its own rules.
    const declared = (selector: string, prop: string) =>
      cssRules(selector).map((rule) => rule.getPropertyValue(prop)).filter(Boolean).pop();
    expect(declared('.dpf__cal-nav', 'padding')).toMatch(/^0(px)?$/);
    expect(declared('.dpf__cal-day', 'padding')).toMatch(/^0(px)?$/);
    expect(declared('.dpf__cal-day', 'font-weight')).toBe('var(--gt-weight-regular)');
    expect(declared('.dpf__trigger', 'font-weight')).toBe('var(--gt-weight-regular)');
    // Today keeps its weight: its rule comes after the reset.
    const sheetOrder = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => (rule as CSSStyleRule).selectorText).filter(Boolean);
    expect(sheetOrder.lastIndexOf('.dpf__cal-day--today')).toBeGreaterThan(sheetOrder.lastIndexOf('.dpf__cal-day'));
  });

  it('keeps the weekday names in their columns: real table cells, centred', () => {
    render(<Field />);
    const [weekday] = cssRules('.dpf__cal-weekday');
    expect(weekday.getPropertyValue('display')).toBe('table-cell');
    expect(weekday.getPropertyValue('text-align')).toBe('center');
    expect(weekday.getPropertyValue('vertical-align')).toBe('middle');
    expect(weekday.getPropertyValue('height')).toBe('2rem');
    expect(weekday.getPropertyValue('color')).toBe('var(--gt-text-tertiary)');
  });
});
