The "new" dot — "something new to read" (a release this browser has not opened What's new on). Blue (`--gt-new-dot` = `--gt-info`, the informational colour under the status rule), 8px, decorative. It is **not** UnreadBadge: no red, no count, no words of its own.

```jsx
{/* the landing tab: on the Info icon's corner, ringed in the bar's dark */}
<button aria-label="What's new" aria-haspopup="dialog" aria-describedby={unseen ? descId : undefined}>
  <span className="gt-landing-header__tab-icon"><Info size={16} aria-hidden />{unseen && <NewDot ring />}</span>
  <span>What's new</span>
  {unseen && <span id={descId} className="gt-visually-hidden">New release notes</span>}
</button>

{/* the profile button: on the avatar's top-right, ringed in white */}
<span className="gt-profile-menu__avatar"><Avatar src={url} size="sm" decorative />{unseen && <NewDot ring className="gt-profile-menu__dot" />}</span>
```

- **Words live on the host.** The dot is `aria-hidden`; the control keeps its name ("What's new", "Profile menu") and, while the dot shows, is also described as "New release notes" through `aria-describedby` on a visually hidden span. Voice control and tests keep finding the control by its name.
- **Ring** (`ring`): 2px in `--gt-new-dot-ring` (default `--gt-surface`) so the dot stays a dot over a photo, initials or an icon stroke. The landing header re-colours it from its own class (`.gt-landing-header__tab-icon .gt-new-dot--ring { box-shadow: 0 0 0 2px var(--gt-mkt-dark) }`).
- **Contrast** (a graphical object, 3:1): 4.3:1 on white, 4.0:1 on the landing's dark bar.
- Position from the host's class (`.gt-profile-menu__dot { position: absolute; top: -1px; right: -1px }`); the dot itself has no offset.
- The marker *inside* a list ("New" on a release entry or a menu row) is a `Badge status="release.new" size="sm"`, not this dot.
