import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { useRovingFocus } from '@/components/hooks/useRovingFocus';
import './SegmentedControl.scss';

export interface SegmentedOption<V extends string = string> {
  value: V;
  /** The visible label. For an icon-only option, pass `ariaLabel` and an empty label. */
  label: ReactNode;
  icon?: ReactNode;
  /** A small tertiary count after the label (the search scopes' counts). */
  count?: number;
  /** The accessible name, when the label is icon-only. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string = string>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children' | 'role' | 'aria-label'> {
  options: SegmentedOption<V>[];
  value: V;
  onChange?: (value: V) => void;
  /** Names the radio group ("View", "Unit"). */
  ariaLabel: string;
  /** md: 30px options; sm: 24px (44 on phones). @default 'md' */
  size?: 'sm' | 'md';
  /** Stretches the options across the container (always, under 768px). @default false */
  fullWidth?: boolean;
  /**
   * Set by the control: a radiogroup, named by `ariaLabel`. JSX takes any hyphenated prop a type
   * leaves out, so both are declared `never` rather than only omitted.
   */
  role?: never;
  'aria-label'?: never;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The segmented control, ported from design/components/navigation/SegmentedControl.jsx, for
 * switching the view or unit of the same content (Table / Cards, Tasks / Points). The same grey track
 * as Tabs, but it sizes to its options (full width with `fullWidth`, and always on phones). It is the
 * WAI-ARIA radio group, as the kit's single-choice FilterChipGroup is: a `radiogroup` of `radio`s with
 * one tab stop, entered at the checked option (else the first enabled one); any arrow key moves to the
 * next or previous enabled option and checks it, wrapping, and Home and End go to the ends
 * (useRovingFocus). A click or Space checks the option pressed; pressing the checked one changes
 * nothing.
 *
 * Codebase-side: a space keeps the count apart from the label in the option's name. Native props and
 * `ref` reach the group.
 */
export function SegmentedControl<V extends string = string>({
  options, value, onChange, ariaLabel, size = 'md', fullWidth = false, className = '', ref, ...rest
}: SegmentedControlProps<V>) {
  const choose = (next: V) => {
    if (next !== value) onChange?.(next);
  };
  const { getItemProps } = useRovingFocus({
    count: options.length,
    activeIndex: options.findIndex((o) => o.value === value),
    orientation: 'both',
    isDisabled: (i) => !!options[i].disabled,
    onMove: (i) => choose(options[i].value),
  });
  return (
    <div
      {...rest}
      ref={ref}
      className={['gt-segmented', `gt-segmented--${size}`, fullWidth ? 'gt-segmented--full' : '', className].filter(Boolean).join(' ')}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            {...getItemProps(i)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel}
            className={['gt-segmented__option', active ? 'gt-segmented__option--active' : ''].filter(Boolean).join(' ')}
            disabled={opt.disabled}
            onClick={() => choose(opt.value)}
          >
            {opt.icon && <span className="gt-segmented__icon" aria-hidden="true">{opt.icon}</span>}
            {opt.label}
            {opt.count != null && <> <span className="gt-segmented__count">{opt.count}</span></>}
          </button>
        );
      })}
    </div>
  );
}
