import React from 'react';
import './Assistant.scss';

export interface UnlinkedPRChipProps {
  /** @default 'PR #44' */
  pr?: string;
  onAdd?: () => void;
  /** @default 'Add task' */
  addLabel?: string;
  /** 'bare' drops all chrome, for sitting inside another shell. @default 'app' */
  surface?: 'app' | 'landing' | 'bare';
  className?: string;
  style?: React.CSSProperties;
}

/** A pull request with no task on the board, with an action to add one. */
export const UnlinkedPRChip: React.FC<UnlinkedPRChipProps> = ({
  pr = 'PR #44',
  onAdd,
  addLabel = 'Add task',
  surface = 'app',
  className,
  style,
}) => (
  <span
    style={style}
    className={['gt-asst-unlinked', `gt-asst-unlinked--${surface}`, className]
      .filter(Boolean)
      .join(' ')}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2.5" />
      <path d="M6 9v6a3 3 0 003 3h6M18 15V9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
    <b>{pr}</b> isn&apos;t on the board ·
    <button type="button" className="gt-asst__link" onClick={onAdd}>
      {addLabel}
    </button>
  </span>
);
