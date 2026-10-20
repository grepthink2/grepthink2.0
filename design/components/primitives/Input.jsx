import React from 'react';
import { FieldShell } from './FieldShell.jsx';

/**
 * Text input in the field shell. Adornments (iconLeft, prefixText, suffix, action) sit inside one
 * bordered input group. `maxLength` is a soft limit: the counter appears at 80% (or always with
 * `showCount`), and past the limit the field is flagged, not truncated.
 */
export function Input({
  id, label, hideLabel = false, value, onChange, placeholder, type = 'text',
  helperText, error, disabled = false, required = false, optional = false,
  iconLeft = null, prefixText, suffix = null, action = null, compact = false,
  maxLength, showCount = false, className = '', inputClassName = '', ...rest
}) {
  const count = typeof value === 'string' ? value.length : 0;
  const counter = maxLength != null && (showCount || count >= maxLength * 0.8);
  const grouped = iconLeft || prefixText || suffix || action;
  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} optional={optional} helperText={helperText} error={error}
      count={counter ? count : undefined} max={counter ? maxLength : undefined} disabled={disabled} className={className}>
      {({ id: inputId, describedBy, invalid }) => {
        const prefixId = prefixText ? `${inputId}-prefix` : null;
        const input = (
          <input
            id={inputId}
            className={['gt-input', compact ? 'gt-input--compact' : '', inputClassName].filter(Boolean).join(' ')}
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            aria-invalid={invalid || undefined}
            aria-describedby={[prefixId, describedBy].filter(Boolean).join(' ') || undefined}
            {...rest}
          />
        );
        if (!grouped) return input;
        return (
          <div className={['gt-input-group', compact ? 'gt-input-group--compact' : '', disabled ? 'gt-input-group--disabled' : ''].filter(Boolean).join(' ')}>
            {iconLeft && <span className="gt-input-group__icon" aria-hidden="true">{iconLeft}</span>}
            {prefixText && <span className="gt-input-group__prefix" id={prefixId}>{prefixText}</span>}
            {input}
            {suffix && <span className="gt-input-group__suffix">{suffix}</span>}
            {action && <span className="gt-input-group__action">{action}</span>}
          </div>
        );
      }}
    </FieldShell>
  );
}
