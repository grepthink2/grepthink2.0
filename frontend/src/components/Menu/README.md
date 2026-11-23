A list of actions or choices shown in a Popover from a button, with dense rows, icons, shortcuts and the keyboard behaviour of a menu.

## Use

```jsx
<Popover
  open={open}
  onClose={close}
  padded={false}
  anchor={<IconButton ariaLabel="Task actions" onClick={() => setOpen(!open)}><MoreHorizontal size={16} /></IconButton>}
>
  <Menu onClose={close} ariaLabel="Task actions">
    <MenuItem icon={<Pencil size={16} />} onSelect={act}>Edit</MenuItem>
    <MenuItem icon={<Link size={16} />} shortcut="⌘C" onSelect={act}>Copy link</MenuItem>
    <MenuSeparator />
    <MenuItem icon={<Trash2 size={16} />} destructive onSelect={act}>Delete</MenuItem>
  </Menu>
</Popover>
```

## Props that matter

- `ariaLabel`, required: the menu's name.
- `onClose`: Esc in the menu calls it. A chosen row does not close the menu: close it in the row's `onSelect` when it should.
- `autoFocus`: focuses the first row as it opens, right for a menu opened from a button; `'checked'` focuses the chosen row of a single-choice menu. The preview leaves it off so the card does not take focus.

Rows are 32px (44px on phones). The arrow keys, Home and End move, Enter activates, and Esc closes. Put it in a `Popover` with `padded={false}`.

## The consumer supplies

- The trigger (an IconButton or a Button) and `open`, the rows and their handlers, and closing the menu after a choice.

## Do and don't

- Do keep a menu to actions on one thing, or to one choice.
- Do put a destructive row last, after a separator.
- Don't put fields in a menu: that is a Popover with a form.
- Don't use a Menu for a long list someone searches: that is a Select.

## MenuItem

One row: an action, or with `checked` a checkbox row (`radio` with it for a single choice).

```jsx
<MenuItem key={s.id} radio checked={s.id === current} onSelect={() => setCurrent(s.id)}>{s.name}</MenuItem>
```

- `onSelect`, `icon` (16px), `shortcut` (a hint such as "⌘C"), `destructive` (red), `disabled`.
- `checked` makes a `menuitemcheckbox`; with `radio`, a `menuitemradio`. A checkable row without an icon shows a check slot, so its state is not colour alone.
- `trailing`: a marker at the row's end, such as `<Badge status="release.new" size="sm" aria-hidden="true" />`. Keep it hidden and describe the row with `aria-describedby`, so its name stays its label.

## MenuGroup

A labelled run of rows (the profile menu's "School"): the caps label names the group, and the arrow keys skip it.

```jsx
<MenuGroup label="School">
  …
</MenuGroup>
```

## MenuSeparator

A thin rule between groups of rows: `<MenuSeparator />`.
