import { useId, useImperativeHandle, useRef, useState, type InputHTMLAttributes, type Ref } from 'react';
import { Search, X } from 'lucide-react';
import './SearchField.scss';

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'defaultValue' | 'size' | 'type'> {
  /** The query, for a controlled field; `defaultValue` for an uncontrolled one. */
  value?: string;
  defaultValue?: string;
  /** Receives the new string (not the event). */
  onChange?: (value: string) => void;
  /** Screen-reader label (visually hidden). Name what is searched: "Search classmates". @default 'Search' */
  label?: string;
  /** @default 'Search…' */
  placeholder?: string;
  /** 32px instead of 36px (44 on phones). @default false */
  compact?: boolean;
  /** Drops the 320px cap. @default false */
  fullWidth?: boolean;
  disabled?: boolean;
  /** Called by the clear (×) button; without it the button calls `onChange('')`. Focus returns to the input. */
  onClear?: () => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * The standard inline filter for lists and tables, ported from design/components/primitives/SearchField.jsx
 * (promoted from the search layer): a native `type="search"` input inside `role="search"`, named by a
 * visually hidden label, never the placeholder. The × "Clear search" shows while there is text and
 * returns focus to the input. Debounce in the caller; this is presentational.
 *
 * Native props and `ref` reach the `<input>`. Codebase-side: it works uncontrolled too (`defaultValue`).
 */
export function SearchField({
  id, value, defaultValue = '', onChange, label = 'Search', placeholder = 'Search…', compact = false, fullWidth = false,
  disabled = false, onClear, className = '', ref, ...rest
}: SearchFieldProps) {
  const reactId = useId();
  const inputId = id || reactId;
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);
  const [own, setOwn] = useState(defaultValue);
  const query = value ?? own;
  const change = (next: string) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  const clear = () => {
    if (onClear) {
      if (value === undefined) setOwn('');
      onClear();
    } else {
      change('');
    }
    inputRef.current?.focus();
  };
  return (
    <div
      className={['gt-search-field', compact ? 'gt-search-field--compact' : '', fullWidth ? 'gt-search-field--full' : '', className]
        .filter(Boolean).join(' ')}
      role="search"
    >
      <label className="gt-visually-hidden" htmlFor={inputId}>{label}</label>
      <span className="gt-search-field__icon"><Search size={15} aria-hidden="true" /></span>
      <input
        {...rest}
        ref={inputRef}
        id={inputId}
        type="search"
        className="gt-search-field__input"
        value={query}
        onChange={(e) => change(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {query && !disabled && (
        <button type="button" className="gt-search-field__clear" aria-label="Clear search" onClick={clear}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
