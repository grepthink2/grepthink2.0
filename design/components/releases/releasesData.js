/* GrepThink What's new — sample notes for the galleries (brief §8), one Markdown string per version, as the files in
   frontend/src/features/releases/notes/<version>.md read (front matter + ## New / ## Improved / ## Fixed bullet lists).
   Sample data, not real release notes. window.GT_RELEASE_NOTES_SAMPLE = the brief's three; window.GT_RELEASE_NOTES_MORE
   adds two invented ones for the "five or more" and "a long entry" states. Parse with ReleasesModel.releasesFromNotes. */
(function () {
  const sample = {
    '0.92.0': [
      '---', 'date: 2026-11-05', '---', '',
      '## New', '',
      '- **Final review sign-up.** Product Owners book their team\'s final review slot, and TAs sign up to review the teams that hold one.',
      '- Instructors post one-hour slots for the class and open or close sign-ups with one switch.', '',
      '## Improved', '',
      '- The scrum board\'s sprint picker shows each sprint\'s dates, status and progress.',
      '- Final review times show in your time zone, with the campus time beside them when the two differ.',
      '- The [help center](/app/help-center) walks you through booking a slot.', '',
      '## Fixed', '',
      '- A `?` no longer shows in place of a member\'s avatar before they add their name.', '',
    ].join('\n'),
    '0.91.1': [
      '---', 'date: 2026-10-28', '---', '',
      '## Fixed', '',
      '- Picking a school in the profile menu keeps you on the page you were on, when your role there allows it.',
      '- On phones, the last line of a long dialog is no longer hidden behind its buttons.', '',
    ].join('\n'),
    '0.91.0': [
      '---', 'date: 2026-10-23', '---', '',
      '## New', '',
      '- **What\'s new.** Release notes for every version, on the landing page and in your profile menu.',
      '- A meeting that is happening now shows a blue **Live** badge on your schedule.', '',
      '## Improved', '',
      '- Pages open faster: each page loads its own code the first time you visit it.',
      '- Buttons, fields, dialogs, badges, cards and tabs share one look across the app.', '',
      '## Fixed', '',
      '- The date picker\'s weekday header lines up with its days again.',
      '- Closing a dialog returns you to the button that opened it.', '',
    ].join('\n'),
  };
  const more = {
    ...sample,
    '0.93.0': [
      '---', 'date: 2026-11-19', '---', '',
      '## New', '',
      '- **Notifications on the kit.** The bell\'s list uses the same rows, buttons and empty state as the rest of the app, and it reads well with a screen reader.',
      '- Instructors export a class\'s attendance as CSV from the Roster page.',
      '- Team channels show who is typing.', '',
      '## Improved', '',
      '- The ⌘K search finds assignments by their due date ("due friday") and people by their role ("scrum master").',
      '- Analytics charts label their bars directly; the tooltip repeats the figure instead of being the only place it shows.',
      '- The sprint burnup keeps its last point on the right edge when a sprint ends early.',
      '- The sidebar remembers whether you collapsed it, per browser.',
      '- Long project names wrap in the project card instead of being cut.', '',
      '## Fixed', '',
      '- A comment with `code` that contained an asterisk no longer renders the rest of the thread in italics.',
      '- The schedule\'s Now line sits on the right minute after the clocks change.',
      '- Marking all notifications read no longer leaves the badge at 1 until the next refresh.',
      '- The final review slot board scrolls to the current week on phones.', '',
    ].join('\n'),
    '0.92.1': [
      '---', 'date: 2026-11-10', '---', '',
      '## Fixed', '',
      '- A booked final review slot shows its Zoom link to every member of the team, not only the Product Owner.', '',
    ].join('\n'),
  };
  window.GT_RELEASE_NOTES_SAMPLE = sample;
  window.GT_RELEASE_NOTES_MORE = more;
})();
