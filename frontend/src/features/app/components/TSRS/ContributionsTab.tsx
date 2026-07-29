import React from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import { AlertCircle } from 'lucide-react';
import type { TeamMember, ContributionMap } from './tsrsTypes';
import './ContributionsTab.scss';

// Chart palette (Recharts `Cell` fills) predates the --gt-* design-token
// system. Some values happen to match a --gt-* token exactly; others (the
// violet/pink tail) don't, since a multi-member pie needs more distinct hues
// than the token set provides. Left as-is rather than churned as a side
// effect of wiring the adherence lint.
const CHART_COLORS = ['#018156', '#2771FF', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

interface ContributionsTabProps {
  members: TeamMember[];
  contributions: ContributionMap;
  onContributionChange: (c: ContributionMap) => void;
  onNext: () => void;
  error?: string | null;
}

/**
 * When total would exceed 100% (or we're at 100% and one member increases),
 * give the changed member `newVal` and distribute the remaining (100 - newVal)
 * among the others in proportion to their current contributions, so relative
 * shares are preserved. If others sum to 0, split remaining equally.
 */
function redistributeProportionally(
  contributions: ContributionMap,
  members: TeamMember[],
  changedId: string,
  newVal: number,
): ContributionMap {
  const cappedVal = Math.min(newVal, 100);
  const remaining = 100 - cappedVal;
  const otherIds = members.map((m) => m.id).filter((id) => id !== changedId);

  const othersTotal = otherIds.reduce((s, id) => s + (contributions[id] ?? 0), 0);
  const next: ContributionMap = { [changedId]: cappedVal };

  if (othersTotal === 0) {
    const perPerson = Math.floor(remaining / otherIds.length);
    let extras = remaining - perPerson * otherIds.length;
    for (const id of otherIds) {
      next[id] = perPerson + (extras > 0 ? 1 : 0);
      if (extras > 0) extras--;
    }
    return next;
  }

  // Assign each other their proportional share of remaining; fix rounding so sum = remaining.
  const raw: { id: string; val: number }[] = otherIds.map((id) => ({
    id,
    val: Math.round((remaining * (contributions[id] ?? 0)) / othersTotal),
  }));
  let sum = raw.reduce((s, r) => s + r.val, 0);
  let diff = remaining - sum;
  // Hand out rounding remainder: when diff > 0 add 1 to members (prioritize larger current share); when diff < 0 subtract 1 (prioritize smaller).
  const sorted =
    diff > 0
      ? [...raw].sort((a, b) => (contributions[b.id] ?? 0) - (contributions[a.id] ?? 0))
      : [...raw].sort((a, b) => (contributions[a.id] ?? 0) - (contributions[b.id] ?? 0));
  let i = 0;
  while (diff > 0 && i < sorted.length) {
    const r = sorted[i];
    if (r.val < 100) {
      r.val += 1;
      diff--;
    }
    i++;
  }
  i = 0;
  while (diff < 0 && i < sorted.length) {
    const r = sorted[i];
    if (r.val > 0) {
      r.val -= 1;
      diff++;
    }
    i++;
  }
  raw.forEach(({ id, val }) => {
    next[id] = Math.max(0, Math.min(100, val));
  });
  return next;
}

const ContributionsTab: React.FC<ContributionsTabProps> = ({
  members,
  contributions,
  onContributionChange,
  onNext,
  error,
}) => {
  // Local display value per member while editing (allows empty, backspace, 3 digits max)
  const [inputDisplay, setInputDisplay] = React.useState<Record<string, string>>({});
  // Track the last slider value to detect increases even during fast dragging
  const lastSliderValue = React.useRef<Record<string, number>>({});

  /** Sync number input displays to a new contribution map (e.g. after redistribution). Skip the input being edited (skipId). */
  const syncInputDisplay = (nextContributions: ContributionMap, skipId: string | null) => {
    setInputDisplay((prev) => {
      const next = { ...prev };
      members.forEach((m) => {
        if (m.id === skipId) return;
        next[m.id] = String(nextContributions[m.id] ?? 0);
      });
      return next;
    });
  };

  const handleSlider = (id: string, val: number) => {
    const currentTotal = Object.values(contributions).reduce((s, v) => s + v, 0);
    const prevVal = lastSliderValue.current[id] ?? contributions[id] ?? 0;
    
    // If total is 100% and trying to increase, block it
    if (currentTotal >= 100 && val > prevVal) {
      return;
    }
    
    lastSliderValue.current[id] = val;
    const actualPrevVal = contributions[id] ?? 0;
    const newTotal = currentTotal - actualPrevVal + val;
    const wouldExceed = newTotal > 100;
    if (wouldExceed) {
      const next = redistributeProportionally(contributions, members, id, val);
      onContributionChange(next);
      syncInputDisplay(next, null);
    } else {
      onContributionChange({ ...contributions, [id]: val });
      setInputDisplay((prev) => ({ ...prev, [id]: String(val) }));
    }
  };

  const getInputValue = (id: string) =>
    inputDisplay[id] !== undefined ? inputDisplay[id] : String(contributions[id] ?? 0);

  const handleNumberChange = (id: string, raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '');
    const truncated = digitsOnly.slice(0, 3);
    setInputDisplay((prev) => ({ ...prev, [id]: truncated }));
    if (truncated === '') return;
    const n = parseInt(truncated, 10);
    if (isNaN(n)) return;
    const val = Math.min(n, 100);
    const currentTotal = Object.values(contributions).reduce((s, v) => s + v, 0);
    const prevVal = contributions[id] ?? 0;
    const newTotal = currentTotal - prevVal + val;
    const wouldExceed = newTotal > 100;
    if (wouldExceed || (currentTotal === 100 && val > prevVal)) {
      const next = redistributeProportionally(contributions, members, id, val);
      onContributionChange(next);
      syncInputDisplay(next, id);
    } else {
      onContributionChange({ ...contributions, [id]: val });
    }
  };

  const handleNumberFocus = (id: string) => {
    setInputDisplay((prev) => ({
      ...prev,
      [id]: prev[id] !== undefined ? prev[id] : String(contributions[id] ?? 0),
    }));
  };

  const handleNumberBlur = (id: string) => {
    const raw = inputDisplay[id] !== undefined ? inputDisplay[id] : String(contributions[id] ?? 0);
    const n = raw === '' ? 0 : Math.min(Math.max(parseInt(raw, 10) || 0, 0), 100);
    setInputDisplay((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const currentTotal = Object.values(contributions).reduce((s, v) => s + v, 0);
    const prevVal = contributions[id] ?? 0;
    const newTotal = currentTotal - prevVal + n;
    const wouldExceed = newTotal > 100;
    if (wouldExceed || (currentTotal === 100 && n > prevVal)) {
      const next = redistributeProportionally(contributions, members, id, n);
      onContributionChange(next);
      syncInputDisplay(next, null);
    } else {
      onContributionChange({ ...contributions, [id]: n });
    }
  };

  const total = Object.values(contributions).reduce((sum, v) => sum + v, 0);

  const pieData = members.map((m) => ({
    name: m.name,
    value: contributions[m.id] ?? 0,
  }));

  // Show remaining % needed as a hint inside the left panel
  const remaining = 100 - total;

  return (
    <div className="contributions-tab">
      <div className="contributions-tab__content">
      {/* ── Left: Sliders ── */}
      <div className="contributions-tab__left">
        <div className="contributions-tab__section-header">
          <h3 className="contributions-tab__title">Team Distribution</h3>
          <p className="contributions-tab__subtitle">Allocate 100% across all members</p>
        </div>

        <div className="contributions-tab__sliders">
          {members.map((member, i) => {
            const currentVal = contributions[member.id] ?? 0;
            
            return (
              <div className="contributions-tab__member" key={member.id}>
                <div className="contributions-tab__member-name">
                  {member.name}
                  {member.isCurrentUser && (
                    <span className="contributions-tab__you-label"> (You)</span>
                  )}
                </div>
                <div className="contributions-tab__slider-row">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={currentVal}
                    onChange={(e) => handleSlider(member.id, Number(e.target.value))}
                    className="contributions-tab__slider"
                    style={{ '--thumb-color': CHART_COLORS[i % CHART_COLORS.length] } as React.CSSProperties}
                  />
                  <div className="contributions-tab__input-group">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={getInputValue(member.id)}
                      onChange={(e) => handleNumberChange(member.id, e.target.value)}
                      onFocus={() => handleNumberFocus(member.id)}
                      onBlur={() => handleNumberBlur(member.id)}
                      className="contributions-tab__number-input"
                      aria-label={`${member.name} contribution percent`}
                    />
                    <span className="contributions-tab__percent">%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Remaining / error indicator */}
        {error ? (
          <div className="contributions-tab__error">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        ) : remaining !== 0 ? (
          <div className="contributions-tab__remaining">
            {remaining > 0
              ? `${remaining}% remaining to allocate`
              : `${Math.abs(remaining)}% over — reduce some members`}
          </div>
        ) : null}
      </div>

      {/* ── Right: Pie Chart ── */}
      <div className="contributions-tab__right">
        <div className="contributions-tab__section-header">
          <h3 className="contributions-tab__title">Contribution Breakdown</h3>
          <p className="contributions-tab__subtitle">
            Visual representation of team member contributions for this reporting period.
          </p>
        </div>

        <div className="contributions-tab__chart-wrapper">
          <PieChart width={260} height={260}>
            <Pie
              data={pieData}
              cx={130}
              cy={130}
              outerRadius={120}
              dataKey="value"
              labelLine={false}
            >
              {pieData.map((_, idx) => (
                <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </div>

        <div className="contributions-tab__legend">
          {members.map((member, i) => (
            <div key={member.id} className="contributions-tab__legend-item">
              <div className="contributions-tab__legend-left">
                <span
                  className="contributions-tab__legend-dot"
                  style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="contributions-tab__legend-name">{member.name}</span>
              </div>
              <span className="contributions-tab__legend-pct">
                {(contributions[member.id] ?? 0).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      </div>

      <div className="contributions-tab__footer">
        <button
          type="button"
          className="tsrs-btn tsrs-btn--primary"
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default ContributionsTab;
