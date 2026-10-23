import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Check } from 'lucide-react';
import './FilterChip.scss';

export interface FilterChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'role' | 'aria-pressed' | 'aria-checked'> {
  children: ReactNode;
  /** Rendered as `aria-pressed` (toggle) or `aria-checked` (radio). @default false */
  selected?: boolean;
  /** A tertiary count after the label, white while selected. */
  count?: number;
  /** A leading 14px icon, which a check replaces while a toggle chip is selected. */
  icon?: ReactNode;
  /** sm 26px · md 32px (44 on phones). @default 'md' */
  size?: 'sm' | 'md';
  /** 'toggle' alone or in a multi-choice group; 'radio' inside a single-choice group. @default 'toggle' */
  kind?: 'toggle' | 'radio';
  /**
   * Set from `kind` and `selected`. JSX takes any hyphenated prop a type leaves out, so all three are
   * declared `never` rather than only omitted.
   */
  role?: never;
  'aria-pressed'?: never;
  'aria-checked'?: never;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * One filter chip, ported from design/components/navigation/FilterChip.jsx: it narrows a list (palette
 * scopes, analytics range, schedule kinds). A pill on white; selected is solid green with white text.
 * Alone or in a multi-choice FilterChipGroup it is a toggle button (`aria-pressed`) whose check
 * replaces its icon while selected, so the state is not colour alone; inside a single-choice group it
 * is a radio (`aria-checked`). `type` defaults to `"button"`.
 *
 * A space before the count keeps it apart from the label in the accessible name ("TA meetings 3", as
 * the palette's scope chips read); on screen the flex gap does that, and a flex row drops the space.
 * Native props and `ref` reach the button.
 */
export function FilterChip({
  children, selected = false, count, icon, size = 'md', kind = 'toggle', type = 'button', className = '', ref, ...rest
}: FilterChipProps) {
  const radio = kind === 'radio';
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? selected : undefined}
      aria-pressed={radio ? undefined : selected}
      className={['gt-filter-chip', size === 'sm' ? 'gt-filter-chip--sm' : '', selected ? 'gt-filter-chip--selected' : '', className]
        .filter(Boolean).join(' ')}
    >
      {selected && !radio ? (
        <span className="gt-filter-chip__icon" aria-hidden="true"><Check size={13} strokeWidth={2.6} aria-hidden="true" /></span>
      ) : icon ? (
        <span className="gt-filter-chip__icon" aria-hidden="true">{icon}</span>
      ) : null}
      {children}
      {count != null && <> <span className="gt-filter-chip__count">{count}</span></>}
    </button>
  );
}
