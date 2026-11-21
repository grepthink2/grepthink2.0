A labelled checkbox for an on-or-off choice that is saved with a form, and for picking items from a list.

## Use

```jsx
<Checkbox
  label="Notify my team"
  description="Members get an email when this posts."
  checked={notify}
  onChange={(e) => setNotify(e.target.checked)}
/>
```

A "Select all" above a list shows the mixed state while part of the list is chosen:

```jsx
<Checkbox
  label="Select all"
  checked={all}
  indeterminate={picked.length > 0 && !all}
  onChange={() => setPicked(all ? [] : MEMBERS)}
/>
```

## Props that matter

- `label`: the box's name. `description`: a muted second line under it, read as the description.
- `checked` with `onChange` for a controlled box, or `defaultChecked` for an uncontrolled one. `onChange` gets the native change event: read `e.target.checked`.
- `indeterminate`: the dash of a partly chosen list. The box follows the prop, also after a click.
- `disabled`: the row at reduced opacity.
- Any other input prop (`name`, `value`, `required`) reaches the native checkbox.

The whole row is the click and tap target: the native input covers the label, and on phones the row is at least 44px tall.

## The consumer supplies

- A label for every box. A box inside a table row with no label of its own is named by the row: pass `aria-labelledby` with the id of the row's name cell.
- The checked state, and what a "Select all" does to the list.

## Do and don't

- Do use a Checkbox for a choice that waits for a Save button; a setting that applies at once is a Toggle.
- Do keep the label short and put the explanation in `description`.
- Don't use a group of Checkboxes for a one-of-many choice: that is a RadioGroup.
- Don't phrase a label as a negative ("Don't notify"): checked should mean yes.
