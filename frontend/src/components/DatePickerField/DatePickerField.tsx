import {
  useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
  type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import {
  addDays, addMonths, addYears, endOfWeek, format, getDay, getDaysInMonth, isSameDay, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/Button/Button';
import { FieldShell } from '@/components/FieldShell/FieldShell';
import { Input } from '@/components/Input/Input';
import { onCalendarEscape } from './calendarEscape';
import { DATE_ONLY_FORMAT, formatClock, parseDateValue } from './dateFormats';
import './DatePickerField.scss';

export interface DatePickerFieldProps {
  label: string;
  /**
   * The stored value. Without `showTime`: 'yyyy-MM-dd' or ''. With it: 'yyyy-MM-dd HH:mm' or ''.
   * Strings keep a date-only value from shifting across time zones.
   */
  value: string;
  onChange: (value: string) => void;
  /** Adds a labelled time input (15-minute steps) and Cancel / Done to the calendar. @default false */
  showTime?: boolean;
  /** Days before this date are unavailable. */
  disabledBefore?: Date;
  /** Days after this date are unavailable. */
  disabledAfter?: Date;
  /** The trigger does not open the picker. @default false */
  disabled?: boolean;
  /** Announced with the trigger's name; no visible mark. @default false */
  required?: boolean;
  /** Shows "(optional)". @default false */
  optional?: boolean;
  error?: ReactNode;
  helperText?: ReactNode;
  /** @default 'Select a date' / 'Select date & time' */
  placeholder?: string;
  id?: string;
  className?: string;
  /** Reaches the trigger. */
  ref?: Ref<HTMLButtonElement>;
}

/** The time a day picked with `showTime` gets when the value has none. */
const DEFAULT_TIME = '08:00';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Date (and optional time) field with a calendar dialog, ported from
 * design/components/primitives/DatePickerField.jsx with the codebase's string API, and moved here
 * from features/app. WAI-ARIA Date Picker Dialog: the trigger is a field-look button with
 * `aria-haspopup="dialog"` and `aria-expanded`, named by the label and the chosen value through
 * `aria-labelledby` ("required" appended when it is). The calendar is a modal dialog portaled to
 * <body> at --gt-z-picker, above modals; it sits 6px below the trigger, or above it when it does not
 * fit, 8px inside the viewport. Focus goes to the chosen day (or today); ← → ↑ ↓ move by day and
 * week, Home / End to the week's ends, PageUp / PageDown by month (with Shift, by year), Enter picks,
 * and Tab cycles inside. Out-of-range days stay reachable but cannot be picked. Esc closes the
 * calendar, returning focus to the trigger, before anything behind it hears the key
 * (calendarEscape.ts); a press outside closes it too.
 *
 * `showTime` adds a labelled "Time" input, in 15-minute steps and controlled from the value, and
 * Cancel / Done. As before the move, a pick or a time change sets the value at once (a day picked
 * gets 08:00 while there is no time yet) and the calendar stays open; Done closes it. Cancel and Esc
 * put back the value the calendar opened with; a press outside keeps the new one.
 *
 * Codebase-side: the days are named as date-fns says them ("Tuesday, October 20th, 2026"), `ref`
 * reaches the trigger, and the calendar closes if the field turns disabled while it is open.
 */
export function DatePickerField({
  id, label, value, onChange, showTime = false, disabledBefore, disabledAfter, disabled = false, required = false,
  optional = false, error, helperText, placeholder, className = '', ref,
}: DatePickerFieldProps) {
  const parsed = parseDateValue(value);
  /* oxlint-disable-next-line react/purity -- reads the clock for this render;
     move it out of render before renders are memoized */
  const today = startOfDay(new Date());
  const [open, setOpen] = useState(false);
  const [focusDay, setFocusDay] = useState<Date>(() => parsed?.date ?? today);
  const [pendingTime, setPendingTime] = useState(DEFAULT_TIME);
  const [opened, setOpened] = useState(value);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  // Whether the next render moves focus into the grid: not after a month button.
  const toGrid = useRef(true);
  useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement, []);

  // A field that turns disabled while open closes its calendar.
  if (disabled && open) setOpen(false);

  const before = disabledBefore ? startOfDay(disabledBefore) : null;
  const after = disabledAfter ? startOfDay(disabledAfter) : null;
  const off = (d: Date) => (before !== null && d < before) || (after !== null && d > after);

  const openPicker = () => {
    setFocusDay(parsed?.date ?? today);
    setPendingTime(DEFAULT_TIME);
    setOpened(value);
    toGrid.current = true;
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  // Esc and Cancel: put back what the calendar opened with.
  const dismiss = useCallback(() => {
    if (showTime && value !== opened) onChange(opened);
    setOpen(false);
    triggerRef.current?.focus();
  }, [showTime, value, opened, onChange]);

  useEffect(() => {
    if (!open) return undefined;
    return onCalendarEscape(dismiss);
  }, [open, dismiss]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      // A press on the field itself (its label, its trigger) is the trigger's to handle.
      const target = e.target as Node;
      if (popRef.current?.contains(target) || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // The calendar is portaled to <body>, so a popover or panel the field sits in would take a press on
  // a day for a press outside it and close, dropping the pick. The press stops at the calendar.
  useEffect(() => {
    const pop = popRef.current;
    if (!open || !pop) return undefined;
    const stop = (e: MouseEvent) => e.stopPropagation();
    pop.addEventListener('mousedown', stop);
    return () => pop.removeEventListener('mousedown', stop);
  }, [open]);

  // The month shown: a month of more or fewer weeks changes the calendar's height, and a calendar
  // flipped above its trigger has to move with it.
  const shownMonth = `${focusDay.getFullYear()}-${focusDay.getMonth()}`;
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const trigger = triggerRef.current;
      const pop = popRef.current;
      if (!trigger || !pop) return;
      const r = trigger.getBoundingClientRect();
      const h = pop.offsetHeight;
      const w = pop.offsetWidth;
      const vh = window.innerHeight;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const up = vh - r.bottom < h + 12 && r.top > vh - r.bottom;
      setPos({
        up,
        top: up ? Math.max(8, r.top - h - 6) : Math.min(r.bottom + 6, vh - h - 8),
        left: Math.max(8, Math.min(r.left, vw - w - 8)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, showTime, shownMonth]);

  useEffect(() => {
    if (!open || !toGrid.current) return;
    popRef.current?.querySelector<HTMLButtonElement>('[data-focus="true"]')?.focus();
  }, [open, focusDay]);

  const moveTo = (d: Date) => {
    toGrid.current = true;
    setFocusDay(startOfDay(d));
  };
  const onDayKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focusDay, -1),
      ArrowRight: () => addDays(focusDay, 1),
      ArrowUp: () => addDays(focusDay, -7),
      ArrowDown: () => addDays(focusDay, 7),
      Home: () => startOfWeek(focusDay),
      End: () => endOfWeek(focusDay),
      PageUp: () => (e.shiftKey ? addYears(focusDay, -1) : addMonths(focusDay, -1)),
      PageDown: () => (e.shiftKey ? addYears(focusDay, 1) : addMonths(focusDay, 1)),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    moveTo(move());
  };
  const shiftMonth = (n: number) => {
    toGrid.current = false;
    setFocusDay((d) => startOfMonth(addMonths(d, n)));
  };
  const pick = (d: Date) => {
    if (off(d)) return;
    const day = format(d, DATE_ONLY_FORMAT);
    if (!showTime) {
      onChange(day);
      close(true);
      return;
    }
    onChange(`${day} ${parsed?.time || pendingTime}`);
  };
  const changeTime = (time: string) => {
    if (parsed) onChange(`${format(parsed.date, DATE_ONLY_FORMAT)} ${time}`);
    else setPendingTime(time);
  };
  // Focus that moves out of the calendar and its field, into a layer opened after it (the ⌘K palette),
  // closes the calendar and stays where it went: a hidden calendar would keep taking that layer's Esc.
  // Focus that leaves the window, with no element next, keeps it open.
  const onFocusOut = (e: ReactFocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (!next || popRef.current?.contains(next) || rootRef.current?.contains(next)) return;
    setOpen(false);
  };
  // Tab and Shift+Tab wrap inside the calendar.
  const onPopKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !popRef.current) return;
    const stops = Array.from(popRef.current.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input'))
      .filter((el) => !el.disabled && el.tabIndex !== -1);
    if (stops.length === 0) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const monthStart = startOfMonth(focusDay);
  const cells: (Date | null)[] = Array.from({ length: getDay(monthStart) }, () => null);
  for (let d = 0; d < getDaysInMonth(focusDay); d++) cells.push(addDays(monthStart, d));
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const chosen = parsed?.date ?? null;
  const valueText = parsed
    ? `${format(parsed.date, 'MMM d, yyyy')}${showTime && parsed.time ? ` · ${formatClock(parsed.time)}` : ''}`
    : placeholder ?? (showTime ? 'Select date & time' : 'Select a date');
  const shown = open && !disabled;

  return (
    <FieldShell
      ref={rootRef}
      id={id}
      label={label}
      optional={optional}
      helperText={helperText}
      error={error}
      disabled={disabled}
      className={['dpf', error ? 'dpf--error' : '', className].filter(Boolean).join(' ')}
    >
      {({ id: triggerId, labelId, describedBy }) => {
        const valueId = `${triggerId}-value`;
        const requiredId = `${triggerId}-req`;
        const titleId = `${triggerId}-title`;
        return (
          <>
            <button
              ref={triggerRef}
              id={triggerId}
              type="button"
              className={['dpf__trigger', shown ? 'dpf__trigger--open' : '', parsed ? 'dpf__trigger--filled' : ''].filter(Boolean).join(' ')}
              aria-haspopup="dialog"
              aria-expanded={shown}
              aria-labelledby={[labelId, valueId, required ? requiredId : ''].filter(Boolean).join(' ')}
              aria-describedby={describedBy}
              disabled={disabled}
              onClick={() => (shown ? close(true) : openPicker())}
              onBlur={shown ? onFocusOut : undefined}
            >
              <span className="dpf__trigger-text" id={valueId}>{valueText}</span>
              {required && <span className="gt-visually-hidden" id={requiredId}>required</span>}
              <CalendarDays className="dpf__trigger-icon" size={16} aria-hidden="true" />
            </button>
            {shown && createPortal(
              <div
                ref={popRef}
                className={['dpf__popover', pos.up ? 'dpf__popover--up' : ''].filter(Boolean).join(' ')}
                role="dialog"
                aria-modal="true"
                aria-label="Choose date"
                style={{ top: pos.top, left: pos.left }}
                onKeyDown={onPopKeyDown}
                onBlur={onFocusOut}
              >
                <div className="dpf__cal-head">
                  <button type="button" className="dpf__cal-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
                    <ChevronLeft size={16} aria-hidden="true" />
                  </button>
                  <span className="dpf__cal-title" id={titleId} aria-live="polite">{format(focusDay, 'MMMM yyyy')}</span>
                  <button type="button" className="dpf__cal-nav" aria-label="Next month" onClick={() => shiftMonth(1)}>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
                <table className="dpf__cal-grid" role="grid" aria-labelledby={titleId}>
                  <thead>
                    <tr>
                      {WEEKDAYS.map((name) => (
                        <th key={name} scope="col" abbr={name} className="dpf__cal-weekday">{name.slice(0, 2)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weeks.map((week, row) => (
                      <tr key={row}>
                        {week.map((d, col) => (d ? (
                          <td key={col} aria-selected={chosen !== null && isSameDay(d, chosen)}>
                            <button
                              type="button"
                              className={[
                                'dpf__cal-day',
                                chosen && isSameDay(d, chosen) ? 'dpf__cal-day--selected' : '',
                                isSameDay(d, today) && !(chosen && isSameDay(d, chosen)) ? 'dpf__cal-day--today' : '',
                              ].filter(Boolean).join(' ')}
                              tabIndex={isSameDay(d, focusDay) ? 0 : -1}
                              data-focus={isSameDay(d, focusDay) ? 'true' : undefined}
                              // The cell is aria-selected, but focus is on the button: its name says it too.
                              aria-label={`${format(d, 'PPPP')}${chosen && isSameDay(d, chosen) ? ', selected' : ''}`}
                              aria-current={isSameDay(d, today) ? 'date' : undefined}
                              aria-disabled={off(d) || undefined}
                              onKeyDown={onDayKey}
                              onFocus={() => {
                                if (!isSameDay(d, focusDay)) moveTo(d);
                              }}
                              onClick={() => pick(d)}
                            >
                              {d.getDate()}
                            </button>
                          </td>
                        ) : <td key={col} />))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showTime && (
                  <>
                    <div className="dpf__time">
                      <Input
                        label="Time"
                        type="time"
                        step={900}
                        compact
                        value={parsed ? parsed.time : pendingTime}
                        onChange={(e) => changeTime(e.target.value)}
                      />
                    </div>
                    <div className="dpf__footer">
                      <Button variant="outline" size="sm" onClick={dismiss}>Cancel</Button>
                      <Button size="sm" onClick={() => close(true)} disabled={!parsed}>Done</Button>
                    </div>
                  </>
                )}
              </div>,
              document.body,
            )}
          </>
        );
      }}
    </FieldShell>
  );
}
