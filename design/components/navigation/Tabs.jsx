import React from 'react';
import { CountBadge } from '../display/CountBadge.jsx';

/**
 * Tabs on the grey segmented track (Edit Project's Details / Team / Meetings, Requests, the
 * scrum board's Board / Backlog / Burnup, TA meeting tabs, the member manager). WAI-ARIA Tabs:
 * roving tabindex, ← → / Home / End; `activation="automatic"` selects on focus (panels that
 * render at once), `"manual"` waits for Enter / Space (panels that load). Pair each tab with a
 * `<TabPanel>` that shares `idBase`. `collapseOnPhone` shows icon-only tabs under 768px while the
 * label stays in the accessible name.
 */
export function Tabs({
  tabs = [], value, onChange, ariaLabel, idBase, activation = 'automatic', size = 'md', collapseOnPhone = false, className = '',
}) {
  const reactId = React.useId();
  const base = idBase || reactId;
  const refs = React.useRef({});
  const enabled = tabs.filter((t) => !t.disabled);
  const hasSelection = tabs.some((t) => t.value === value && !t.disabled);
  const onKeyDown = (e, tab) => {
    const i = enabled.findIndex((t) => t.value === tab.value);
    let next = null;
    if (e.key === 'ArrowRight') next = enabled[(i + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    else if (activation === 'manual' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (onChange) onChange(tab.value); return; }
    if (!next) return;
    e.preventDefault();
    if (refs.current[next.value]) refs.current[next.value].focus();
    if (activation === 'automatic' && onChange) onChange(next.value);
  };
  return (
    <div
      className={['gt-tabs', size === 'sm' ? 'gt-tabs--sm' : '', collapseOnPhone ? 'gt-tabs--collapse' : '', className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            ref={(el) => { refs.current[tab.value] = el; }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.value}`}
            aria-controls={`${base}-panel-${tab.value}`}
            aria-selected={active}
            tabIndex={active || (!hasSelection && tab === enabled[0]) ? 0 : -1}
            className={['gt-tabs__tab', active ? 'gt-tabs__tab--active' : '', tab.icon ? 'gt-tabs__tab--has-icon' : ''].filter(Boolean).join(' ')}
            onClick={() => onChange && onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, tab)}
            disabled={tab.disabled}
          >
            {tab.icon && <span className="gt-tabs__icon" aria-hidden="true">{tab.icon}</span>}
            <span className="gt-tabs__label">{tab.label}</span>
            {tab.count != null && <CountBadge count={tab.count} label={tab.countLabel} />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The panel a tab controls: `role="tabpanel"`, labelled by its tab, focusable when its content
 * starts with no focusable element. Inactive panels stay in the DOM, empty and `hidden`
 * (`keepMounted` keeps their content).
 */
export function TabPanel({ value, active = false, idBase, keepMounted = false, focusable = true, className = '', children }) {
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      hidden={!active}
      tabIndex={active && focusable ? 0 : undefined}
      className={['gt-tabs__panel', className].filter(Boolean).join(' ')}
    >
      {active || keepMounted ? children : null}
    </div>
  );
}
