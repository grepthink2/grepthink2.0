A person's or a project's avatar: their photo, or their initials on a colour picked from their name, the same colour on every screen.

## Use

```jsx
<Avatar name="Ines Ruiz" />
<Avatar name="Maya Chen" size="sm" decorative />
<Avatar name="Bike Share Map" square />
```

## Props that matter

- `name`: a full name or an email. The initials ("Maya Chen" gives MC; an email reads as its part before the @), the colour and the accessible name all come from it.
- `src`: a photo. If it fails to load, the initials show instead.
- `size`, default `md`: `xs` 20px, `sm` 28px, `md` 36px, `lg` 48px, `xl` 64px.
- `square`: a rounded square, for a project instead of a person.
- `decorative`: hides the avatar from screen readers, for one sitting beside the name it shows, so the name is not read twice. Without it, the avatar is an image named by `name`.

The colour comes from one palette of six token colours (`--gt-avatar-1` to `--gt-avatar-6`), each readable behind white initials, chosen by a hash of the name.

## The consumer supplies

- The name, and `decorative` wherever the name is printed beside the avatar.

## Do and don't

- Do pass the same string (the full name, or the email) everywhere a person appears, so their colour matches across screens.
- Don't pick an avatar's colour yourself; the hash does.
- Don't use an Avatar as a button on its own: wrap it in one with a name ("Profile menu").

## AvatarGroup

Overlapping avatars for a team, collapsing past `max` into a "+n" chip. The group is one image named for everyone in it ("Maya Chen, Leo Park, Ines Ruiz, Sam Okafor and 2 more"), with each face hidden.

```jsx
<AvatarGroup names={TEAM} max={4} />
<AvatarGroup names={TEAM.slice(0, 3)} size="md" />
```

- `names`: the people, in order. `max`, default 4: the faces shown before "+n". `size`, default `sm`: `xs`, `sm` or `md`.

`avatarHelpers` also exports `initialsOf`, `hashColor`, `AVATAR_COLORS` and `AVATAR_PX` (each size in px), for a placeholder that must match an avatar.
