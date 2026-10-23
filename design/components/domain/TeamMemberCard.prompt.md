Member card for project Team tabs (avatar, role pill, skills, actions). Roles are assigned the other way round: the Team tab has one kit `Select` per role (Product Owner, Scrum Master) that picks a member, so there is no per-card role dropdown (RoleSelect left 2026-10-22).

```jsx
<TeamMemberCard name="Ashton Liu" email="aliu@ucsc.edu" role="product_owner"
  skills={['React','Supabase']}
  actions={<Button variant="danger-ghost" size="sm">Remove</Button>} />
<Select label="Product Owner" value={po} onChange={(e) => setPo(e.target.value)} options={members.map((m) => ({ value: m.id, label: m.name }))} />
```
