The shared searchable picker. WAI-ARIA: Combobox pattern — editable `<input role="combobox">` + `listbox` popup, `aria-activedescendant` (focus never leaves the input), `aria-autocomplete="list"`.

```jsx
<Combobox label="Project" options={projects} value={id} onChange={setId} />
<Combobox label="Skills" multiple max={8} creatable options={skills} value={picked} onChange={setPicked} />
<Combobox label="To" multiple creatable validateCreate={(q) => (/^\S+@\S+\.\S+$/.test(q) ? null : 'Enter a full email address.')} value={emails} onChange={setEmails} />
<Combobox label="Add people" multiple loadOptions={searchPeople} value={ids} onChange={setIds} placeholder="Search by name or email" />
```

Keyboard: ↓ opens and moves to the first option (Alt+↓ opens without moving), ↑ opens on the last; ↑ ↓ move (wrapping, skipping disabled); Enter picks the active option, or the "Add “…”" row when none is active; Esc closes, then clears the typed text; Backspace in an empty input removes the last chip; Tab closes without picking. Home / End move the caret (the pattern's default for an editable combobox). Click in the control opens.

Rows (aligned with the scrum MentionListbox): 36px min (44 on phones), avatar 28 or icon 16, label 12.5 + an 11px tertiary second line, check mark when selected (`aria-selected`). Active row: muted fill + 2px inset accent ring. Groups: an uppercase 10.5 caption heading, `role="group"`. Multi chips are `Tag`s with "Remove {name}". At `max`, other options are disabled under a one-line note.

Async: debounced `loadOptions(query)` with a "Searching…" row (Spinner), "No matches", and an error row that never blocks typing; results keep the last good list while a new query loads. A polite live region says "5 results available" half a second after the list settles.

Replaces: the TSR view's searchable dropdown, the interest form's multi-select and ranked project pickers, the staffing project search, the new-conversation people search, the create-project skills input, the invite modal's email chips. Not for the ⌘K palette (CommandPalette) or the class / school switchers (Menu). Short fixed lists stay a native Select.
