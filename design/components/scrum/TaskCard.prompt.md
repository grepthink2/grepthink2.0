Scrum task card (the draggable board unit): key + parent story, tags, points + estimate, reporter → assignee, linked PR/MR, comment count, last-move audit.

```jsx
<TaskCard taskKey="GT-12" storyKey="US-3" title="Wire TSR submit endpoint"
  tags={['backend','bug']} points={3} estimate="4h"
  reporter="Ashton Liu" assignee="Tony Wu"
  pr={{label:'PR #42', url:'…', state:'open'}}
  moved={{to:'In Progress', by:'Tony Wu', at:'2h ago'}} onOpen={open} />
```
