The Project assistant's mark: a four-point spark in Lucide's line style (chosen over a merge-check glyph, which collided with PRLinkChip). `AssistantMark` wraps it in the 26px green-50 tile that stands in for an avatar on assistant-authored surfaces.

```jsx
<AssistantMark />                       // tile, where a person's avatar would be
<AssistantIcon size={16} />             // inline, e.g. in a button
<AssistantIcon variant="merge" />       // runner-up, for comparison only
```

Color: brand green only. Assistant surfaces are told apart from people's by the mark tile, a `Project assistant` label in green-700, and (in-app) a dashed green hairline border — never a new hue.
