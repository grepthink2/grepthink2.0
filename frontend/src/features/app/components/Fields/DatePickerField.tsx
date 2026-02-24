import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parse, isValid } from 'date-fns';
import { CalendarDays, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-day-picker/dist/style.css';
import './DatePickerField.scss';

// ── Format constants ───────────────────────────────────────────
export const DATE_ONLY_FORMAT = 'yyyy-MM-dd';
export const DATETIME_FORMAT  = 'yyyy-MM-dd HH:mm';

const DATE_DISPLAY     = 'MMM d, yyyy';
const DATETIME_DISPLAY = "MMM d, yyyy 'at' h:mm a";

// ── Props ──────────────────────────────────────────────────────
export interface DatePickerFieldProps {
  label: string;
  /**
   * Stored value string.
   * - `showTime=false` (default): `'yyyy-MM-dd'` or `''`
   * - `showTime=true`           : `'yyyy-MM-dd HH:mm'` or `''`
   */
  value: string;
  onChange: (val: string) => void;
  /** Show a time input row inside the popover (default: false) */
  showTime?: boolean;
  /** Disable all calendar days before this date */
  disabledBefore?: Date;
  /** CSS class applied to the `<label>` element */
  labelClassName?: string;
}

// ── Component ──────────────────────────────────────────────────
const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
  showTime = false,
  disabledBefore,
  labelClassName = 'dpf__label',
}) => {
  const [open, setOpen]               = useState(false);
  const [popoverDir, setPopoverDir]   = useState<'down' | 'up'>('down');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef   = useRef<HTMLButtonElement>(null);
  const timeRef      = useRef<HTMLInputElement>(null);

  // ── Parse value ──────────────────────────────────────────────
  const parsed = value
    ? parse(value, showTime ? DATETIME_FORMAT : DATE_ONLY_FORMAT, new Date())
    : undefined;
  const validDate  = parsed && isValid(parsed) ? parsed : undefined;

  const selectedDay = validDate
    ? new Date(validDate.getFullYear(), validDate.getMonth(), validDate.getDate())
    : undefined;

  const selectedTime = validDate
    ? `${String(validDate.getHours()).padStart(2, '0')}:${String(validDate.getMinutes()).padStart(2, '0')}`
    : '08:00';

  const displayText = validDate
    ? format(validDate, showTime ? DATETIME_DISPLAY : DATE_DISPLAY)
    : showTime ? 'Select date & time' : 'Select a date';

  // ── Flip direction ───────────────────────────────────────────
  const POPOVER_HEIGHT = showTime ? 420 : 320;
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect       = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setPopoverDir(spaceBelow < POPOVER_HEIGHT && spaceAbove > spaceBelow ? 'up' : 'down');
  }, [open]);

  // ── Sync uncontrolled time input ─────────────────────────────
  useEffect(() => {
    if (timeRef.current && timeRef.current !== document.activeElement) {
      timeRef.current.value = selectedTime;
    }
  }, [selectedTime]);

  // ── Close on outside click ───────────────────────────────────
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // ── Handlers ─────────────────────────────────────────────────
  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const dateStr = format(day, DATE_ONLY_FORMAT);
    if (showTime) {
      onChange(`${dateStr} ${selectedTime}`);
      // Keep popover open so user can adjust time
    } else {
      onChange(dateStr);
      setOpen(false);
    }
  };

  const handleTimeChange = (time: string) => {
    const dateStr = selectedDay
      ? format(selectedDay, DATE_ONLY_FORMAT)
      : format(new Date(), DATE_ONLY_FORMAT);
    onChange(`${dateStr} ${time}`);
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="dpf" ref={containerRef}>
      <label className={labelClassName}>{label}</label>

      <button
        ref={triggerRef}
        type="button"
        className={[
          'dpf__trigger',
          open  ? 'dpf__trigger--open'   : '',
          value ? 'dpf__trigger--filled' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setOpen(v => !v)}
        aria-label={`Pick ${label}`}
      >
        <span className="dpf__trigger-text">{displayText}</span>
        <CalendarDays size={16} className="dpf__trigger-icon" />
      </button>

      {open && (
        <div className={`dpf__popover dpf__popover--${popoverDir}`}>
          <DayPicker
            mode="single"
            selected={selectedDay}
            onSelect={handleDaySelect}
            defaultMonth={selectedDay ?? new Date()}
            disabled={disabledBefore ? { before: disabledBefore } : undefined}
            components={{
              Chevron: ({ orientation }) =>
                orientation === 'left'
                  ? <ChevronLeft size={16} />
                  : <ChevronRight size={16} />,
            }}
          />

          {showTime && (
            <>
              <div className="dpf__time-row">
                <Clock size={14} className="dpf__time-icon" />
                <span className="dpf__time-label">Time</span>
                <input
                  ref={timeRef}
                  type="time"
                  className="dpf__time-input"
                  defaultValue={selectedTime}
                  onChange={e => handleTimeChange(e.target.value)}
                />
              </div>
              <div className="dpf__popover-footer">
                <button
                  type="button"
                  className="dpf__confirm-btn"
                  onClick={() => setOpen(false)}
                  disabled={!value}
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DatePickerField;
