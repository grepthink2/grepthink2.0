A labelled date field (with an optional time) that opens a calendar, storing the date as a plain string so it never shifts across time zones.

## Use

```jsx
<DatePickerField label="Due date" value={due} onChange={setDue} disabledBefore={TERM_STARTS} required />
<DatePickerField label="Review slot" showTime value={slot} onChange={setSlot} helperText="In your time zone." />
```

## Props that matter

- `value` and `onChange`, both required: `'yyyy-MM-dd'` (`'2026-10-09'`), with `showTime` `'yyyy-MM-dd HH:mm'` (`'2026-10-09 15:00'`), or `''` for no date.
- `label`, required: it names the trigger together with the chosen date ("Due date, Oct 9, 2026").
- `showTime`: adds a "Time" input in 15-minute steps and Cancel / Done to the calendar. A day picked before a time gets 8:00 AM.
- `disabledBefore`, `disabledAfter`: `Date`s; days outside them can be reached but not picked.
- `required` is announced with the name, with no visible mark; `optional` shows "(optional)".
- `helperText`, `error`, `placeholder` (default "Select a date", or "Select date & time"), `disabled`.

The trigger looks like a field and opens the calendar as a dialog, above everything, dialogs included. The arrow keys move by day and week, Page Up and Page Down by month (with Shift, by year), Enter picks, and Esc closes it and returns focus to the trigger without closing a dialog around it.

## The consumer supplies

- The label, the value state, and the range of allowed days.
- The zone a time means: the value carries none, so the screen converts it and says which in `helperText` ("In your time zone.").

## Do and don't

- Do keep values as these strings from the API to the field; parse them only to compare.
- Don't pass a `Date` as the value: the field takes and returns strings.
- Don't use a native date input beside it; one date control across the app.
