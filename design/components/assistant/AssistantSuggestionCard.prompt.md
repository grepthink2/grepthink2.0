A board change the Project assistant proposes from repository evidence (a merged PR, commits). It names the evidence and the change, and does nothing until someone approves.

```jsx
<AssistantSuggestionCard
  evidence={<>PR <b>#41</b> was merged into main.</>}
  taskKey="GT-12" taskTitle="Connect the class roster API" target="Done"
  onApprove={approve} onDismiss={dismiss} />
<AssistantSuggestionCard state="approved" taskKey="GT-12" approvedBy="you" />
<AssistantSuggestionCard state="dismissed" onUndo={undo} />
```

States: `pending` · `approved` (collapses to "GT-12 moved to Done · approved by you") · `dismissed`. `surface="landing"` swaps the flat 10px card for the floating 20px shell.
