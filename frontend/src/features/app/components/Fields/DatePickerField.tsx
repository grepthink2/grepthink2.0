import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
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

const POPOVER_EST_HEIGHT = { date: 320, datetime: 420 } as const;
const POPOVER_EDGE_PAD = 12;
/** Above modals ($z-index-modal: 100); popover is portaled to document.body */
const POPOVER_Z_INDEX = 1100;

const VIEWPORT_BOUNDS = () =>
  new DOMRect(0, 0, window.innerWidth, window.innerHeight);

/** Fallback width before the portaled popover is measured. */
const POPOVER_FALLBACK_WIDTH = { date: 280, datetime: 300 } as const;

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
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef   = useRef<HTMLButtonElement>(null);
  const popoverRef   = useRef<HTMLDivElement>(null);
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

  // ── Position popover within modal / scroll parent ─────────────
  const popoverHeightEst = showTime ? POPOVER_EST_HEIGHT.datetime : POPOVER_EST_HEIGHT.date;
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !containerRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const viewport = VIEWPORT_BOUNDS();
    const fallbackWidth = showTime ? POPOVER_FALLBACK_WIDTH.datetime : POPOVER_FALLBACK_WIDTH.date;
    const measuredWidth = popoverRef.current?.offsetWidth ?? fallbackWidth;
    const width = Math.min(measuredWidth, viewport.width - POPOVER_EDGE_PAD * 2);
    const measuredHeight = popoverRef.current?.offsetHeight ?? popoverHeightEst;
    const height = Math.max(measuredHeight, popoverHeightEst);

    // Vertical placement uses the viewport so the popover can extend over modals
    const spaceBelow = viewport.bottom - trigger.bottom;
    const spaceAbove = trigger.top - viewport.top;
    const openUp = spaceBelow < height && spaceAbove > spaceBelow;

    let top = openUp ? trigger.top - height - 6 : trigger.bottom + 6;
    top = Math.max(
      POPOVER_EDGE_PAD,
      Math.min(top, viewport.bottom - height - POPOVER_EDGE_PAD),
    );

    // Right-align compact popover to the trigger (no full-modal width stretch)
    let left = trigger.right - width;
    left = Math.max(
      POPOVER_EDGE_PAD,
      Math.min(left, viewport.width - width - POPOVER_EDGE_PAD),
    );

    setPopoverDir(openUp ? 'up' : 'down');
    setPopoverStyle({
      position: 'fixed',
      top,
      left,
      zIndex: POPOVER_Z_INDEX,
    });
  }, [open, showTime, popoverHeightEst]);

  // ── Sync uncontrolled time input ─────────────────────────────
  useEffect(() => {
    if (timeRef.current && timeRef.current !== document.activeElement) {
      timeRef.current.value = selectedTime;
    }
  }, [selectedTime]);

  // ── Close on outside click ───────────────────────────────────
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
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

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={`dpf__popover dpf__popover--portal dpf__popover--${popoverDir}`}
            style={popoverStyle}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
};

export default DatePickerField;
