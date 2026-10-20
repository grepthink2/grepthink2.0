Markdown field with Write / Preview. WAI-ARIA: Tabs (Write / Preview, `size="sm"` on the editor bar) + Toolbar pattern (`role="toolbar"`, one tab stop, ← → / Home / End between tools, `aria-controls` the textarea).

```jsx
<MarkdownEditor label="Project description" value={md} onChange={setMd} maxLength={2000}
  helperText="Markdown: **bold**, _italic_, lists, links." renderPreview={(v) => <MarkdownText>{v}</MarkdownText>} />
```

- Frame: one bordered box (`--gt-border-control`, radius 7) that takes the focus ring; a muted bar holds the 184px Write / Preview tabs and the tools (IconButton sm with tooltips: Bold Ctrl+B, Italic Ctrl+I, Link Ctrl+K, Bulleted list, Code). Tools insert Markdown around the selection and reselect the placeholder (the URL for a link). Shortcuts work in the textarea; Cmd on macOS.
- Write: the borderless textarea (min 140px) with the shared counter under the frame (soft limit). Preview: the rendered Markdown in a focusable tab panel, "Nothing to preview yet." when empty. The port passes `renderPreview` → `MarkdownText` (GitHub-flavoured); the design renderer is only a stand-in and drops unsafe link schemes.
- Uses: project descriptions (replaces the Template / Markdown switch), the public issue form (Write / Preview today). The invite modal's email body takes the same chrome; whether it stores Markdown is the port's call.
