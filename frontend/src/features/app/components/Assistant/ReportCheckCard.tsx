import React from 'react';
import { Check } from 'lucide-react';
import type { AssistantSurface } from './AssistantSuggestionCard';
import './Assistant.scss';

export interface ReportCheckRow {
  /** 'match' = the reports agree with closed work; 'review' = worth a look. @default 'match' */
  kind?: 'match' | 'review';
  /** Neutral numbers, not judgments: "Alex: reports 35%, closed 1 of 6 tasks". */
  text: React.ReactNode;
  onReview?: () => void;
}

export interface ReportCheckCardProps {
  /** @default 'Week 5' */
  week?: string;
  project?: string;
  rows: ReportCheckRow[];
  /** @default 'app' */
  surface?: AssistantSurface;
  className?: string;
  style?: React.CSSProperties;
}

/** Lucide has no bare exclamation mark; this one matches its stroke idiom. */
const Bang: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/**
 * Staff only (TAs and instructors): a week's status reports set against the tasks and PRs each
 * student closed. Rows that line up get a green check; the rest get an amber mark and "Review".
 * It starts a conversation, it doesn't grade.
 */
export const ReportCheckCard: React.FC<ReportCheckCardProps> = ({
  week = 'Week 5',
  project,
  rows,
  surface = 'app',
  className,
  style,
}) => (
  <div
    style={style}
    className={['gt-asst', 'gt-asst-report', `gt-asst--${surface}`, className]
      .filter(Boolean)
      .join(' ')}
    role="group"
    aria-label={`${week} status reports`}
  >
    <div className="gt-asst__head">
      <span className="gt-asst__title">{week} status reports</span>
      {project && <span className="gt-asst__time">{project}</span>}
    </div>
    <ul className="gt-asst-report__rows">
      {rows.map(({ kind = 'match', text, onReview }, i) => (
        <li key={i} className={`gt-asst-report__row gt-asst-report__row--${kind}`}>
          <span
            className={`gt-asst-report__mark gt-asst-report__mark--${kind}`}
            aria-hidden="true"
          >
            {kind === 'review' ? <Bang /> : <Check size={11} strokeWidth={3} />}
          </span>
          <span className="gt-asst-report__text">{text}</span>
          {kind === 'review' && (
            <button type="button" className="gt-asst-report__review" onClick={onReview}>
              Review
            </button>
          )}
        </li>
      ))}
    </ul>
  </div>
);
