import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Badge } from '../display/Badge.jsx';
import { ProgressBar } from '../display/ProgressBar.jsx';

/**
 * TSR summary card — instructor/TA read view of one submission:
 * submitter, sprint, status, average contribution row per teammate.
 */
export function TSRSummaryCard({
  submitter,
  sprint,
  submittedAt,
  status = 'submitted',
  rows = [],
  onOpen,
  className = '',
}) {
  const tone = status === 'submitted' ? 'success' : status === 'late' ? 'warning' : 'neutral';
  return (
    <div className={['gt-tsr-summary', className].filter(Boolean).join(' ')}>
      <div className="gt-tsr-summary__head">
        <Avatar name={submitter} size="md" />
        <div className="gt-tsr-summary__id">
          <span className="gt-tsr-summary__name">{submitter}</span>
          <span className="gt-tsr-summary__meta">{sprint}{submittedAt ? ` · ${submittedAt}` : ''}</span>
        </div>
        <Badge tone={tone}>{status === 'submitted' ? 'Submitted' : status === 'late' ? 'Late' : 'Missing'}</Badge>
      </div>
      {rows.length > 0 && (
        <div className="gt-tsr-summary__rows">
          {rows.map((r) => (
            <div key={r.name} className="gt-tsr-summary__row">
              <span className="gt-tsr-summary__row-name">{r.name}</span>
              <ProgressBar value={Number(r.percent) || 0} size="sm" />
              <span className="gt-tsr-summary__row-pct">{r.percent}%</span>
            </div>
          ))}
        </div>
      )}
      {onOpen && (
        <button type="button" className="gt-tsr-summary__open" onClick={onOpen}>
          View full report
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
