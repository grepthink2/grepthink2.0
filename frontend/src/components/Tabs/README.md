A tab strip on a grey track for switching between panels of different content (a project's Details, Team and Meetings), each panel a TabPanel.

## Use

```jsx
<Tabs
  idBase="ep"
  ariaLabel="Edit project"
  value={tab}
  onChange={setTab}
  collapseOnPhone
  tabs={[
    { value: 'details', label: 'Details', icon: <FileText size={16} /> },
    { value: 'team', label: 'Team', icon: <Users size={16} />, count: 5 },
    { value: 'meetings', label: 'Meetings', icon: <CalendarDays size={16} /> },
  ]}
/>
<TabPanel idBase="ep" value="details" active={tab === 'details'}>The project's name, description and repository.</TabPanel>
```

## Props that matter

- `tabs`: `{ value, label, icon?, count?, countLabel?, disabled? }`. A count shows as a grey CountBadge; `countLabel` is what a screen reader hears for it ("3 pending").
- `value` and `onChange`, which receives the chosen tab's value.
- `idBase`: shared with each TabPanel, to link every tab to its panel. Without it, no panel is linked.
- `ariaLabel`: names the strip when no visible heading does.
- `activation`, default `automatic` (the arrow keys select, for panels that show at once); `manual` (Enter or Space selects, for panels that load).
- `size`, default `md`; `sm` (28px tabs) for an editor bar.
- `collapseOnPhone`: under 768px a tab with an icon shows only the icon, and keeps its label as its name.

Tabs stretch across the track; the chosen one is white with bold text. The arrow keys move between tabs, and Home and End go to the ends. The bundle also exports the hook behind those keys, `useRovingFocus`, which SegmentedControl and FilterChipGroup share: a group of your own that should move the same way takes it rather than its own key handling.

## The consumer supplies

- The tabs, the chosen value, and a TabPanel for each.

## Do and don't

- Do use Tabs for panels of different content; a SegmentedControl switches the view of the same content, and FilterChips narrow a list.
- Do put a form's tabs in a Modal's `tabs` slot, under its title.
- Don't use Tabs for steps someone must take in order.

## TabPanel

The panel a tab controls, labelled by its tab. An inactive panel stays in the page, hidden and empty unless `keepMounted` keeps its content (and any unsaved input).

```jsx
<TabPanel idBase="ep" value="team" active={tab === 'team'}>Five members. The Product Owner edits meetings.</TabPanel>
```

- `idBase` and `value`, matching its tab; `active`.
- `keepMounted`: keeps the content while hidden.
- `focusable`, default `true`: the panel joins the tab order; pass `false` when its content starts with a control of its own.
