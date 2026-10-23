Single-line text field. Native `<input>` in the FieldShell; `aria-describedby` links help, error and counter, `aria-invalid` follows `error`.

```jsx
<Input label="Project name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
<Input label="LinkedIn" optional prefixText="linkedin.com/in/" value={li} onChange={…} />
<Input label="Search members" hideLabel compact iconLeft={<Search size={15} />} />
```

- Sizes: default 40px; `compact` 32px for toolbars and filter rows. 44px under 768px.
- Boundary `--gt-border-control` (3.7:1 on white), hover `--gt-border-control-hover`, focus accent border + 2px ring, error `--gt-error`. Disabled: sunken fill, tertiary text, value stays readable.
- `prefixText` / `suffix` / `iconLeft` / `action` sit inside one bordered group; the group takes the focus ring.
- `maxLength` is a soft limit (see FieldShell). Don't set the native attribute.
- Forms: see `design_handoff_ui_alignment/README.md` → Form pattern (field grid, "(optional)", errors under fields, focus to the first invalid field, save error as an Alert above right-aligned actions).
