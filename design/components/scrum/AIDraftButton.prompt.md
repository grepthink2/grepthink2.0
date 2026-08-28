Sparkle ghost button for LLM-drafted stories/tasks. Quiet by design — AI assist, not an AI feature wall.

```jsx
<AIDraftButton onClick={draft} />
<AIDraftButton loading />
<AIDraftButton size="sm">Suggest tasks</AIDraftButton>
```

Backend: free-tier model behind a serverless proxy (Cloudflare Workers AI — see `design_handoff_scrum_board/README.md`).
