Tag chip for skills and filters; pass `onRemove` to make it dismissible.

```jsx
<Tag tone="green">React</Tag>
<Tag onRemove={() => drop('TypeScript')}>TypeScript</Tag>
```
