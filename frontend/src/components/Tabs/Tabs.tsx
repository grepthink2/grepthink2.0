import { useId, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { CountBadge } from '@/components/CountBadge/CountBadge';
import { useRovingFocus } from '@/components/hooks/useRovingFocus';
import './Tabs.scss';

export interface TabItem<V extends string = string> {
  value: V;
  label: string;
  /** A 16px icon before the label (the icon alone on phones, with `collapseOnPhone`). */
  icon?: ReactNode;
  /** A neutral CountBadge on the track (tab counts, list totals). */
  count?: number;
  /** Screen-reader text for the count ("3 pending"). */
  countLabel?: string;
  disabled?: boolean;
}

export interface TabsProps<V extends string = string>
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children' | 'role' | 'aria-label'> {
  tabs: TabItem<V>[];
  value: V;
  onChange?: (value: V) => void;
  /** Names the tablist when no visible heading does ("Edit project sections"). */
  ariaLabel?: string;
  /** Shared with each TabPanel, to link `aria-controls` and `aria-labelledby`. Generated when left out, and then no panel links. */
  idBase?: string;
  /** 'automatic': the arrow keys select (panels that render at once). 'manual': Enter or Space selects (panels that fetch). @default 'automatic' */
  activation?: 'automatic' | 'manual';
  /** sm: 28px tabs, for editor bars. @default 'md' */
  size?: 'sm' | 'md';
  /** Under 768px a tab with an icon shows only the icon; the label stays in its name. @default false */
  collapseOnPhone?: boolean;
  /**
   * Set by the strip: a tablist, named by `ariaLabel`. JSX takes any hyphenated prop a type leaves
   * out, so both are declared `never` rather than only omitted.
   */
  role?: never;
  'aria-label'?: never;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Tabs on the grey segmented track, ported from design/components/navigation/Tabs.jsx, for switching
 * between panels of different content (Edit Project's Details, Team and Meetings). The WAI-ARIA Tabs
 * pattern: a `tablist` of `tab`s, each `aria-selected` and, with `idBase`, linked to the TabPanel
 * that shares it. One tab stop, the selected tab (useRovingFocus): ← and → move between the enabled
 * tabs, wrapping, Home and End go to the first and last. With `activation="automatic"` a tab is
 * selected as focus reaches it; with `"manual"` focus moves alone and Enter or Space selects. Tabs
 * stretch across the track; the selected one is white with primary text at 600. A count is a neutral
 * CountBadge; `collapseOnPhone` shows icon-only tabs under 768px while each label stays in its tab's
 * name.
 *
 * Codebase-side: pressing the selected tab, or an arrow landing back on it, reports no change; a
 * space keeps the count apart from the label in the tab's name; and without `idBase` the tabs carry
 * no `aria-controls`, which would point at no panel. Native props and `ref` reach the tablist.
 */
export function Tabs<V extends string = string>({
  tabs, value, onChange, ariaLabel, idBase, activation = 'automatic', size = 'md', collapseOnPhone = false,
  className = '', ref, ...rest
}: TabsProps<V>) {
  const generated = useId();
  const base = idBase ?? generated;
  const choose = (next: V) => {
    if (next !== value) onChange?.(next);
  };
  const { getItemProps } = useRovingFocus({
    count: tabs.length,
    activeIndex: tabs.findIndex((t) => t.value === value),
    isDisabled: (i) => !!tabs[i].disabled,
    // Automatic tabs select the tab an arrow lands on; manual ones wait for Enter or Space (a click).
    onMove: activation === 'automatic' ? (i) => choose(tabs[i].value) : undefined,
  });
  return (
    <div
      {...rest}
      ref={ref}
      className={['gt-tabs', size === 'sm' ? 'gt-tabs--sm' : '', collapseOnPhone ? 'gt-tabs--collapse' : '', className]
        .filter(Boolean).join(' ')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab, i) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            {...getItemProps(i)}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.value}`}
            aria-controls={idBase ? `${idBase}-panel-${tab.value}` : undefined}
            aria-selected={active}
            className={['gt-tabs__tab', active ? 'gt-tabs__tab--active' : '', tab.icon ? 'gt-tabs__tab--has-icon' : '']
              .filter(Boolean).join(' ')}
            disabled={tab.disabled}
            onClick={() => choose(tab.value)}
          >
            {tab.icon && <span className="gt-tabs__icon" aria-hidden="true">{tab.icon}</span>}
            <span className="gt-tabs__label">{tab.label}</span>
            {tab.count != null && <> <CountBadge count={tab.count} label={tab.countLabel} /></>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'id' | 'hidden' | 'tabIndex' | 'aria-labelledby'> {
  /** The value of the tab that controls it. */
  value: string;
  /** @default false */
  active?: boolean;
  /** The Tabs' `idBase`. */
  idBase: string;
  /** Keeps the content mounted while inactive (hidden), for a panel with unsaved input. @default false */
  keepMounted?: boolean;
  /** The panel joins the tab order, for content that starts with nothing focusable. @default true */
  focusable?: boolean;
  /**
   * Set by the panel from `idBase`, `value`, `active` and `focusable`. JSX takes any hyphenated prop a
   * type leaves out, so these are declared `never` rather than only omitted.
   */
  role?: never;
  id?: never;
  hidden?: never;
  tabIndex?: never;
  'aria-labelledby'?: never;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The panel a tab controls, ported from design/components/navigation/Tabs.jsx: `role="tabpanel"`,
 * labelled by its tab, and in the tab order while active unless `focusable` is false (content that
 * starts with a control of its own). An inactive panel stays in the DOM, `hidden`, and empty unless
 * `keepMounted` keeps its content (and its state) there.
 *
 * Native props and `ref` reach the panel.
 */
export function TabPanel({
  value, active = false, idBase, keepMounted = false, focusable = true, className = '', children, ref, ...rest
}: TabPanelProps) {
  return (
    <div
      {...rest}
      ref={ref}
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
