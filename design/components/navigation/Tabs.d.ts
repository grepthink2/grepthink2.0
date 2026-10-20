import * as React from 'react';

export interface TabItem {
  value: string;
  label: string;
  /** 16px icon before the label (icon-only on phones with `collapseOnPhone`). */
  icon?: React.ReactNode;
  /** Neutral CountBadge on the track (tab counts, list totals). */
  count?: number;
  /** Screen-reader text for the count ("3 pending"). */
  countLabel?: string;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange?: (value: string) => void;
  /** Names the tablist when no visible heading does ("Edit project sections"). */
  ariaLabel?: string;
  /** Shared with each TabPanel to link `aria-controls` / `aria-labelledby`. Auto-generated if omitted (then panels can't link). */
  idBase?: string;
  /** 'automatic': arrow keys select (panels that render at once). 'manual': Enter / Space select (panels that fetch). @default 'automatic' */
  activation?: 'automatic' | 'manual';
  /** sm = 28px tabs (editor bars). @default 'md' */
  size?: 'sm' | 'md';
  /** Under 768px tabs with an icon show only the icon; the label stays in the accessible name. @default false */
  collapseOnPhone?: boolean;
  className?: string;
}

export interface TabPanelProps {
  value: string;
  active?: boolean;
  idBase: string;
  /** Keep inactive content mounted (hidden) — for panels with unsaved input. @default false */
  keepMounted?: boolean;
  /** Panel joins the tab order when its content has no focusable element first. @default true */
  focusable?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/** Tab strip on the grey segmented track. */
export function Tabs(props: TabsProps): React.JSX.Element;
/** The panel a tab controls. */
export function TabPanel(props: TabPanelProps): React.JSX.Element;
