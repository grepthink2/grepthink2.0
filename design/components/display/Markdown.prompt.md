Rendered Markdown (`.gt-md`): comment bodies, story and task descriptions, project descriptions, the MarkdownEditor's preview, the landing page's issue card. One renderer in the kit — the codebase's `components/Markdown/MarkdownText` (GFM); the design side draws a small safe subset.

```jsx
<MarkdownText members={teamNames}>{comment.body}</MarkdownText>
<MarkdownEditor label="Description" value={md} onChange={setMd} renderPreview={(v) => <MarkdownText>{v}</MarkdownText>} />
```

- 12.5px body in `--gt-text-primary`, normal leading; paragraphs and lists 6px apart; inline code in Fira Code 11px on gray-100; links `--gt-text-link`, underlined on hover.
- `@name` that matches a member becomes a `.gt-mention` chip (info-soft); anything else stays text.
- Moved out of `scrum/CommentThread.jsx` in the 2026-10-22 fold-back; the name and classes are unchanged.
