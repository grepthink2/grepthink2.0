@-mention autocomplete for composer textareas — anchors above or below the caret (whichever fits), keeps focus in the textarea (`aria-activedescendant` pattern). Async-first: `members` for a cached team list, `onSearch` for Supabase lookups (debounce 250ms before calling; the component adds it). First consumer is the scrum comment composer; the pattern is repo-wide — messages adopt it later.

```jsx
<div style={{ position: 'relative' }}>
  <textarea className="gt-comments__input" aria-controls="mention-box"
    aria-activedescendant={open ? `mention-box-opt-${active}` : undefined} … />
  <MentionListbox id="mention-box" open={open} query={query} position="above"
    onSearch={(q) => supabase.searchMembers(projectId, q)} onSelect={insert} activeIndex={active} />
</div>
```

Host keyboard: ↑/↓ move `activeIndex`, Enter/Tab insert, Esc dismiss. States: idle hint, loading spinner, results (cap 6 visible, scroll beyond), empty ("No matches for 'q'"), error with quiet Retry. `stateOverride` forces a state for demos.
