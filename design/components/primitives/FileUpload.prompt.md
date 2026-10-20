File picking in two forms. The visible control is always a real Button that opens the native picker (the hidden `<input type="file">` is out of the tab order); the whole thing is a `role="group"` named by the label, with the help and error lines linked.

```jsx
<FileUpload variant="image" label="Profile photo" accept="image/png,image/jpeg" maxSize={2 * 1024 * 1024}
  typeHint="a PNG or JPG" helperText="PNG or JPG, up to 2 MB." previewUrl={url} onSelect={upload} onRemove={clear} />
<FileUpload label="Roster CSV" accept=".csv" typeHint="a .csv file" dropTitle="Drag your roster CSV here"
  helperText="Export it from Canvas → People." file={csv} fileMeta="62 rows" onSelect={setCsv} onRemove={() => setCsv(null)} />
```

- **image** (Settings round: avatars, project logos): 72px preview (circle, or `shape="square"` radius 10), outline sm **Upload image** → **Change**, danger-ghost **Remove**; the accepted types and size go in `helperText`.
- **drop** (Create Class and Roster import): dashed 1.5px `--gt-border-control`, radius 10, upload glyph in a 40px sunken disc, title, "or", outline **Choose file**. Drag-over: green border + primary-soft fill. Chosen: a file row (name, size · `fileMeta`) with **Replace** and an icon **Remove {name}**.
- Errors (wrong type, too large, the server's parse errors) show as the field error under the control; parse errors that list rows belong in an Alert below.
- A polite live region says "{name} selected". Drag-and-drop is a shortcut only — every path works with the button.
