import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { useRovingFocus } from '@/components/hooks/useRovingFocus';
import { FilterChip } from './FilterChip';

export interface FilterChipOption {
  value: string;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
  /** A pointer hint, such as why the option is disabled ("Select a class first"). Keyboards never reach it: say it in text too when it matters. */
  title?: string;
}

interface FilterChipGroupBase extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label' | 'onChange' | 'children' | 'defaultValue'> {
  /** Names the group ("Date range", "Filter by type"). */
  ariaLabel: string;
  options: FilterChipOption[];
  /** @default 'md' */
  size?: 'sm' | 'md';
  /**
   * Set from `type` and `ariaLabel`. JSX takes any hyphenated prop a type leaves out, so both are
   * declared `never` rather than only omitted.
   */
  role?: never;
  'aria-label'?: never;
  ref?: Ref<HTMLDivElement>;
}

export interface FilterChipGroupSingleProps extends FilterChipGroupBase {
  /** A radio group: one choice, one tab stop, and the arrow keys move and select. */
  type: 'single';
  value: string;
  onChange?: (value: string) => void;
}

export interface FilterChipGroupMultiProps extends FilterChipGroupBase {
  /** Pressed toggles, each in the tab order. @default 'multi' */
  type?: 'multi';
  value: string[];
  onChange?: (value: string[]) => void;
}

export type FilterChipGroupProps = FilterChipGroupSingleProps | FilterChipGroupMultiProps;

/**
 * A row of FilterChips with the right group semantics, ported from
 * design/components/navigation/FilterChip.jsx.
 *
 * `type="single"` is the WAI-ARIA radio group, as the kit's RadioGroup is natively: `role="radiogroup"`
 * of radio chips with one tab stop, entered at the checked chip (else the first enabled one). Any
 * arrow key moves to the next or previous enabled chip and checks it, wrapping, and Home and End go
 * to the first and last (useRovingFocus). A click or Space checks the chip pressed; pressing the
 * checked chip changes nothing.
 *
 * `type="multi"`, the default, is a `role="group"` of toggle chips, each in the tab order; a press
 * adds its value to the list or takes it out.
 *
 * Native props and `ref` reach the group's row.
 */
export function FilterChipGroup(props: FilterChipGroupProps) {
  // type, value and onChange stay off the row; the narrowed `props` reads them.
  const { type, value, onChange, ariaLabel, options, size = 'md', className = '', ref, ...rest } = props;
  const single = props.type === 'single';
  const chosen: string[] = props.type === 'single' ? [props.value] : Array.isArray(props.value) ? props.value : [];
  const choose = (picked: string, on: boolean) => {
    if (props.type === 'single') {
      if (!on) props.onChange?.(picked);
    } else {
      props.onChange?.(on ? chosen.filter((v) => v !== picked) : [...chosen, picked]);
    }
  };
  const { getItemProps } = useRovingFocus({
    count: options.length,
    activeIndex: props.type === 'single' ? options.findIndex((o) => o.value === props.value) : -1,
    orientation: 'both',
    isDisabled: (i) => !!options[i].disabled,
    // Landing on the chip already checked reports nothing: a parent that kept its value, or turned the
    // last change down, left focus on another chip.
    onMove: (i) => choose(options[i].value, chosen.includes(options[i].value)),
  });
  return (
    <div
      {...rest}
      ref={ref}
      className={['gt-filter-chips', className].filter(Boolean).join(' ')}
      role={single ? 'radiogroup' : 'group'}
      aria-label={ariaLabel}
    >
      {options.map((opt, i) => {
        const on = chosen.includes(opt.value);
        return (
          <FilterChip
            key={opt.value}
            {...(single ? getItemProps(i) : {})}
            kind={single ? 'radio' : 'toggle'}
            size={size}
            selected={on}
            count={opt.count}
            icon={opt.icon}
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => choose(opt.value, on)}
          >
            {opt.label}
          </FilterChip>
        );
      })}
    </div>
  );
}
