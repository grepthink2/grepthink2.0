Comment thread for stories & tasks: markdown bodies (`MarkdownText`), @mention chips for project-team members, composer with ⌘Enter submit.

```jsx
<CommentThread members={['Ashton Liu','Tony Wu']} comments={[
  {author:'Tony Wu', time:'2h ago', body:'@AshtonLiu the `submit_tsr` RPC is **done** — see [PR #42](…)'}
]} value={draft} onChange={setDraft} onSubmit={post} />
```

`MarkdownText` is demo fidelity; production reuses the codebase's markdown + mention semantics.
