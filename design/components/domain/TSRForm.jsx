import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Textarea } from '../primitives/Textarea.jsx';

/**
 * TSR (Team Status Report) form — one section per teammate:
 * percent-contribution input + positive & constructive feedback,
 * plus an optional scrum-master notes block.
 * Controlled via `entries` + `onChange`.
 */
export function TSRForm({
  entries = [],
  onChange,
  showScrumNotes = false,
  scrumNotes = '',
  onScrumNotesChange,
  totalWarning = true,
  className = '',
}) {
  const total = entries.reduce((s, e) => s + (Number(e.percent) || 0), 0);
  const update = (i, patch) => {
    if (!onChange) return;
    const next = entries.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  return (
    <div className={['gt-tsr-form', className].filter(Boolean).join(' ')}>
      <div className="gt-tsr-form__total" data-over={total !== 100 && totalWarning ? 'true' : undefined}>
        <span>Total contribution</span>
        <strong>{total}%</strong>
        {totalWarning && total !== 100 && <em>must equal 100%</em>}
      </div>
      {entries.map((entry, i) => (
        <section key={entry.name} className="gt-tsr-form__member">
          <div className="gt-tsr-form__member-head">
            <Avatar name={entry.name} size="md" />
            <div className="gt-tsr-form__member-id">
              <span className="gt-tsr-form__member-name">{entry.name}</span>
              {entry.role && <span className="gt-tsr-form__member-role">{entry.role}</span>}
            </div>
            <label className="gt-tsr-form__pct">
              <input
                type="number"
                min="0"
                max="100"
                className="gt-tsr-form__pct-input"
                value={entry.percent}
                onChange={(e) => update(i, { percent: e.target.value })}
                aria-label={`Percent contribution for ${entry.name}`}
              />
              <span className="gt-tsr-form__pct-sign">%</span>
            </label>
          </div>
          <div className="gt-tsr-form__feedback">
            <Textarea
              label="What went well?"
              placeholder="Positive feedback…"
              rows={2}
              value={entry.positive || ''}
              onChange={(e) => update(i, { positive: e.target.value })}
            />
            <Textarea
              label="What could improve?"
              placeholder="Constructive feedback…"
              rows={2}
              value={entry.constructive || ''}
              onChange={(e) => update(i, { constructive: e.target.value })}
            />
          </div>
        </section>
      ))}
      {showScrumNotes && (
        <section className="gt-tsr-form__scrum">
          <Textarea
            label="Scrum master notes"
            placeholder="Sprint summary, blockers, decisions…"
            rows={3}
            value={scrumNotes}
            onChange={(e) => onScrumNotesChange && onScrumNotesChange(e.target.value)}
          />
        </section>
      )}
    </div>
  );
}
