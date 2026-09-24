User Story card: key, title, points + time estimate, reporter → assignee, child-task rollup bar. Click opens the story detail (markdown description + comments + tasks).

```jsx
<StoryCard storyKey="US-3" title="As a student, I can submit my TSR" points={8} estimate="3d"
  reporter="Ashton Liu" assignee="Tony Wu" tasksDone={2} tasksTotal={5} pointsDone={3} onOpen={open} />
```
