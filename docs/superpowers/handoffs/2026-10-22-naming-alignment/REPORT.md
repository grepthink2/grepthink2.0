# Naming alignment: the design's exports against the codebase

**For:** the design project · **From:** Claude Code, 2026-10-22, branch `chore/naming-alignment` · **Answers:**
`design/design_handoff_naming_alignment/README.md`

The codebase's names win, as the handoff decided. This round renames nothing on either side. It audits every export in
`design/_ds_manifest.json` (the 2026-10-21 export) against `frontend/src/`, adds a third `lint:design` check that keeps
the kit's names in step, and lists the renames the next design round can make. Paths are under `frontend/src/` unless
they start with `design/` or `frontend/`.

## Summary

| | Exports | Same name | Different name | Not ported yet | Design-only |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kit (`primitives`, `display`, `feedback`, `navigation`) | 57 | 50 | 2 | 4 | 1 |
| Feature layers | 128 | 69 | 32 | 24 | 3 |
| **All** | **185** | **119** | **34** | **28** | **4** |

- **Same name:** the codebase has the export under its own name, where the rules below look for it. Four of these (the
  scrum chips) live in a file named differently from the design's, which `NAMES_ALLOWLIST` records.
- **Different name:** the codebase keeps the thing under another name, builds it in place inside a larger component, or
  has replaced it with a kit component. "Different names" below lists each one with the name the codebase keeps.
- **Not ported yet:**
  - the composites (Combobox, FileUpload, MarkdownEditor, Stepper), which join the kit after the final-review screens;
  - the final-review screens (C2, 16 exports), whose folder `features/finalReviews/` does not exist yet;
  - analytics' timeliness (sub-project C, 4);
  - the Today's Schedule card and the `/app/schedule` agenda (2);
  - scrum's AI draft button and @mentions (2).
- **Design-only:** Pagination, two stand-ins for libraries the bundle lacks (AnalyticsIcon for lucide-react,
  BarChartCard for recharts) and ModKey, the bundle's alias of `modKey()`. Outside `components[]` and design-only by the
  handoff's rule: the 52 galleries (`*.card.html`), `components/gallery.css`, the two templates
  (`templates/grepthink-app`, `templates/scrum-board`) and `ui_kits/**`.
- No kit component is misnamed: at HEAD the check passes with no failure and no warning.

## The handoff's "Already known"

- **FieldShell.** The code uses the design's name: `components/FieldShell/FieldShell.tsx` exports `FieldShell` and owns
  the same `.gt-field` block. "Field" was a working name in a local plan only; no file, folder or export in the codebase
  is called `Field`.
- **The status map** is `components/Badge/badgeStatus.ts`. It exports `BADGE_STATUS`, `BADGE_CATEGORY` and
  `PROJECT_ROLES` under the design's names.
- **The templates** are not in `components[]`, so the check does not read them.

## How `lint:design` checks the names

`frontend/scripts/names.mjs` runs from `frontend/scripts/design-adherence.mjs`, after the raw-hex and ownership checks.
It reads `design/_ds_manifest.json` and every source file under `src/`, except tests and the entry files directly in
`src/` (`main.tsx`, `App.tsx`, a local preview page's entry).

**The kit fails the run.** A kit component lives at `src/components/<Name>/<Name>.tsx`. The manifest's `sourcePath`
says when the design ships an export in another component's file. Such an export may also live in that component's
folder, in its file or in a file of its own name: `InlineConfirm` in `components/ConfirmDialog/ConfirmDialog.tsx`,
`FilterChipGroup` in `components/FilterChip/FilterChipGroup.tsx`. Or in its own folder, as `Skeleton` does. That one
rule covers every grouped export, so none needs an allowlist entry: InlineConfirm, NoClassSelected, Skeleton, TabPanel,
AvatarGroup, MenuItem, MenuSeparator, ToastStack and FilterChipGroup. These fail:

- a file anywhere in `src/` that exports a kit component outside those places;
- a folder in `src/components/` named after neither a kit component nor a design file that groups some (`hooks/` and
  `icons/` are lowercase, hold no component and are not read);
- a component file (a `.ts` or `.tsx` file whose name starts with a capital) named after neither its folder nor an
  export the design groups under it;
- a component file named after a design export that does not export it;
- a component file directly in `src/components/`.

Two kit findings are warnings: a kit component the codebase lacks, and a kit constant (`AVATAR_COLORS`, `BADGE_STATUS`
and the like) declared outside its component's folder.

**Feature layers and constants only warn.** Each feature family has a home in `FEATURE_HOMES`, after PORTING.md's map:

| Family | Home |
| --- | --- |
| `analytics` | `features/analytics/` |
| `assistant` | `features/app/components/Assistant/` |
| `domain` | `features/` (the feature that owns each card) |
| `finalreviews` | `features/finalReviews/` |
| `marketing` | `features/landing/` |
| `schedule` | `features/schedule/` |
| `scrum` | `features/scrum/` |
| `search` | `features/search/` |

An export counts as found when:

- its home declares it, exported or not, in a file named like it or like its design file (`PointPicker` in
  `ScalePicker.tsx`);
- a constant is declared in any file of the home (`ESTIMATE_SCALES` in `config/scrumTags.ts`);
- a model is the module of its name (`ScheduleModel` is `scheduleModel.ts`);
- the kit exports it under its name (`MarkdownText`).

Anything else is a warning, since a feature file may group several exports. A family whose home does not exist yet
(`finalreviews`) gets one note.

**`NAMES_ALLOWLIST`** records every deliberate difference, with its status and reason. An entry covers either:

- a design export the codebase keeps under another name (`keeps`), or not at all (`not ported`, `design-only`); or
- a folder or file in `src/` that no design export names.

An entry that hides nothing any more is a warning. That happens when the manifest drops the name, the export starts to
match by rule, `src/` stops declaring the `keeps` name, or the path is gone or the design now names it. A malformed entry
fails the run.

**What it cannot see.** The manifest lists capitalized exports only, so hooks and helpers (`useDialog`, `useTableSort`,
`hashColor`) are not checked. `useDialog` sits in `components/Modal/useDialog.ts`, as the design groups it in
`feedback/Modal.jsx`. `SortableHeader` is no design export at all: the design's `display/Table.jsx` draws that cell
inside Table. Declarations are read with a line scan, not a parser.

## The audit

Each table holds one family. The status comes from the check's own findings: "Codebase" is where the export lives, or,
for an allowlisted export, the name the codebase keeps. *(allowlist)* marks a note that is the entry's reason.

### `components/primitives/` (17)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `Button` | Button.jsx | same name | `components/Button/Button.tsx` |  |
| `Checkbox` | Checkbox.jsx | same name | `components/Checkbox/Checkbox.tsx` |  |
| `CodeInput` | CodeInput.jsx | same name | `components/CodeInput/CodeInput.tsx` |  |
| `Combobox` | Combobox.jsx | not ported | — | The composites join the kit after the final-review screens. Until then the screens keep their own pickers, file inputs and Markdown editors, and the TSR flow its TsrsStepper. *(allowlist)* |
| `DatePickerField` | DatePickerField.jsx | same name | `components/DatePickerField/DatePickerField.tsx` |  |
| `FieldShell` | FieldShell.jsx | same name | `components/FieldShell/FieldShell.tsx` |  |
| `FileUpload` | FileUpload.jsx | not ported | — | The composites join the kit after the final-review screens. Until then the screens keep their own pickers, file inputs and Markdown editors, and the TSR flow its TsrsStepper. *(allowlist)* |
| `IconButton` | IconButton.jsx | same name | `components/IconButton/IconButton.tsx` |  |
| `Input` | Input.jsx | same name | `components/Input/Input.tsx` |  |
| `MarkdownEditor` | MarkdownEditor.jsx | not ported | — | The composites join the kit after the final-review screens. Until then the screens keep their own pickers, file inputs and Markdown editors, and the TSR flow its TsrsStepper. *(allowlist)* |
| `PasswordField` | PasswordField.jsx | same name | `components/PasswordField/PasswordField.tsx` |  |
| `RadioGroup` | RadioGroup.jsx | same name | `components/RadioGroup/RadioGroup.tsx` |  |
| `SearchField` | SearchField.jsx | same name | `components/SearchField/SearchField.tsx` |  |
| `Select` | Select.jsx | same name | `components/Select/Select.tsx` |  |
| `Slider` | Slider.jsx | same name | `components/Slider/Slider.tsx` |  |
| `Textarea` | Textarea.jsx | same name | `components/Textarea/Textarea.tsx` |  |
| `Toggle` | Toggle.jsx | same name | `components/Toggle/Toggle.tsx` |  |

### `components/display/` (16)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `AVATAR_COLORS` | Avatar.jsx | same name | `components/Avatar/avatarHelpers.ts` |  |
| `Avatar` | Avatar.jsx | same name | `components/Avatar/Avatar.tsx` |  |
| `AvatarGroup` | Avatar.jsx | same name | `components/Avatar/Avatar.tsx` | with Avatar, as the design groups it |
| `BADGE_STATUS` | Badge.jsx | same name | `components/Badge/badgeStatus.ts` |  |
| `BADGE_CATEGORY` | Badge.jsx | same name | `components/Badge/badgeStatus.ts` |  |
| `PROJECT_ROLES` | Badge.jsx | same name | `components/Badge/badgeStatus.ts` |  |
| `Badge` | Badge.jsx | same name | `components/Badge/Badge.tsx` |  |
| `Card` | Card.jsx | same name | `components/Card/Card.tsx` |  |
| `CountBadge` | CountBadge.jsx | same name | `components/CountBadge/CountBadge.tsx` |  |
| `InfoPopover` | InfoPopover.jsx | same name | `components/InfoPopover/InfoPopover.tsx` |  |
| `ProgressBar` | ProgressBar.jsx | same name | `components/ProgressBar/ProgressBar.tsx` |  |
| `StatCard` | StatCard.jsx | same name | `components/StatCard/StatCard.tsx` |  |
| `Table` | Table.jsx | same name | `components/Table/Table.tsx` |  |
| `Tag` | Tag.jsx | same name | `components/Tag/Tag.tsx` |  |
| `Tooltip` | Tooltip.jsx | same name | `components/Tooltip/Tooltip.tsx` |  |
| `UnreadBadge` | UnreadBadge.jsx | same name | `components/UnreadBadge/UnreadBadge.tsx` |  |

### `components/feedback/` (15)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `Alert` | Alert.jsx | same name | `components/Alert/Alert.tsx` |  |
| `ConfirmDialog` | ConfirmDialog.jsx | same name | `components/ConfirmDialog/ConfirmDialog.tsx` |  |
| `InlineConfirm` | ConfirmDialog.jsx | same name | `components/ConfirmDialog/ConfirmDialog.tsx` | with ConfirmDialog, as the design groups it |
| `Drawer` | Drawer.jsx | same name | `components/Drawer/Drawer.tsx` |  |
| `EmptyState` | EmptyState.jsx | same name | `components/EmptyState/EmptyState.tsx` |  |
| `NoClassSelected` | EmptyState.jsx | same name | `components/EmptyState/EmptyState.tsx` | with EmptyState, as the design groups it |
| `Skeleton` | EmptyState.jsx | same name | `components/Skeleton/Skeleton.tsx` |  |
| `Menu` | Menu.jsx | same name | `components/Menu/Menu.tsx` |  |
| `MenuItem` | Menu.jsx | same name | `components/Menu/Menu.tsx` | with Menu, as the design groups it |
| `MenuSeparator` | Menu.jsx | same name | `components/Menu/Menu.tsx` | with Menu, as the design groups it |
| `Modal` | Modal.jsx | same name | `components/Modal/Modal.tsx` |  |
| `Popover` | Popover.jsx | same name | `components/Popover/Popover.tsx` |  |
| `Spinner` | Spinner.jsx | same name | `components/Spinner/Spinner.tsx` |  |
| `Toast` | Toast.jsx | same name | `components/Toast/Toast.tsx` |  |
| `ToastStack` | Toast.jsx | same name | `components/Toast/Toast.tsx` | with Toast, as the design groups it |

### `components/navigation/` (9)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `FilterChip` | FilterChip.jsx | same name | `components/FilterChip/FilterChip.tsx` |  |
| `FilterChipGroup` | FilterChip.jsx | same name | `components/FilterChip/FilterChipGroup.tsx` | with FilterChip, as the design groups it |
| `Pagination` | Pagination.jsx | design-only | — | No screen pages through numbered pages; search has its own pager, SearchPagination. *(allowlist)* |
| `SegmentedControl` | SegmentedControl.jsx | same name | `components/SegmentedControl/SegmentedControl.tsx` |  |
| `SidebarNavItem` | SidebarNavItem.jsx | different name | `Sidebar` (`features/app/components/Layout/Sidebar.tsx`) | The app's sidebar is their one consumer and renders its rows (`.sidebar-item`) and section titles (`.section-title`) itself. *(allowlist)* |
| `SidebarSectionTitle` | SidebarNavItem.jsx | different name | `Sidebar` (`features/app/components/Layout/Sidebar.tsx`) | The app's sidebar is their one consumer and renders its rows (`.sidebar-item`) and section titles (`.section-title`) itself. *(allowlist)* |
| `Stepper` | Stepper.jsx | not ported | — | The composites join the kit after the final-review screens. Until then the screens keep their own pickers, file inputs and Markdown editors, and the TSR flow its TsrsStepper. *(allowlist)* |
| `Tabs` | Tabs.jsx | same name | `components/Tabs/Tabs.tsx` |  |
| `TabPanel` | Tabs.jsx | same name | `components/Tabs/Tabs.tsx` | with Tabs, as the design groups it |

### `components/analytics/` (27)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `RANGE_PRESETS` | AnalyticsFilterRow.jsx | different name | `CHIPS` (`features/analytics/components/AnalyticsFilterRow.tsx`) | AnalyticsFilterRow's preset chips ({ preset, label }), private to the file; the dashboard hook checks the URL against its own PRESETS. *(allowlist)* |
| `AnalyticsFilterRow` | AnalyticsFilterRow.jsx | same name | `features/analytics/components/AnalyticsFilterRow.tsx` |  |
| `BarsBySprint` | BarsBySprint.jsx | same name | `features/analytics/components/BarsBySprint.tsx` |  |
| `BREAKDOWN_COLUMNS` | BreakdownTable.jsx | different name | `breakdownColumns` (`features/analytics/components/BreakdownTable.tsx`) | BreakdownTable builds both column sets with breakdownColumns(kind), which the page's CSV export shares. *(allowlist)* |
| `TEAM_BREAKDOWN_COLUMNS` | BreakdownTable.jsx | different name | `breakdownColumns` (`features/analytics/components/BreakdownTable.tsx`) | BreakdownTable builds both column sets with breakdownColumns(kind), which the page's CSV export shares. *(allowlist)* |
| `TIMELINESS_COLUMNS` | BreakdownTable.jsx | not ported | — | Timeliness ships with analytics' sub-project C; the first release has none of it. *(allowlist)* |
| `BreakdownTable` | BreakdownTable.jsx | same name | `features/analytics/components/BreakdownTable.tsx` |  |
| `ChartCard` | ChartCard.jsx | same name | `features/analytics/components/ChartCard.tsx` |  |
| `ChartCardTool` | ChartCard.jsx | different name | `Button` (`components/Button/Button.tsx`) | Analytics builds its tool buttons itself (`.gt-analytics__toggle` and `.gt-analytics__refresh` in AnalyticsPage, `.gt-table__export` in BreakdownTable); they become Button (pressed, outline) when analytics moves onto the kit. *(allowlist)* |
| `ChartCardCheck` | ChartCard.jsx | different name | `Checkbox` (`components/Checkbox/Checkbox.tsx`) | AnalyticsPage builds the Compare check itself (`.gt-analytics__check`); it becomes Checkbox when analytics moves onto the kit. *(allowlist)* |
| `ChartEmptyState` | ChartEmptyState.jsx | different name | `EmptyState` (`components/EmptyState/EmptyState.tsx`) | ChartCard renders the kit's EmptyState (variant="card"). *(allowlist)* |
| `AnalyticsIcon` | ChartLegend.jsx | design-only | — | Lucide-shaped glyphs for the design bundle; the codebase imports lucide-react. *(allowlist)* |
| `ChartLegend` | ChartLegend.jsx | same name | `features/analytics/components/ChartLegend.tsx` |  |
| `ChartFormat` | ChartTooltip.jsx | different name | `analyticsFormat` (`features/analytics/utils/analyticsFormat.ts`) | The format helpers live in `utils/analyticsFormat.ts` (percent, weekLabel, dateLabel, rangeLabel) and the scale in `utils/chartGeometry.ts`. *(allowlist)* |
| `ChartTooltip` | ChartTooltip.jsx | same name | `features/analytics/components/ChartTooltip.tsx` |  |
| `DefinitionPopover` | DefinitionPopover.jsx | different name | `InfoPopover` (`components/InfoPopover/InfoPopover.tsx`) | Promoted into the kit as InfoPopover, which ChartCard renders. *(allowlist)* |
| `LivePill` | LivePill.jsx | same name | `features/analytics/components/LivePill.tsx` |  |
| `OnTimeMeter` | OnTimeMeter.jsx | not ported | — | Timeliness ships with analytics' sub-project C; the first release has none of it. *(allowlist)* |
| `SplitBar` | SplitBar.jsx | same name | `features/analytics/components/SplitBar.tsx` |  |
| `BOARD_STATUSES` | StackedBars.jsx | different name | `STATUS_LABEL` (`features/analytics/components/StackedBars.tsx`) | StackedBars keeps the board statuses as ORDER and STATUS_LABEL, private to the file. *(allowlist)* |
| `StackedBars` | StackedBars.jsx | same name | `features/analytics/components/StackedBars.tsx` |  |
| `StatTile` | StatTile.jsx | different name | `StatCard` (`components/StatCard/StatCard.tsx`) | The analytics tiles render the kit's StatCard with `compact`. *(allowlist)* |
| `TIMELINESS_BUCKETS` | TimelinessBars.jsx | not ported | — | Timeliness ships with analytics' sub-project C; the first release has none of it. *(allowlist)* |
| `TimelinessBars` | TimelinessBars.jsx | not ported | — | Timeliness ships with analytics' sub-project C; the first release has none of it. *(allowlist)* |
| `TrendLines` | TrendLines.jsx | same name | `features/analytics/components/TrendLines.tsx` |  |
| `UnitToggle` | UnitToggle.jsx | same name | `features/analytics/components/UnitToggle.tsx` |  |
| `WeeklyLine` | WeeklyLine.jsx | same name | `features/analytics/components/WeeklyLine.tsx` |  |

### `components/assistant/` (6)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `AssistantIcon` | AssistantIcon.jsx | same name | `features/app/components/Assistant/AssistantIcon.tsx` |  |
| `AssistantMark` | AssistantIcon.jsx | same name | `features/app/components/Assistant/AssistantIcon.tsx` | in AssistantIcon |
| `AssistantSuggestionCard` | AssistantSuggestionCard.jsx | same name | `features/app/components/Assistant/AssistantSuggestionCard.tsx` |  |
| `ReportCheckCard` | ReportCheckCard.jsx | same name | `features/app/components/Assistant/ReportCheckCard.tsx` |  |
| `StalledFlag` | StalledFlag.jsx | same name | `features/app/components/Assistant/StalledFlag.tsx` |  |
| `UnlinkedPRChip` | UnlinkedPRChip.jsx | same name | `features/app/components/Assistant/UnlinkedPRChip.tsx` |  |

### `components/domain/` (24)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `AssignmentCard` | AssignmentCard.jsx | different name | `StudentHomeDashboard` (`features/app/components/Home/StudentHomeDashboard.tsx`) | Student Home builds its deadline rows in place (`.student-home__deadline-row`, the design's five statuses), and StudentAssignmentsTable its table rows. *(allowlist)* |
| `ConversationListItem` | ConversationListItem.jsx | different name | `ConversationList` (`features/messages/components/ConversationList.tsx`) | ConversationList renders its rows (`.messages-list__item`) itself. *(allowlist)* |
| `MessageBubble` | ConversationListItem.jsx | same name | `features/messages/components/MessageBubble.tsx` |  |
| `MessageComposer` | ConversationListItem.jsx | same name | `features/messages/components/MessageComposer.tsx` |  |
| `JoinRequestCard` | JoinRequestCard.jsx | different name | `RequestsModal` (`features/app/components/Home/RequestsModal.tsx`) | RequestsModal (`.requests-modal__card`) and Student Home (`.student-home__request-card`) build the request rows in place. *(allowlist)* |
| `MeetingCard` | MeetingCard.jsx | different name | `TeamMeetingCard` (`features/app/components/TAManagement/TeamMeetingCard.tsx`) | The TA pages' card for a team's weekly TA meeting (`.ta-card`). *(allowlist)* |
| `CHART_COLORS` | PieChartCard.jsx | same name | `features/app/components/TSRS/ContributionsTab.tsx` | in ContributionsTab |
| `PieChartCard` | PieChartCard.jsx | different name | `PieCharts` (`features/app/components/Roster/PieCharts.tsx`) | The design's SVG stand-in for recharts. The roster's PieCharts, the stats' ProjectMembershipChart and the TSR ContributionsTab draw their pies with recharts. *(allowlist)* |
| `BarChartCard` | PieChartCard.jsx | design-only | — | The design's SVG stand-in for a recharts bar chart, which no screen draws; the analytics bars are BarsBySprint and StackedBars. *(allowlist)* |
| `ProjectCard` | ProjectCard.jsx | different name | `ProjectGrid` (`features/app/components/Project/ProjectGrid.tsx`) | ProjectGrid renders each project tile (`.project-grid__card`) itself. *(allowlist)* |
| `RankedProjectSlot` | RankedProjectSlot.jsx | same name | `features/app/components/Interest/RankedProjectSlot.tsx` |  |
| `RosterRow` | RosterRow.jsx | different name | `RosterList` (`features/app/components/Roster/RosterList.tsx`) | RosterList renders the roster's table rows and phone cards itself. *(allowlist)* |
| `TSRForm` | TSRForm.jsx | different name | `TSRS` (`features/app/components/TSRS/TSRS.tsx`) | The TSR flow: TSRS steps through ContributionsTab, TeamFeedbackTab and ScrumMasterTab. *(allowlist)* |
| `TSRSummaryCard` | TSRSummaryCard.jsx | different name | `TSRView` (`features/app/components/TSRS/TSRView.tsx`) | Staff read the submissions in TSRView's tables. *(allowlist)* |
| `TeamMeetingForm` | TeamMeetingForm.jsx | same name | `features/app/components/TeamMeetings/TeamMeetingForm.tsx` |  |
| `TeamMeetingsList` | TeamMeetingsList.jsx | same name | `features/app/components/TeamMeetings/TeamMeetingsList.tsx` |  |
| `TEAM_MEETING_TITLE_MAX` | TeamMeetingsModel.jsx | same name | `features/app/components/TeamMeetings/teamMeetingsModel.ts` | in teamMeetingsModel |
| `TEAM_MEETING_NOTE_MAX` | TeamMeetingsModel.jsx | same name | `features/app/components/TeamMeetings/teamMeetingsModel.ts` | in teamMeetingsModel |
| `TEAM_MEETING_DEFAULT_DURATION` | TeamMeetingsModel.jsx | same name | `features/app/components/TeamMeetings/teamMeetingsModel.ts` | in teamMeetingsModel |
| `TEAM_MEETING_DURATIONS` | TeamMeetingsModel.jsx | same name | `features/app/components/TeamMeetings/teamMeetingsModel.ts` | in teamMeetingsModel |
| `TeamMeetingsModel` | TeamMeetingsModel.jsx | same name | `features/app/components/TeamMeetings/teamMeetingsModel.ts` | in teamMeetingsModel |
| `TeamMemberCard` | TeamMemberCard.jsx | different name | `AdminMemberCard` (`features/app/components/EditProject/AdminMemberCard.tsx`) | Edit Project's member card (`.edit-project__member-card`), with the admin toggle. *(allowlist)* |
| `RoleSelect` | TeamMemberCard.jsx | different name | `TeamTab` (`features/app/components/EditProject/TeamTab.tsx`) | Edit Project assigns roles the other way round: TeamTab's selects (`.edit-project__select`) pick the member who is Product Owner or Scrum Master, and AdminMemberCard toggles admin. No screen changes one member's role from a dropdown. *(allowlist)* |
| `TypingIndicator` | TypingIndicator.jsx | different name | `MessagingSpotlight` (`features/landing/components/spotlights/MessagingSpotlight.tsx`) | Only the landing page's messaging spotlight draws typing dots, in place (`.msg-live__typing`); the app's messages show none. *(allowlist)* |

### `components/finalreviews/` (16)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `ZoomRoomField` | FinalReviewsHeader.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `FinalReviewsHeader` | FinalReviewsHeader.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `FinalReviewsIcon` | FinalReviewsIcon.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `SLOT_MINUTES` | FinalReviewsModel.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `SLOT_POST_MAX` | FinalReviewsModel.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `FR_LENSES` | FinalReviewsModel.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `FR_REASONS` | FinalReviewsModel.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `FinalReviewsModel` | FinalReviewsModel.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `PostSlotsDrawer` | PostSlotsDrawer.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `ReviewWorkspaceHeader` | ReviewWorkspaceHeader.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `SlotActionDialog` | SlotActionDialog.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `SlotBoard` | SlotBoard.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `SlotRow` | SlotRow.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `SlotTime` | SlotTime.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `TeamReview` | TeamReview.jsx | not ported | — | src/features/finalReviews/ does not exist yet |
| `UnbookedTeams` | UnbookedTeams.jsx | not ported | — | src/features/finalReviews/ does not exist yet |

### `components/marketing/` (15)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `AnnouncementPill` | AnnouncementPill.jsx | different name | `Hero` (`features/landing/components/Hero.tsx`) | Hero renders its announcement pill (`.hero__announce`) itself. *(allowlist)* |
| `ClosingBand` | ClosingBand.jsx | same name | `features/landing/components/ClosingBand.tsx` |  |
| `ContactCard` | ContactCard.jsx | same name | `features/landing/components/ContactCard.tsx` |  |
| `Eyebrow` | Eyebrow.jsx | different name | `Hero` (`features/landing/components/Hero.tsx`) | The eyebrows are markup in Hero (`.hero__eyebrow`) and ContactCard (`.contact-page__eyebrow`). *(allowlist)* |
| `MarketingBadge` | Eyebrow.jsx | different name | `Spotlight` (`features/landing/components/spotlights/Spotlight.tsx`) | Spotlight renders its New / Soon badge (`.spotlight__badge`) itself. *(allowlist)* |
| `FeatureColumn` | FeatureColumn.jsx | different name | `Solutions` (`features/landing/components/Solutions.tsx`) | Solutions renders its feature columns (`.feature-col`) and the app preview (`.preview-window`) itself. *(allowlist)* |
| `PreviewWindow` | FeatureColumn.jsx | different name | `Solutions` (`features/landing/components/Solutions.tsx`) | Solutions renders its feature columns (`.feature-col`) and the app preview (`.preview-window`) itself. *(allowlist)* |
| `FloatCard` | FloatCard.jsx | different name | `FloatingCards` (`features/landing/components/FloatingCards.tsx`) | FloatingCards renders each card (`.float-card`) itself. *(allowlist)* |
| `FloatingCards` | FloatCard.jsx | same name | `features/landing/components/FloatingCards.tsx` |  |
| `Hero` | Hero.jsx | same name | `features/landing/components/Hero.tsx` |  |
| `LandingFooter` | LandingFooter.jsx | different name | `Footer` (`features/landing/components/Footer.tsx`) | The landing page's footer is `features/landing/components/Footer.tsx` (`.landing-footer`). *(allowlist)* |
| `LandingHeader` | LandingHeader.jsx | different name | `Header` (`features/landing/components/Header.tsx`) | The landing page's header is `features/landing/components/Header.tsx` (`.landing-header`). *(allowlist)* |
| `Spotlight` | Spotlight.jsx | same name | `features/landing/components/spotlights/Spotlight.tsx` |  |
| `StageCard` | StageCard.jsx | same name | `features/landing/components/spotlights/StageCard.tsx` |  |
| `Stage` | StageCard.jsx | different name | `Spotlight` (`features/landing/components/spotlights/Spotlight.tsx`) | Spotlight renders the stage behind its cards (`.spotlight__stage`) itself. *(allowlist)* |

### `components/schedule/` (10)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `ScheduleDayHeader` | ScheduleDayHeader.jsx | same name | `features/schedule/components/ScheduleDayHeader.tsx` |  |
| `ScheduleDivider` | ScheduleDivider.jsx | not ported | — | They come with the Today's Schedule card and the /app/schedule agenda, which wait for GET /api/schedule. The rows are ported already: team meetings render ScheduleItem and ScheduleDayHeader. *(allowlist)* |
| `ScheduleIcon` | ScheduleItem.jsx | same name | `features/schedule/components/ScheduleIcon.tsx` |  |
| `ScheduleItem` | ScheduleItem.jsx | same name | `features/schedule/components/ScheduleItem.tsx` |  |
| `ScheduleList` | ScheduleList.jsx | not ported | — | They come with the Today's Schedule card and the /app/schedule agenda, which wait for GET /api/schedule. The rows are ported already: team meetings render ScheduleItem and ScheduleDayHeader. *(allowlist)* |
| `SCHOOL_ZONE` | ScheduleModel.jsx | same name | `features/schedule/scheduleModel.ts` | in scheduleModel |
| `JOIN_WINDOW_MS` | ScheduleModel.jsx | same name | `features/schedule/scheduleModel.ts` | in scheduleModel |
| `COUNTDOWN_DAYS` | ScheduleModel.jsx | same name | `features/schedule/scheduleModel.ts` | in scheduleModel |
| `SCHEDULE_KINDS` | ScheduleModel.jsx | different name | `KINDS` (`features/schedule/scheduleModel.ts`) | `scheduleModel.ts` keeps the kind palette private as KINDS and hands it out through kindMeta(). *(allowlist)* |
| `ScheduleModel` | ScheduleModel.jsx | same name | `features/schedule/scheduleModel.ts` | in scheduleModel |

### `components/scrum/` (19)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `AIDraftButton` | AIDraftButton.jsx | not ported | — | AI drafting is off in the web client, and `scrum.scss` leaves out `.gt-aidraft` until it returns. *(allowlist)* |
| `BacklogRow` | BacklogRow.jsx | same name | `features/scrum/components/BacklogRow.tsx` |  |
| `BurnupChart` | BurnupChart.jsx | same name | `features/scrum/components/BurnupChart.tsx` |  |
| `MarkdownText` | CommentThread.jsx | same name | `components/Markdown/MarkdownText.tsx` | taken over by the kit |
| `CommentThread` | CommentThread.jsx | same name | `features/scrum/components/CommentThread.tsx` |  |
| `MentionListbox` | MentionListbox.jsx | not ported | — | Comments have no @mentions yet (issue #191); the composer is a plain textarea. *(allowlist)* |
| `PointsChip` | PointsChip.jsx | same name | `Chips` (`features/scrum/components/Chips.tsx`) | The four chips share `features/scrum/components/Chips.tsx`; the design groups them in `scrum/PointsChip.jsx`. *(allowlist)* |
| `EstimateChip` | PointsChip.jsx | same name | `Chips` (`features/scrum/components/Chips.tsx`) | The four chips share `features/scrum/components/Chips.tsx`; the design groups them in `scrum/PointsChip.jsx`. *(allowlist)* |
| `PRLinkChip` | PointsChip.jsx | same name | `Chips` (`features/scrum/components/Chips.tsx`) | The four chips share `features/scrum/components/Chips.tsx`; the design groups them in `scrum/PointsChip.jsx`. *(allowlist)* |
| `UserPair` | PointsChip.jsx | same name | `Chips` (`features/scrum/components/Chips.tsx`) | The four chips share `features/scrum/components/Chips.tsx`; the design groups them in `scrum/PointsChip.jsx`. *(allowlist)* |
| `ESTIMATE_SCALES` | ScalePicker.jsx | same name | `features/scrum/config/scrumTags.ts` | in scrumTags |
| `ScalePicker` | ScalePicker.jsx | same name | `features/scrum/components/ScalePicker.tsx` |  |
| `PointPicker` | ScalePicker.jsx | same name | `features/scrum/components/ScalePicker.tsx` | in ScalePicker |
| `BOARD_COLUMNS` | ScrumBoard.jsx | same name | `features/scrum/config/scrumTags.ts` | in scrumTags |
| `ScrumBoard` | ScrumBoard.jsx | same name | `features/scrum/components/ScrumBoard.tsx` |  |
| `StoryCard` | StoryCard.jsx | same name | `features/scrum/components/StoryCard.tsx` |  |
| `TASK_TAGS` | TagBadge.jsx | same name | `features/scrum/config/scrumTags.ts` | in scrumTags |
| `TagBadge` | TagBadge.jsx | same name | `features/scrum/components/TagBadge.tsx` |  |
| `TaskCard` | TaskCard.jsx | same name | `features/scrum/components/TaskCard.tsx` |  |

### `components/search/` (11)

| Export | Design file | Status | Codebase | Note |
| --- | --- | --- | --- | --- |
| `CommandPalette` | CommandPalette.jsx | same name | `features/search/components/CommandPalette.tsx` |  |
| `EntityIcon` | EntityIcon.jsx | same name | `features/search/components/EntityIcon.tsx` |  |
| `Kbd` | Kbd.jsx | same name | `features/search/components/Kbd.tsx` |  |
| `ModKey` | Kbd.jsx | design-only | — | The bundle's capitalized alias of modKey(), since only capitalized exports reach its namespace. The codebase keeps modKey in `features/search/format.ts`. *(allowlist)* |
| `MatchText` | MatchText.jsx | same name | `features/search/components/MatchText.tsx` |  |
| `ResultRow` | ResultRow.jsx | same name | `features/search/components/ResultRow.tsx` |  |
| `ResultGroup` | ResultRow.jsx | same name | `features/search/components/ResultRow.tsx` | in ResultRow |
| `SEARCH_ENTITIES` | SearchModel.jsx | same name | `features/search/searchModel.ts` | in searchModel |
| `SearchModel` | SearchModel.jsx | same name | `features/search/searchModel.ts` | in searchModel |
| `SearchPagination` | SearchPagination.jsx | same name | `features/search/components/SearchPagination.tsx` |  |
| `SearchTrigger` | SearchTrigger.jsx | same name | `features/search/components/SearchTrigger.tsx` |  |

## Different names (the codebase keeps its name)

34 exports. Each line gives the design export, then the name the codebase keeps and where it is.

- `SidebarNavItem` (`navigation/SidebarNavItem.jsx`) → **Sidebar** (`features/app/components/Layout/Sidebar.tsx`): The app's sidebar is their one consumer and renders its rows (`.sidebar-item`) and section titles (`.section-title`) itself.
- `SidebarSectionTitle` (`navigation/SidebarNavItem.jsx`) → **Sidebar** (`features/app/components/Layout/Sidebar.tsx`): The app's sidebar is their one consumer and renders its rows (`.sidebar-item`) and section titles (`.section-title`) itself.
- `RANGE_PRESETS` (`analytics/AnalyticsFilterRow.jsx`) → **CHIPS** (`features/analytics/components/AnalyticsFilterRow.tsx`): AnalyticsFilterRow's preset chips ({ preset, label }), private to the file; the dashboard hook checks the URL against its own PRESETS.
- `BREAKDOWN_COLUMNS` (`analytics/BreakdownTable.jsx`) → **breakdownColumns** (`features/analytics/components/BreakdownTable.tsx`): BreakdownTable builds both column sets with breakdownColumns(kind), which the page's CSV export shares.
- `TEAM_BREAKDOWN_COLUMNS` (`analytics/BreakdownTable.jsx`) → **breakdownColumns** (`features/analytics/components/BreakdownTable.tsx`): BreakdownTable builds both column sets with breakdownColumns(kind), which the page's CSV export shares.
- `ChartCardTool` (`analytics/ChartCard.jsx`) → **Button** (`components/Button/Button.tsx`): Analytics builds its tool buttons itself (`.gt-analytics__toggle` and `.gt-analytics__refresh` in AnalyticsPage, `.gt-table__export` in BreakdownTable); they become Button (pressed, outline) when analytics moves onto the kit.
- `ChartCardCheck` (`analytics/ChartCard.jsx`) → **Checkbox** (`components/Checkbox/Checkbox.tsx`): AnalyticsPage builds the Compare check itself (`.gt-analytics__check`); it becomes Checkbox when analytics moves onto the kit.
- `ChartEmptyState` (`analytics/ChartEmptyState.jsx`) → **EmptyState** (`components/EmptyState/EmptyState.tsx`): ChartCard renders the kit's EmptyState (variant="card").
- `ChartFormat` (`analytics/ChartTooltip.jsx`) → **analyticsFormat** (`features/analytics/utils/analyticsFormat.ts`): The format helpers live in `utils/analyticsFormat.ts` (percent, weekLabel, dateLabel, rangeLabel) and the scale in `utils/chartGeometry.ts`.
- `DefinitionPopover` (`analytics/DefinitionPopover.jsx`) → **InfoPopover** (`components/InfoPopover/InfoPopover.tsx`): Promoted into the kit as InfoPopover, which ChartCard renders.
- `BOARD_STATUSES` (`analytics/StackedBars.jsx`) → **STATUS_LABEL** (`features/analytics/components/StackedBars.tsx`): StackedBars keeps the board statuses as ORDER and STATUS_LABEL, private to the file.
- `StatTile` (`analytics/StatTile.jsx`) → **StatCard** (`components/StatCard/StatCard.tsx`): The analytics tiles render the kit's StatCard with `compact`.
- `AssignmentCard` (`domain/AssignmentCard.jsx`) → **StudentHomeDashboard** (`features/app/components/Home/StudentHomeDashboard.tsx`): Student Home builds its deadline rows in place (`.student-home__deadline-row`, the design's five statuses), and StudentAssignmentsTable its table rows.
- `ConversationListItem` (`domain/ConversationListItem.jsx`) → **ConversationList** (`features/messages/components/ConversationList.tsx`): ConversationList renders its rows (`.messages-list__item`) itself.
- `JoinRequestCard` (`domain/JoinRequestCard.jsx`) → **RequestsModal** (`features/app/components/Home/RequestsModal.tsx`): RequestsModal (`.requests-modal__card`) and Student Home (`.student-home__request-card`) build the request rows in place.
- `MeetingCard` (`domain/MeetingCard.jsx`) → **TeamMeetingCard** (`features/app/components/TAManagement/TeamMeetingCard.tsx`): The TA pages' card for a team's weekly TA meeting (`.ta-card`). The design keeps `MeetingCard`: "team meeting" means the one-off kind, so the codebase card takes a TA-meeting name when the TA pages move onto the kit.
- `PieChartCard` (`domain/PieChartCard.jsx`) → **PieCharts** (`features/app/components/Roster/PieCharts.tsx`): The design's SVG stand-in for recharts. The roster's PieCharts, the stats' ProjectMembershipChart and the TSR ContributionsTab draw their pies with recharts.
- `ProjectCard` (`domain/ProjectCard.jsx`) → **ProjectGrid** (`features/app/components/Project/ProjectGrid.tsx`): ProjectGrid renders each project tile (`.project-grid__card`) itself.
- `RosterRow` (`domain/RosterRow.jsx`) → **RosterList** (`features/app/components/Roster/RosterList.tsx`): RosterList renders the roster's table rows and phone cards itself.
- `TSRForm` (`domain/TSRForm.jsx`) → **TSRS** (`features/app/components/TSRS/TSRS.tsx`): The TSR flow: TSRS steps through ContributionsTab, TeamFeedbackTab and ScrumMasterTab.
- `TSRSummaryCard` (`domain/TSRSummaryCard.jsx`) → **TSRView** (`features/app/components/TSRS/TSRView.tsx`): Staff read the submissions in TSRView's tables.
- `TeamMemberCard` (`domain/TeamMemberCard.jsx`) → **AdminMemberCard** (`features/app/components/EditProject/AdminMemberCard.tsx`): Edit Project's member card (`.edit-project__member-card`), with the admin toggle. The design keeps the broader name, and the codebase card takes it when Edit Project's Team tab moves onto the kit.
- `RoleSelect` (`domain/TeamMemberCard.jsx`) → **TeamTab** (`features/app/components/EditProject/TeamTab.tsx`): Edit Project assigns roles the other way round: TeamTab's selects (`.edit-project__select`) pick the member who is Product Owner or Scrum Master, and AdminMemberCard toggles admin. No screen changes one member's role from a dropdown.
- `TypingIndicator` (`domain/TypingIndicator.jsx`) → **MessagingSpotlight** (`features/landing/components/spotlights/MessagingSpotlight.tsx`): Only the landing page's messaging spotlight draws typing dots, in place (`.msg-live__typing`); the app's messages show none.
- `AnnouncementPill` (`marketing/AnnouncementPill.jsx`) → **Hero** (`features/landing/components/Hero.tsx`): Hero renders its announcement pill (`.hero__announce`) itself.
- `Eyebrow` (`marketing/Eyebrow.jsx`) → **Hero** (`features/landing/components/Hero.tsx`): The eyebrows are markup in Hero (`.hero__eyebrow`) and ContactCard (`.contact-page__eyebrow`).
- `MarketingBadge` (`marketing/Eyebrow.jsx`) → **Spotlight** (`features/landing/components/spotlights/Spotlight.tsx`): Spotlight renders its New / Soon badge (`.spotlight__badge`) itself.
- `FeatureColumn` (`marketing/FeatureColumn.jsx`) → **Solutions** (`features/landing/components/Solutions.tsx`): Solutions renders its feature columns (`.feature-col`) and the app preview (`.preview-window`) itself.
- `PreviewWindow` (`marketing/FeatureColumn.jsx`) → **Solutions** (`features/landing/components/Solutions.tsx`): Solutions renders its feature columns (`.feature-col`) and the app preview (`.preview-window`) itself.
- `FloatCard` (`marketing/FloatCard.jsx`) → **FloatingCards** (`features/landing/components/FloatingCards.tsx`): FloatingCards renders each card (`.float-card`) itself.
- `LandingFooter` (`marketing/LandingFooter.jsx`) → **Footer** (`features/landing/components/Footer.tsx`): The landing page's footer is `features/landing/components/Footer.tsx` (`.landing-footer`). Kept for good, with LandingHeader.
- `LandingHeader` (`marketing/LandingHeader.jsx`) → **Header** (`features/landing/components/Header.tsx`): The landing page's header is `features/landing/components/Header.tsx` (`.landing-header`). Kept for good: the design's name says which header, and the app shell has a Header of its own.
- `Stage` (`marketing/StageCard.jsx`) → **Spotlight** (`features/landing/components/spotlights/Spotlight.tsx`): Spotlight renders the stage behind its cards (`.spotlight__stage`) itself.
- `SCHEDULE_KINDS` (`schedule/ScheduleModel.jsx`) → **KINDS** (`features/schedule/scheduleModel.ts`): `scheduleModel.ts` keeps the kind palette private as KINDS and hands it out through kindMeta().

## NAMES_ALLOWLIST

45 entries: 41 for design exports and 4 for codebase-only paths. The list lives in `frontend/scripts/names.mjs`. Remove an entry once the design catches up; the check warns about it then.

| Entry | Status | Codebase keeps | Reason |
| --- | --- | --- | --- |
| `Combobox`, `FileUpload`, `MarkdownEditor`, `Stepper` | not ported | — | The composites join the kit after the final-review screens. Until then the screens keep their own pickers, file inputs and Markdown editors, and the TSR flow its TsrsStepper. |
| `Pagination` | design-only | — | No screen pages through numbered pages; search has its own pager, SearchPagination. |
| `SidebarNavItem`, `SidebarSectionTitle` | different name | `Sidebar` | The app's sidebar is their one consumer and renders its rows (`.sidebar-item`) and section titles (`.section-title`) itself. |
| `components/ErrorBoundary` | codebase-only | — | The error boundary `App.tsx` puts around the routes has no design counterpart. |
| `components/Markdown` | codebase-only | — | Holds MarkdownText, which the design keeps in `scrum/CommentThread.jsx`. Scrum's comments and story modal, the project page and the landing page's issue card render Markdown through it. |
| `components/Skeleton/TableSkeleton.tsx` | codebase-only | — | The loading state of the app's own `*-list` tables (RosterList, ProjectList, Modules, Assignments). The kit's Table draws its Skeleton rows itself. |
| `components/Table/SortableHeader.tsx` | codebase-only | — | The header cell of the design's Table, split out so that a table of its own can sort with useTableSort. The design keeps it inside `display/Table.jsx`. |
| `RANGE_PRESETS` | different name | `CHIPS` | AnalyticsFilterRow's preset chips ({ preset, label }), private to the file; the dashboard hook checks the URL against its own PRESETS. |
| `BREAKDOWN_COLUMNS`, `TEAM_BREAKDOWN_COLUMNS` | different name | `breakdownColumns` | BreakdownTable builds both column sets with breakdownColumns(kind), which the page's CSV export shares. |
| `BOARD_STATUSES` | different name | `STATUS_LABEL` | StackedBars keeps the board statuses as ORDER and STATUS_LABEL, private to the file. |
| `ChartCardTool` | different name | `Button` | Analytics builds its tool buttons itself (`.gt-analytics__toggle` and `.gt-analytics__refresh` in AnalyticsPage, `.gt-table__export` in BreakdownTable); they become Button (pressed, outline) when analytics moves onto the kit. |
| `ChartCardCheck` | different name | `Checkbox` | AnalyticsPage builds the Compare check itself (`.gt-analytics__check`); it becomes Checkbox when analytics moves onto the kit. |
| `ChartEmptyState` | different name | `EmptyState` | ChartCard renders the kit's EmptyState (variant="card"). |
| `ChartFormat` | different name | `analyticsFormat` | The format helpers live in `utils/analyticsFormat.ts` (percent, weekLabel, dateLabel, rangeLabel) and the scale in `utils/chartGeometry.ts`. |
| `DefinitionPopover` | different name | `InfoPopover` | Promoted into the kit as InfoPopover, which ChartCard renders. |
| `StatTile` | different name | `StatCard` | The analytics tiles render the kit's StatCard with `compact`. |
| `TimelinessBars`, `TIMELINESS_BUCKETS`, `TIMELINESS_COLUMNS`, `OnTimeMeter` | not ported | — | Timeliness ships with analytics' sub-project C; the first release has none of it. |
| `AnalyticsIcon` | design-only | — | Lucide-shaped glyphs for the design bundle; the codebase imports lucide-react. |
| `AssignmentCard` | different name | `StudentHomeDashboard` | Student Home builds its deadline rows in place (`.student-home__deadline-row`, the design's five statuses), and StudentAssignmentsTable its table rows. |
| `ConversationListItem` | different name | `ConversationList` | ConversationList renders its rows (`.messages-list__item`) itself. |
| `JoinRequestCard` | different name | `RequestsModal` | RequestsModal (`.requests-modal__card`) and Student Home (`.student-home__request-card`) build the request rows in place. |
| `MeetingCard` | different name | `TeamMeetingCard` | The TA pages' card for a team's weekly TA meeting (`.ta-card`). The design keeps MeetingCard: "team meeting" means the one-off kind, so the codebase card takes a TA-meeting name when the TA pages move onto the kit. |
| `PieChartCard` | different name | `PieCharts` | The design's SVG stand-in for recharts. The roster's PieCharts, the stats' ProjectMembershipChart and the TSR ContributionsTab draw their pies with recharts. |
| `BarChartCard` | design-only | — | The design's SVG stand-in for a recharts bar chart, which no screen draws; the analytics bars are BarsBySprint and StackedBars. |
| `ProjectCard` | different name | `ProjectGrid` | ProjectGrid renders each project tile (`.project-grid__card`) itself. |
| `RosterRow` | different name | `RosterList` | RosterList renders the roster's table rows and phone cards itself. |
| `TSRForm` | different name | `TSRS` | The TSR flow: TSRS steps through ContributionsTab, TeamFeedbackTab and ScrumMasterTab. |
| `TSRSummaryCard` | different name | `TSRView` | Staff read the submissions in TSRView's tables. |
| `TeamMemberCard` | different name | `AdminMemberCard` | Edit Project's member card (`.edit-project__member-card`), with the admin toggle. The design keeps the broader name, and the codebase card takes it when Edit Project's Team tab moves onto the kit. |
| `RoleSelect` | different name | `TeamTab` | Edit Project assigns roles the other way round: TeamTab's selects (`.edit-project__select`) pick the member who is Product Owner or Scrum Master, and AdminMemberCard toggles admin. No screen changes one member's role from a dropdown. |
| `TypingIndicator` | different name | `MessagingSpotlight` | Only the landing page's messaging spotlight draws typing dots, in place (`.msg-live__typing`); the app's messages show none. |
| `AnnouncementPill` | different name | `Hero` | Hero renders its announcement pill (`.hero__announce`) itself. |
| `Eyebrow` | different name | `Hero` | The eyebrows are markup in Hero (`.hero__eyebrow`) and ContactCard (`.contact-page__eyebrow`). |
| `MarketingBadge` | different name | `Spotlight` | Spotlight renders its New / Soon badge (`.spotlight__badge`) itself. |
| `FeatureColumn`, `PreviewWindow` | different name | `Solutions` | Solutions renders its feature columns (`.feature-col`) and the app preview (`.preview-window`) itself. |
| `FloatCard` | different name | `FloatingCards` | FloatingCards renders each card (`.float-card`) itself. |
| `Stage` | different name | `Spotlight` | Spotlight renders the stage behind its cards (`.spotlight__stage`) itself. |
| `LandingHeader` | different name | `Header` | The landing page's header is `features/landing/components/Header.tsx` (`.landing-header`). Kept for good: the design's name says which header, and the app shell has a Header of its own. |
| `LandingFooter` | different name | `Footer` | The landing page's footer is `features/landing/components/Footer.tsx` (`.landing-footer`). Kept for good, with LandingHeader. |
| `ScheduleList`, `ScheduleDivider` | not ported | — | They come with the Today's Schedule card and the /app/schedule agenda, which wait for GET /api/schedule. The rows are ported already: team meetings render ScheduleItem and ScheduleDayHeader. |
| `SCHEDULE_KINDS` | different name | `KINDS` | `scheduleModel.ts` keeps the kind palette private as KINDS and hands it out through kindMeta(). |
| `PointsChip`, `EstimateChip`, `PRLinkChip`, `UserPair` | same name | `Chips` | The four chips share `features/scrum/components/Chips.tsx`; the design groups them in `scrum/PointsChip.jsx`. |
| `AIDraftButton` | not ported | — | AI drafting is off in the web client, and `scrum.scss` leaves out `.gt-aidraft` until it returns. |
| `MentionListbox` | not ported | — | Comments have no @mentions yet (issue #191); the composer is a plain textarea. |
| `ModKey` | design-only | — | The bundle's capitalized alias of modKey(), since only capitalized exports reach its namespace. The codebase keeps modKey in `features/search/format.ts`. |

## For the next design round

The codebase's names win. Each change below lets an allowlist entry go, and the check warns once an entry goes stale.

**Rename or replace (the codebase has a component of its own for the same thing)**

1. `analytics/StatTile`: drop it and render `StatCard` with `compact`.
2. `analytics/DefinitionPopover`: drop it and render `InfoPopover`.
3. `analytics/ChartEmptyState`: drop it and render `EmptyState` with `variant="card"`.
4. `ChartCardTool` → `Button` (`pressed` for the Table toggles, `outline` for Refresh and Export CSV), and
   `ChartCardCheck` → `Checkbox`. The codebase moves analytics onto both when the analytics screens adopt the kit.

**Move (same names, other files)**

5. `MarkdownText`: out of `scrum/CommentThread.jsx` and into the kit, in a file named `Markdown.jsx` (for example
   `display/Markdown.jsx`). The codebase has it at `components/Markdown/MarkdownText.tsx`, and the check takes that home
   once the design groups it so.
6. `SortableHeader`, with `useTableSort` beside it: export them from `display/Table.jsx`, which already draws that
   header cell. The codebase ships both in `components/Table/`.
7. `scrum/PointsChip.jsx` → `scrum/Chips.jsx` (PointsChip, EstimateChip, PRLinkChip, UserPair), after
   `features/scrum/components/Chips.tsx`.
8. Optional: give `Skeleton` a file of its own (`feedback/Skeleton.jsx`), as the codebase has `components/Skeleton/`.
   The check passes either way.

**Keep the design's name (the codebase has none to rename to)**

- Built in place inside a larger codebase component, with no name of its own:

  | Design export | Built inside |
  | --- | --- |
  | AnnouncementPill, Eyebrow | Hero |
  | MarketingBadge, Stage | Spotlight |
  | FeatureColumn, PreviewWindow | Solutions |
  | FloatCard | FloatingCards |
  | AssignmentCard | StudentHomeDashboard |
  | ConversationListItem | ConversationList |
  | JoinRequestCard | RequestsModal |
  | ProjectCard | ProjectGrid |
  | RosterRow | RosterList |
  | TSRForm | TSRS |
  | TSRSummaryCard | TSRView |
  | PieChartCard | PieCharts |
  | TypingIndicator | MessagingSpotlight |
  | SidebarNavItem, SidebarSectionTitle | Sidebar |

  The design's split is finer than the codebase's, and the allowlist records each pair.
- Constants and namespaces that the codebase keeps private under shorter names, or as lowercase helpers:

  | Design export | Codebase |
  | --- | --- |
  | RANGE_PRESETS | `CHIPS` |
  | BREAKDOWN_COLUMNS, TEAM_BREAKDOWN_COLUMNS | `breakdownColumns()` |
  | BOARD_STATUSES | `ORDER` and `STATUS_LABEL` |
  | SCHEDULE_KINDS | `KINDS` |
  | ChartFormat | `analyticsFormat.ts` |
  | ModKey | `modKey()` |

  The bundle needs unique capitalized names. `ORDER` and `KINDS` are file-private words that would collide or say
  little there.
- RoleSelect: Edit Project assigns roles the other way round, with one select per role that picks a member. No codebase
  name fits. To match the screen, draw TeamTab's Product Owner and Scrum Master pickers instead.
- Kept on purpose (decided 2026-10-22):
  - `LandingHeader` and `LandingFooter`, for good. They say which header and footer, and the app shell has a `Header`
    of its own.
  - `MeetingCard`. The codebase's `TeamMeetingCard` is the TA pages' card for a weekly *TA meeting*, and "team meeting"
    means the one-off kind, so the codebase card takes a TA-meeting name when the TA pages move onto the kit.
  - `TeamMemberCard`, the broader name for one member's card. The codebase's `AdminMemberCard` takes it when Edit
    Project's Team tab moves onto the kit.

**Documentation in `design/`**

- PORTING.md's "Known deltas" says `lint:design` runs two checks. It runs three now (`frontend/scripts/names.mjs`).
- PORTING.md's feature map sends `components/domain/TeamMeetings*` to `EditProject/MeetingsTab.tsx` and
  `features/project/teamMeetingsModel.ts`. The code is in `features/app/components/TeamMeetings/`
  (`TeamMeetingForm.tsx`, `TeamMeetingsList.tsx`, `teamMeetingsModel.ts`).

**Coming from the codebase side (no design action yet).** When analytics moves onto the kit, `LivePill` becomes
`Badge status="live"` and `UnitToggle` becomes a `SegmentedControl`. The check will then warn for both, and the design
can drop them in that round.

## Decided (2026-10-22)

1. **MeetingCard and TeamMeetingCard.** The design keeps `MeetingCard`. The codebase's `TeamMeetingCard` (the TA pages)
   is a card for a team's weekly *TA meeting*, and AGENTS.md's vocabulary keeps "team meeting" for the one-off kind,
   which the design's `TeamMeetingForm` and `TeamMeetingsList` already mean. So the codebase card takes a TA-meeting
   name when the TA pages move onto the kit, and the allowlist records the pair until then.
2. **LandingHeader and LandingFooter.** The design keeps both names for good. They match the blocks on both sides
   (`gt-landing-header`, `landing-header`), and the app shell has a `Header` of its own. The allowlist keeps the pair.
3. **TeamMemberCard and AdminMemberCard.** They are the same unit, one member's card. The design keeps the broader
   `TeamMemberCard`, and the codebase card takes it when Edit Project's Team tab moves onto the kit.
4. **CHART_COLORS.** Same name, different palette. The design's `PieChartCard.jsx` goes green, blue, then #54B999,
   #B26A00, #7D3C98 and #8A8A8A; the TSR `ContributionsTab.tsx` goes green, blue, then #F59E0B, #EF4444, #8B5CF6 and
   #EC4899. This isn't a naming problem: the TSR screens take the design's palette when they move onto the kit.
