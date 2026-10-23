Date (and optional time) field with a calendar dialog — the codebase's `DatePickerField` API, string values. WAI-ARIA: Date Picker Dialog pattern (button → modal dialog with a date grid).

```jsx
<DatePickerField label="Due date" value={due} onChange={setDue} disabledBefore={new Date()} required error={errors.due} />
<DatePickerField label="Review slot" showTime value={slot} onChange={setSlot} helperText="Your time (PT)" />
```

- Values: `'yyyy-MM-dd'`, `'yyyy-MM-dd HH:mm'` or `''` — strings, so a date-only value never shifts across time zones. `parseDateValue()` reads them.
- Trigger: a 40px field-look button (44 on phones), `aria-haspopup="dialog"`, `aria-expanded`, named by the label **and** the chosen value through `aria-labelledby` ("Due date, Oct 20, 2026"; "required" is appended for required fields). The codebase's `aria-label="Pick {label}"` hid the value — replace it.
- Calendar: portaled to `<body>` at `--gt-z-picker` (1100, above modals at 100 and toasts at 1000), 6px below the trigger, flipped above when it does not fit, kept 8px inside the viewport. Modal: focus moves to the selected day (or today), Tab cycles inside.
- Keys in the grid: ← → day, ↑ ↓ week, Home / End week start / end, PageUp / PageDown month (Shift: year), Enter / Space pick. Esc closes and returns focus to the trigger (captured, so an enclosing Modal stays open). Outside click closes.
- Days: 36px (44 on phones, as are the month arrows); selected solid green, its name ending ", selected"; today a green inset ring + `aria-current="date"`; out-of-range days `aria-disabled` in gray-400 (still reachable by arrows, not pickable). The weekday header is a table row (`table-cell`), so the columns line up with the days.
- `showTime`: picking a day keeps the dialog open; a labelled "Time" input (15-minute steps, 08:00 until a time is chosen) and **Cancel** (outline) / **Done** (primary) commit `'yyyy-MM-dd HH:mm'`.
