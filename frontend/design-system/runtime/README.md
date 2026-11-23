Places a lucide icon by its name, for a canvas or a preview that cannot import icons: `<Icon name="Trash2" size={16} />`.

## Use

```jsx
<Icon name={name} size={20} aria-hidden="true" />
<Icon name="Trash2" size={20} aria-label="Delete" />
```

## Props that matter

- `name`: the lucide export's name, exactly as the app imports it (`Trash2`, `MessageSquare`, `ExternalLink`). The system carries the icons the app uses, and the README's iconography section lists them. An unknown name renders nothing and warns once in the console.
- `size`, default 16: the width and height in px. The kit uses 14 in small buttons and chips, 16 in buttons and rows, 18 to 20 in icon buttons and headers.
- Every other prop reaches the `<svg>`: `aria-hidden` for an icon beside words, `aria-label` for one that stands alone, `strokeWidth`, `className`.

An icon is drawn in `currentColor`, so it takes the text colour around it.

## The consumer supplies

- The name, and either `aria-hidden="true"` (the words beside it say what it means) or an `aria-label`.

## Do and don't

- Do use the same icon for the same action everywhere (Trash2 for delete, Pencil for edit, X for close).
- Do put an icon-only action in an IconButton, whose `ariaLabel` names it.
- Don't colour an icon with a hex value: colour its container with a token.
