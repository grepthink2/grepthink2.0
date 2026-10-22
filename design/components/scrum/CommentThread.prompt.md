Comment thread for stories & tasks: markdown bodies (the kit's `MarkdownText`, `display/Markdown.jsx`), @mention chips for project-team members, composer with ⌘Enter submit.

```jsx
<CommentThread members={['Ashton Liu','Tony Wu']} comments={[
  {author:'Tony Wu', time:'2h ago', body:'@AshtonLiu the `submit_tsr` RPC is **done** — see [PR #42](…)'}
]} value={draft} onChange={setDraft} onSubmit={post} />
```

`MarkdownText` lives in the kit (`display/Markdown.jsx` ↔ `components/Markdown/MarkdownText`) since 2026-10-22; the design renderer is demo fidelity.
