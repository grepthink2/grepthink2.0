import React from 'react';
import { FieldShell } from './FieldShell.jsx';

const renderOptions = (options) => options.map((o) => (o.options
  ? <optgroup key={o.label} label={o.label}>{renderOptions(o.options)}</optgroup>
  : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>));

/**
 * Native select in the field shell — for short, fixed lists (role, term, sprint, duration).
 * `options` take { value, label } or { label, options: [...] } groups. Searchable or
 * multi-select lists are the Combobox.
 */
export function Select({
  id, label, hideLabel = false, value, onChange, options = [], placeholder,
  helperText, error, disabled = false, required = false, optional = false, compact = false,
  children, className = '', ...rest
}) {
  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} optional={optional} helperText={helperText} error={error} disabled={disabled} className={className}>
      {({ id: selectId, describedBy, invalid }) => (
        <div className={['gt-select', compact ? 'gt-select--compact' : ''].filter(Boolean).join(' ')}>
          <select
            id={selectId}
            className="gt-select__control"
            value={value}
            onChange={onChange}
            disabled={disabled}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            {...rest}
          >
            {placeholder && <option value="" disabled>{placeholder}</option>}
            {children || renderOptions(options)}
          </select>
          <svg className="gt-select__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </FieldShell>
  );
}
