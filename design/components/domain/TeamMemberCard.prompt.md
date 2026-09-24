Member card for project Team tabs (avatar, role pill, skills, actions) + `RoleSelect` dropdown for role changes.

```jsx
<TeamMemberCard name="Ashton Liu" email="aliu@ucsc.edu" role="product_owner"
  skills={['React','Supabase']}
  actions={<><RoleSelect value="product_owner" onChange={setRole} /><Button variant="danger" size="sm">Remove</Button></>} />
```
