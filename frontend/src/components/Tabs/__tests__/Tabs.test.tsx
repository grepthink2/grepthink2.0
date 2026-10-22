import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Users } from 'lucide-react';
import { cssRules } from '@/test/cssRules';
import { TabPanel, Tabs, type TabItem } from '../Tabs';

const SECTIONS: TabItem[] = [
  { value: 'details', label: 'Details' },
  { value: 'team', label: 'Team', icon: <Users size={16} aria-hidden="true" /> },
  { value: 'archived', label: 'Archived', disabled: true },
  { value: 'meetings', label: 'Meetings' },
];

interface SectionsProps {
  initial?: string;
  activation?: 'automatic' | 'manual';
  onChange?: (value: string) => void;
  /** Keep the parent's value whatever the tabs report. @default false */
  frozen?: boolean;
}

/** Tabs over three panels sharing the idBase "ep", then a button after them. */
function Sections({ initial = 'details', activation, onChange, frozen = false }: SectionsProps) {
  const [tab, setTab] = useState(initial);
  return (
    <>
      <Tabs
        idBase="ep"
        ariaLabel="Edit project sections"
        tabs={SECTIONS}
        value={tab}
        activation={activation}
        onChange={(v) => {
          onChange?.(v);
          if (!frozen) setTab(v);
        }}
      />
      <TabPanel idBase="ep" value="details" active={tab === 'details'}>Details panel</TabPanel>
      <TabPanel idBase="ep" value="team" active={tab === 'team'}>Team panel</TabPanel>
      <TabPanel idBase="ep" value="meetings" active={tab === 'meetings'}>Meetings panel</TabPanel>
      <button type="button">After</button>
    </>
  );
}

const tab = (name: string) => screen.getByRole('tab', { name });
/** A panel by its id: a hidden panel has no accessible name to find it by. */
const panel = (id: string) => document.getElementById(id)!;
const selected = () => screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true').map((t) => t.textContent);

describe('Tabs', () => {
  it('tabs are linked to panels', () => {
    render(<Sections />);
    const list = screen.getByRole('tablist', { name: 'Edit project sections' });
    expect(list).toHaveClass('gt-tabs');
    expect(within(list).getAllByRole('tab')).toHaveLength(4);
    expect(tab('Details')).toHaveAttribute('id', 'ep-tab-details');
    expect(tab('Details')).toHaveAttribute('aria-controls', 'ep-panel-details');
    expect(tab('Details')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Details')).toHaveClass('gt-tabs__tab', 'gt-tabs__tab--active');
    expect(tab('Team')).toHaveAttribute('aria-selected', 'false');
    expect(tab('Team')).not.toHaveClass('gt-tabs__tab--active');

    const details = screen.getByRole('tabpanel', { name: 'Details' });
    expect(details).toHaveAttribute('id', 'ep-panel-details');
    expect(details).toHaveAttribute('aria-labelledby', 'ep-tab-details');
    expect(details).toHaveClass('gt-tabs__panel');
    expect(details).toHaveTextContent('Details panel');
    // The other panels stay in the DOM, hidden and empty.
    const team = panel('ep-panel-team');
    expect(team).toHaveAttribute('role', 'tabpanel');
    expect(team).toHaveAttribute('aria-labelledby', 'ep-tab-team');
    expect(team).not.toBeVisible();
    expect(team).toBeEmptyDOMElement();
  });

  it('a click selects a tab, and a click on the selected one reports nothing', async () => {
    const onChange = vi.fn();
    render(<Sections onChange={onChange} />);
    await userEvent.click(tab('Details'));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(tab('Team'));
    expect(onChange).toHaveBeenCalledWith('team');
    expect(selected()).toEqual(['Team']);
    expect(screen.getByRole('tabpanel', { name: 'Team' })).toHaveTextContent('Team panel');
    expect(panel('ep-panel-details')).not.toBeVisible();
  });

  it('ArrowRight moves and activates per the export', async () => {
    const onChange = vi.fn();
    render(<Sections onChange={onChange} />);
    await userEvent.tab();
    expect(tab('Details')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Team')).toHaveFocus();
    expect(selected()).toEqual(['Team']);
    expect(screen.getByRole('tabpanel', { name: 'Team' })).toBeVisible();
    // The disabled tab is passed over, and the last wraps to the first.
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Meetings')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Details')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab('Meetings')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(tab('Details')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(tab('Meetings')).toHaveFocus();
    expect(selected()).toEqual(['Meetings']);
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['team', 'meetings', 'details', 'meetings', 'details', 'meetings']);
    // Up and down belong to the page.
    expect(fireEvent.keyDown(tab('Meetings'), { key: 'ArrowDown' })).toBe(true);
  });

  it('manual activation moves focus without selecting, and Enter or Space selects', async () => {
    const onChange = vi.fn();
    render(<Sections activation="manual" onChange={onChange} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Team')).toHaveFocus();
    expect(selected()).toEqual(['Details']);
    expect(onChange).not.toHaveBeenCalled();
    // The tab stop stays on the selected tab while focus looks around.
    expect(tab('Details')).toHaveAttribute('tabindex', '0');
    expect(tab('Team')).toHaveAttribute('tabindex', '-1');
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('team');
    expect(selected()).toEqual(['Team']);
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Meetings')).toHaveFocus();
    expect(selected()).toEqual(['Team']);
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('meetings');
    expect(selected()).toEqual(['Meetings']);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('a disabled tab is skipped', async () => {
    const onChange = vi.fn();
    render(<Sections initial="team" onChange={onChange} />);
    const archived = tab('Archived');
    expect(archived).toBeDisabled();
    await userEvent.click(archived);
    expect(onChange).not.toHaveBeenCalled();
    tab('Team').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Meetings')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab('Team')).toHaveFocus();
    expect(cssRules('.gt-tabs__tab:disabled')[0].getPropertyValue('opacity')).toBe('var(--gt-opacity-disabled)');
  });

  it('the tab stop is the selected tab, and Tab moves on into its panel', async () => {
    render(<Sections initial="meetings" />);
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0']);
    await userEvent.tab();
    expect(tab('Meetings')).toHaveFocus();
    await userEvent.tab();
    // Its content starts with nothing focusable, so the panel itself is the next stop.
    expect(screen.getByRole('tabpanel', { name: 'Meetings' })).toHaveFocus();
    expect(panel('ep-panel-details')).not.toHaveAttribute('tabindex');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('an arrow back onto the selected tab reports nothing, when the parent kept its value', async () => {
    const onChange = vi.fn();
    render(<Sections onChange={onChange} frozen />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(tab('Team')).toHaveFocus();
    expect(selected()).toEqual(['Details']);
    await userEvent.keyboard('{ArrowLeft}');
    expect(tab('Details')).toHaveFocus();
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['team']);
  });

  it('the count renders', () => {
    render(
      <Tabs
        ariaLabel="Requests"
        value="incoming"
        tabs={[
          { value: 'incoming', label: 'Incoming', count: 3, countLabel: '3 incoming requests' },
          { value: 'outgoing', label: 'Outgoing', count: 0 },
          { value: 'team', label: 'Team', count: 5 },
          { value: 'archive', label: 'Archive' },
        ]}
      />,
    );
    // A count is a neutral CountBadge, apart from the label in the name.
    expect(tab('Team 5').querySelector('.gt-count')).toHaveTextContent('5');
    // Apart in the text too, not only where the browser adds a space between flex items.
    expect(tab('Team 5')).toHaveTextContent('Team 5');
    expect(tab('Outgoing 0').querySelector('.gt-count')).toHaveTextContent('0');
    expect(tab('Incoming 3 incoming requests')).toBeInTheDocument();
    expect(tab('Archive').querySelector('.gt-count')).toBeNull();
    expect(cssRules('.gt-tabs__tab .gt-count')[0].getPropertyValue('background')).toBe('var(--gt-gray-200)');
    expect(cssRules('.gt-tabs__tab--active .gt-count')[0].getPropertyValue('background')).toBe('var(--gt-gray-100)');
  });

  it('keepMounted hides the inactive panel without unmounting it', async () => {
    function Editor() {
      const [section, setSection] = useState('meetings');
      return (
        <>
          <Tabs idBase="ed" ariaLabel="Editor" value={section} onChange={setSection} tabs={[{ value: 'details', label: 'Details' }, { value: 'meetings', label: 'Meetings' }]} />
          <TabPanel idBase="ed" value="details" active={section === 'details'}>
            <input aria-label="Name" defaultValue="" />
          </TabPanel>
          <TabPanel idBase="ed" value="meetings" active={section === 'meetings'} keepMounted>
            <input aria-label="Draft" defaultValue="" />
          </TabPanel>
        </>
      );
    }
    render(<Editor />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Draft' }), 'Retro');
    const draft = screen.getByRole('textbox', { name: 'Draft' });
    await userEvent.click(tab('Details'));
    // Still mounted, the same element, out of sight and out of the accessibility tree.
    expect(panel('ed-panel-meetings')).not.toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Draft' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Draft', hidden: true })).toBe(draft);
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Alpha');
    await userEvent.click(tab('Meetings'));
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveValue('Retro');
    // A panel without keepMounted unmounts its content: its typed name is gone.
    await userEvent.click(tab('Details'));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('');
  });

  it('a panel whose content starts with a control is not a tab stop of its own', () => {
    render(
      <>
        <Tabs idBase="f" ariaLabel="Form" value="a" tabs={[{ value: 'a', label: 'A' }]} />
        <TabPanel idBase="f" value="a" active focusable={false}><input aria-label="First" /></TabPanel>
      </>,
    );
    expect(screen.getByRole('tabpanel', { name: 'A' })).not.toHaveAttribute('tabindex');
  });

  it('makes its own ids without idBase, and then links no panel', () => {
    render(<Tabs ariaLabel="Views" value="a" tabs={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
    const [a, b] = screen.getAllByRole('tab');
    expect(a.id).toMatch(/-tab-a$/);
    expect(b.id).toMatch(/-tab-b$/);
    expect(a.id).not.toBe('-tab-a');
    expect(a).not.toHaveAttribute('aria-controls');
  });

  it('draws icons, hidden from assistive tech, and collapses them to the icon on phones', () => {
    const { container, rerender } = render(<Sections />);
    const icon = tab('Team').querySelector('.gt-tabs__icon')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(tab('Team')).toHaveClass('gt-tabs__tab--has-icon');
    expect(tab('Details')).not.toHaveClass('gt-tabs__tab--has-icon');
    expect(screen.getByText('Team')).toHaveClass('gt-tabs__label');
    expect(container.querySelector('.gt-tabs')).not.toHaveClass('gt-tabs--collapse');
    rerender(<Tabs collapseOnPhone ariaLabel="Edit project" value="team" tabs={SECTIONS} />);
    expect(screen.getByRole('tablist')).toHaveClass('gt-tabs--collapse');
    // The label leaves the screen on phones, not the accessible name: never display none.
    const [collapsed] = cssRules('.gt-tabs--collapse .gt-tabs__tab--has-icon .gt-tabs__label', 'max-width: 767px');
    expect(collapsed.getPropertyValue('position')).toBe('absolute');
    expect(collapsed.getPropertyValue('clip-path')).toBe('inset(50%)');
    expect(collapsed.getPropertyValue('display')).toBe('');
    expect(cssRules('.gt-tabs__tab', 'max-width: 767px')[0].getPropertyValue('min-height')).toBe('44px');
    // sm tabs too: their size rule (two classes) would outrank the one-class phone rule.
    expect(cssRules('.gt-tabs--sm .gt-tabs__tab', 'max-width: 767px')[0].getPropertyValue('min-height')).toBe('44px');
  });

  it('is md by default and sm on request', () => {
    const { rerender } = render(<Tabs ariaLabel="Mode" value="write" tabs={[{ value: 'write', label: 'Write' }]} />);
    expect(screen.getByRole('tablist')).not.toHaveClass('gt-tabs--sm');
    rerender(<Tabs size="sm" ariaLabel="Mode" value="write" tabs={[{ value: 'write', label: 'Write' }]} />);
    expect(screen.getByRole('tablist')).toHaveClass('gt-tabs', 'gt-tabs--sm');
    expect(cssRules('.gt-tabs--sm .gt-tabs__tab')[0].getPropertyValue('min-height')).toBe('28px');
  });

  it('passes className, native props and ref, and keeps the roles, ids and names it sets to itself', () => {
    const listRef = createRef<HTMLDivElement>();
    const panelRef = createRef<HTMLDivElement>();
    render(
      <>
        <Tabs ariaLabel="Views" value="a" tabs={[{ value: 'a', label: 'A' }]} className="x" data-key="t" ref={listRef} />
        <TabPanel idBase="v" value="a" active className="y" data-key="p" ref={panelRef}>Body</TabPanel>
      </>,
    );
    expect(listRef.current).toBe(screen.getByRole('tablist'));
    expect(listRef.current).toHaveClass('gt-tabs', 'x');
    expect(listRef.current).toHaveAttribute('data-key', 't');
    expect(panelRef.current).toBe(screen.getByRole('tabpanel'));
    expect(panelRef.current).toHaveClass('gt-tabs__panel', 'y');
    expect(panelRef.current).toHaveAttribute('data-key', 'p');

    // @ts-expect-error: the strip is a tablist
    const roled = <Tabs role="toolbar" value="a" tabs={[]} />;
    // @ts-expect-error: the name comes from ariaLabel
    const named = <Tabs aria-label="Other" value="a" tabs={[]} />;
    // @ts-expect-error: the panel is a tabpanel
    const panelRole = <TabPanel role="region" idBase="v" value="a" />;
    // @ts-expect-error: idBase and value make the panel's id
    const panelId = <TabPanel id="x" idBase="v" value="a" />;
    // @ts-expect-error: its tab labels the panel
    const labelled = <TabPanel aria-labelledby="x" idBase="v" value="a" />;
    // @ts-expect-error: active decides hidden
    const hidden = <TabPanel hidden idBase="v" value="a" />;
    // @ts-expect-error: active and focusable decide the tab stop
    const stop = <TabPanel tabIndex={-1} idBase="v" value="a" />;
    expect([roled, named, panelRole, panelId, labelled, hidden, stop]).toHaveLength(7);
  });

  it('types the values by the tabs it is given', () => {
    const onChange = (value: 'a' | 'b') => value;
    const typed = <Tabs<'a' | 'b'> value="a" onChange={onChange} tabs={[{ value: 'a', label: 'A' }]} />;
    // @ts-expect-error: a value the tabs do not hold
    const wrong = <Tabs<'a' | 'b'> value="c" tabs={[{ value: 'a', label: 'A' }]} />;
    expect([typed, wrong]).toHaveLength(2);
  });

  it('ports the track and its tabs, and sets what the global button rule would', () => {
    render(<Sections />);
    const [track] = cssRules('.gt-tabs');
    expect(track.getPropertyValue('background')).toBe('var(--gt-gray-100)');
    expect(track.getPropertyValue('padding')).toBe('4px');
    expect(track.getPropertyValue('box-sizing')).toBe('border-box');
    const [tabRule] = cssRules('.gt-tabs__tab');
    expect(tabRule.getPropertyValue('flex')).toBe('1 1 0px');
    expect(tabRule.getPropertyValue('min-height')).toBe('36px');
    expect(tabRule.getPropertyValue('box-sizing')).toBe('border-box');
    expect(tabRule.getPropertyValue('padding')).toBe('6px 12px');
    expect(tabRule.getPropertyValue('border-style')).toBe('none');
    expect(tabRule.getPropertyValue('border-radius')).toBe('6px');
    expect(tabRule.getPropertyValue('background')).toBe('transparent');
    expect(tabRule.getPropertyValue('font-size')).toBe('13px');
    expect(tabRule.getPropertyValue('font-weight')).toBe('var(--gt-weight-medium)');
    expect(tabRule.getPropertyValue('color')).toBe('var(--gt-text-tertiary)');
    expect(tabRule.getPropertyValue('transition')).toContain('background-color');
    const [active] = cssRules('.gt-tabs__tab--active');
    expect(active.getPropertyValue('font-weight')).toBe('var(--gt-weight-semibold)');
    expect(active.getPropertyValue('color')).toBe('var(--gt-text-primary)');
    expect(cssRules('.gt-tabs__tab:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
    expect(cssRules('.gt-tabs__panel:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
    expect(cssRules('.gt-tabs__tab', 'prefers-reduced-motion')[0].getPropertyValue('transition')).toBe('none');
  });
});
