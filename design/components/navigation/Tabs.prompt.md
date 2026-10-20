Switch between panels of **different content**. WAI-ARIA: Tabs pattern (tablist / tab / tabpanel, roving tabindex).

```jsx
const [tab, setTab] = useState('details');
<Tabs idBase="ep" ariaLabel="Edit project" value={tab} onChange={setTab} collapseOnPhone
  tabs={[{ value: 'details', label: 'Details', icon: <FileText size={16} /> }, { value: 'team', label: 'Team', icon: <Users size={16} />, count: 5 }, { value: 'meetings', label: 'Meetings', icon: <CalendarDays size={16} /> }]} />
<TabPanel idBase="ep" value="details" active={tab === 'details'}>…</TabPanel>
```

Look (decided): the grey segmented track — `--gt-gray-100`, 4px padding, radius 7; tabs stretch equally (`flex: 1`), 36px, 13px/500 tertiary; the active tab is white with `0 1px 2px rgba(0,0,0,.06)` and primary text at 600. Counts are a neutral CountBadge on the track. `size="sm"` (28px) for editor bars.

Keyboard: Tab enters on the selected tab; ← → move (wrapping), Home / End jump; automatic activation selects as focus moves; `activation="manual"` (panels that fetch) selects on Enter / Space. Tab from the strip goes into the panel (`tabIndex=0` when its content starts without a focusable element).

At the top of a modal body: in Edit Project the strip sits under the title in the form header (Modal `tabs` slot). Phones: 44px tabs; `collapseOnPhone` hides labels visually when tabs have icons — never `display: none`, so the name survives.

Choosing: **Tabs** switch panels of different content · **SegmentedControl** switches the view or unit of the same content (Table / Cards, Tasks / Points) · **FilterChip** narrows a list. A course filter is FilterChips, not a tablist.
