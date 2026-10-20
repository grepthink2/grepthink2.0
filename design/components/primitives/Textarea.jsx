import React from 'react';
import { FieldShell } from './FieldShell.jsx';

/**
 * Multi-line text field in the field shell (TSR feedback, descriptions, notes).
 * With `maxLength` the counter always shows ("128 / 500"); past the limit the text is kept,
 * the counter and border turn red, and the form's validation blocks the save.
 */
export function Textarea({
  id, label, hideLabel = false, value, onChange, placeholder, rows = 4,
  helperText, error, disabled = false, required = false, optional = false,
  maxLength, showCount = true, className = '', ...rest
}) {
  const count = typeof value === 'string' ? value.length : 0;
  const counter = maxLength != null && showCount;
  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} optional={optional} helperText={helperText} error={error}
      count={counter ? count : undefined} max={counter ? maxLength : undefined} disabled={disabled} className={className}>
      {({ id: inputId, describedBy, invalid }) => (
        <textarea
          id={inputId}
          className="gt-textarea"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FieldShell>
  );
}
