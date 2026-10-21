import type { ReactNode, Ref, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { FieldShell } from '@/components/FieldShell/FieldShell';
import './Select.scss';

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectGroup = { label: string; options: SelectOption[] };

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'value' | 'aria-invalid'> {
  label?: ReactNode;
  /** @default false */
  hideLabel?: boolean;
  /** The value, for a controlled select; `defaultValue` for an uncontrolled one. */
  value?: string;
  /** Options or `optgroup` groups. Ignored when children are passed. */
  options?: Array<SelectOption | SelectGroup>;
  /** A disabled first option, shown while the value is ''. */
  placeholder?: string;
  helperText?: ReactNode;
  /** Replaces the help line; sets `aria-invalid` and the error border. */
  error?: ReactNode;
  /** Shows "(optional)" after the label. @default false */
  optional?: boolean;
  /** 32px for toolbars and filter rows (44 on phones). @default false */
  compact?: boolean;
  /** `<option>` and `<optgroup>` elements, in place of `options`. */
  children?: ReactNode;
  /** Set from `error`. JSX takes any hyphenated prop a type leaves out, so it is declared `never`. */
  'aria-invalid'?: never;
  ref?: Ref<HTMLSelectElement>;
}

const renderOptions = (options: Array<SelectOption | SelectGroup>): ReactNode =>
  options.map((o) => ('options' in o
    ? <optgroup key={o.label} label={o.label}>{renderOptions(o.options)}</optgroup>
    : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>));

/**
 * Native select in the field shell, ported from design/components/primitives/Select.jsx: for short,
 * fixed lists (role, term, sprint, duration). Keyboard and screen-reader behaviour are the browser's.
 * `options` take `{ value, label }` or `{ label, options: [...] }` groups; children (`<option>`,
 * `<optgroup>`) replace them. Help and error are linked with `aria-describedby`, after any ids the
 * caller passes. Searchable or multi-select lists are the Combobox.
 *
 * Native props and `ref` reach the `<select>`, `className` the field. Codebase-side: uncontrolled with
 * a `placeholder`, it starts on the placeholder (a browser would otherwise pick the first enabled
 * option).
 */
export function Select({
  id, label, hideLabel = false, value, defaultValue, options = [], placeholder, helperText, error, disabled = false,
  optional = false, compact = false, children, className = '', 'aria-describedby': describedByProp, ref, ...rest
}: SelectProps) {
  const startsOnPlaceholder = placeholder && value === undefined && defaultValue === undefined;
  return (
    <FieldShell
      id={id}
      label={label}
      hideLabel={hideLabel}
      optional={optional}
      helperText={helperText}
      error={error}
      disabled={disabled}
      className={className}
    >
      {({ id: selectId, describedBy, invalid }) => (
        <div className={['gt-select', compact ? 'gt-select--compact' : ''].filter(Boolean).join(' ')}>
          <select
            {...rest}
            ref={ref}
            id={selectId}
            className="gt-select__control"
            value={value}
            defaultValue={startsOnPlaceholder ? '' : defaultValue}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={[describedByProp, describedBy].filter(Boolean).join(' ') || undefined}
          >
            {placeholder && <option value="" disabled>{placeholder}</option>}
            {children ?? renderOptions(options)}
          </select>
          <ChevronDown className="gt-select__chevron" size={16} aria-hidden="true" />
        </div>
      )}
    </FieldShell>
  );
}
