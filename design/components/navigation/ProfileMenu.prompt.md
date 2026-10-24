The app header's profile menu, rebuilt on the kit (What's new, 2026-10-23) — `features/app/components/Layout/ProfileMenu.tsx`, which takes the dropdown out of `Header.tsx`; `SchoolSwitcher.tsx` goes. A composition: the profile button (`.gt-profile-menu__button`, today's look — white, the 2.61px card shadow, radius 7, the 28px avatar and a chevron) + `Popover` (`align="end"`, `padded={false}`) + `Menu` (`ariaLabel="Profile"`, `autoFocus`) + `MenuGroup` / `MenuItem` / `MenuSeparator` + `Avatar` + `NewDot` + `Badge`. WAI-ARIA: Menu Button + Menu.

```jsx
<ProfileMenu name="Ashton Liu" avatarUrl={url} unseen={unseen}
  schools={schools} currentSchoolId={current} onPickSchool={pickSchool}
  teaching={myRole === 'instructor'} previewing={isPreviewing} onTogglePreview={toggle}
  onSettings={openSettings} onWhatsNew={openWhatsNew} onLogout={signOut} />
```

- **Rows, in order**: a "School" `MenuGroup` of `radio` rows for an account at two or more schools (the current one checked; picking one does what the switcher's pick did — it no longer expands in place), then a separator; "View class as student" or "Instructor view" while previewing (the `Eye` icon) in a class the user teaches; "Settings"; "ⓘ What's new" with the "New" marker (`Badge status="release.new" size="sm"`, `aria-hidden`) while unseen; a separator; "Log Out", `destructive`. Labels are today's.
- **The dot and the words**: while unseen the avatar carries `NewDot ring` (top-right, ringed in white) and the button *and* the row are described by one visually hidden "New release notes" (`aria-describedby`). The names stay "Profile menu" and "What's new".
- **Trigger**: `aria-haspopup="menu"`, `aria-expanded`. Click toggles; the Menu's `autoFocus` moves focus to the first row.
- **Keyboard and focus**: ↑ ↓ Home End move, Enter picks; Esc or a pick closes with focus back on the profile button; tabbing out closes the menu; an outside click closes it without moving focus. "What's new" closes the menu first and then opens the modal, so the modal's opener is the profile button and focus returns there on close (the dialog's own rule).
- **Prefetch** the feed when the menu opens (not on every hover of the button), as the search trigger warms its index.
- Phones: the button is 44px tall; the Menu's rows are the kit's 44px.
