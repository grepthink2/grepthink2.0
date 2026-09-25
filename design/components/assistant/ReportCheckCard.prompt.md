Staff-only (TA / instructor): a week's status reports set against the tasks and PRs each student closed. Rows that match get a green check; rows that don't line up get an amber mark and a "Review" action.

```jsx
<ReportCheckCard week="Week 5" project="ShoeShopper" rows={[
  { kind: 'match',  text: '4 reports match closed work' },
  { kind: 'review', text: 'Alex: reports 35%, closed 1 of 6 tasks', onReview: open },
]} />
```

Wording rule: numbers, not judgments — "reports 35%, closed 1 of 6 tasks", never "overreported" or "inflated". The card starts a conversation; it doesn't grade.
