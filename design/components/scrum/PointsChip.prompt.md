Scrum metadata chips: `PointsChip` (story points), `EstimateChip` (time), `PRLinkChip` (linked GitHub PR / git.ucsc.edu MR with state color), `UserPair` (reporter → assignee).

```jsx
<PointsChip points={5} />
<EstimateChip estimate="6h" />
<PRLinkChip label="PR #42" url="https://github.com/…/pull/42" state="merged" />
<UserPair reporter="Ashton Liu" assignee="Tony Wu" />
```
