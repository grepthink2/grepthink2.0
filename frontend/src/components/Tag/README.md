A chip for a picked value (a skill, an applied filter), optionally with an × that removes it.

## Use

```jsx
<Tag>React</Tag>
<Tag tone="green">Frontend</Tag>
<Tag key={skill} tone="green" onRemove={() => drop(skill)} removeLabel={`Remove ${skill}`}>{skill}</Tag>
```

## Props that matter

- The text, as children. Long text is cut with an ellipsis when the tag has a width limit.
- `tone`, default `neutral`: `green` or `blue`.
- `onRemove`: shows an × that calls it. The × is a real button in the tab order, named by `removeLabel` (default "Remove {text}"). On phones it gets a 44px hit area while keeping its look.

A Tag has square-ish corners, where a Badge is a pill.

## The consumer supplies

- The value, and with `onRemove` the removal itself and where focus goes once the tag is gone (the next tag, or the field that adds tags).

## Do and don't

- Do use a Tag for something the person chose and can take back.
- Don't use a Tag for a status: that is a Badge.
- Don't use a Tag as a filter toggle: that is a FilterChip.
