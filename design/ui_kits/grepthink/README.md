# GrepThink UI Kit

Interactive recreation of the GrepThink 2.0 app shell and core screens, composed from the
design-system components (`window.GrepThinkDesignSystem_36e7e3`).

- `index.html` — entry; loads React + Babel + `_ds_bundle.js` + the JSX below.
- `Shell.jsx` — green sidebar (class selector, sections, dark-mode row) + top header (title, search, bell).
- `Screens.jsx` — Home, Projects, Assignments, TSR, Messages, Roster, Meetings.
- `App.jsx` — persona switcher (Student / TA / Instructor) + navigation state.

One design language, three permission lenses: the persona picker only changes which nav items
and screens are available — never the look.

Faithful to: Figma Student/TA/Instructor pages + the codebase's Sidebar/Header/table SCSS.
The gradient "Get Started" tiles from the Figma home are exploration-only and intentionally
omitted (flat token surfaces per the token spec).
