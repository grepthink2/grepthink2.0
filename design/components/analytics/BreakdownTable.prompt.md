Per-class (or per-team) breakdown table (`.gt-table--breakdown`): sticky header, sortable columns (`useTableSort` idiom), right-aligned `tabular-nums`, 3px meters in percentage cells, "View" per real row, the folded "Smaller groups (n)" row last in italics with a ⓘ "Fewer than 3 people" and no View.

```jsx
<BreakdownTable rows={breakdown.rows} sort={sort} onSort={setSort}
  columns={classId ? TEAM_BREAKDOWN_COLUMNS : BREAKDOWN_COLUMNS}
  onRowView={r => classId ? openBoard(r) : setClassId(r.id)} />
```

Per class: Class · Teams · Students · Team msgs · Stories · Tasks · Pts done % · View. Per team: Team · Members · Team msgs · Stories · Tasks · Pts done % · View. Append `TIMELINESS_COLUMNS` (On time % · Missing) with timeliness. Phones: horizontal scroll inside the card. > 12 rows: 20px dense rows + "Show all (n)". Export CSV sits in the card header.
