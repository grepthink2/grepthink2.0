import React from 'react';

/**
 * Underline tabs (Details / Team pattern from EditProjectModal).
 * Controlled: pass `value` + `onChange`.
 */
export function Tabs({ tabs = [], value, onChange, className = '' }) {
  return (
    <div className={['gt-tabs', className].filter(Boolean).join(' ')} role="tablist">
      {tabs.map((tab) => {
        const active = value === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={['gt-tabs__tab', active ? 'gt-tabs__tab--active' : ''].filter(Boolean).join(' ')}
            onClick={() => onChange && onChange(tab.value)}
            disabled={tab.disabled}
          >
            {tab.icon && <span className="gt-tabs__icon">{tab.icon}</span>}
            {tab.label}
            {tab.count != null && <span className="gt-tabs__count">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
