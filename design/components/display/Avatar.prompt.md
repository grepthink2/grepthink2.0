Person or project avatar: photo, or initials on the hashed palette colour.

```jsx
<Avatar name="Ashton Liu" />                                  {/* role="img", "Ashton Liu" */}
<span className="row"><Avatar name={m.name} size="sm" decorative /> {m.name}</span>
<Avatar name="GrepThink 2.0" square src={logoUrl} />
<AvatarGroup names={team} max={4} />
```

- **One palette, one hash**: `AVATAR_COLORS` = `--gt-avatar-1…6` (green-500, blue-600, amber-700, purple, green-700, blue-700 — 4.9 to 8.6:1 behind white initials) picked by `hashColor(name)`. The app's seven schemes, including the join-request one that fails 4.5:1, all port to this.
- `decorative` beside a visible name (five screens read the initials aloud today). Otherwise the avatar is `role="img"` named by `name`.
- A broken `src` falls back to the initials (`onError`). Sizes 20 / 28 / 36 / 48 / 64; `square` for projects.
- AvatarGroup is one image: "Ana Ruiz, Ben Ko and 3 more".
