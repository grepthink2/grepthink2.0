# Shared UI components — inventory (appendix, 2026-10-19)

Appendix to `2026-10-19-shared-ui-components-design.md`. It records where the app hand-rolls each element the
design system treats as a shared component, as found on beta at `b6fff628` on 2026-10-19 by four read-only
sweeps (a tag-aware scanner over the non-test TSX, a nesting-aware scan of the SCSS, and hand checks). Counts are
JSX render sites, not rendered instances. All paths are under `frontend/src/` unless they say otherwise
(`$APP` = `features/app/components`, `$PG` = `features/app/pages`). Line numbers drift; treat them as pointers.

## 1. Buttons and icon buttons

### `<button>` elements
- 385 JSX <button> in 129 non-test TSX files. type: "button" 327, "submit" 12, missing 46 (2 via spread in AnalyticsFilterRow:122,131; 44 default to submit — none inside a <form> today, so the risk is latent).
- 9 with no className (7 styled via parent/spread; ErrorBoundary.tsx:59,62 only the global button{} rule).
- aria-pressed 23, aria-expanded 13. role="button" non-buttons 5 (all with tabIndex + key handler): StudentHomeDashboard:778 (tr), NonSubmittersList:29, MyClasses:280, ConversationList:152 (li), scrum TaskCard:25.
- Top files: Roster/InviteModal 15; scrum/StoryModal 12; Layout/Header 11; pages/FinalReviews 10; TeamMeetings/TeamMeetingsList 10; pages/FinalReviewDetail 9; Project/ProjectView 9; Project/MemberManagerModal 9; Modules/AssignmentEditorModal 9; scrum/TaskEditorModal 8; EditProject/EditProjectModal 8; Classes/ClassSettingsModal 8; pages/Settings 7; pages/MyClasses 7; Home/StudentHomeDashboard 7; Roster/RosterList 6; Modules/CreateAssignmentModal 6; Home/RequestsModal 6; then 5s (Login, SignUp, TeamMeetingCard, ControlBar, CreateClassModal), 4s (CommandPalette, ScrumBoardPage, ResetPassword, TAManagement, Dashboard, TSRView, InstructorHomeDashboard, AnalyticsPage); 18 files with 3; 38 with 2; 42 with 1.
- Tests: 139 test files; 56 use *ByRole('button') (581 calls); 28 use *ByLabelText; only 3 coupled to button classes (TeamMeetingsList.test:283 .gt-button__spinner; scheduleComponents.test:115 gt-sched-item__action--primary; Settings.email.test:131,133,170 settings-modal__nav-item--active). 14 reference aria-busy; 5 assert busy text.

### SCSS styling buttons
- index.css:51-61 bare `button { border-radius: 8px; padding: 0.6em 1.2em; background: var(--gt-surface-muted); font-weight: 500 }` applies to every button that doesn't override. No global button:disabled.
- No button mixin. gt-press used 6x (Messages.scss:654, FinalReviews.scss:185,226,341, FinalReviewDetail.scss:31,212). gt-spinner used 5x (scrum only). $button-secondary(-hover), $disabled-bg #ccc exist.
- 87 SCSS files style a <button> (80 action/icon).

| Group (closest design variant) | classes | files |
|---|---|---|
| (a) primary green fill | 56 (+6 on links) | 50 |
| (b) secondary grey fill | 11 | 10 |
| (b') OUTLINE white/transparent + 1px border (no design variant; closest secondary) | 49 | 33 |
| (c) ghost/text/link | 42 | 30 |
| (d) danger (5 solid, 10 red text/outline/soft/hover) | 15 | 13 |
| (e) icon-only | 63 | 45 |
| tonal green (soft/selected) — no design equivalent | 5 | 5 |
| other fills (accent blue, purple, amber, dark) | 4 | 3 |
| base/size-only | 27 | 25 |
| non-Button controls on <button> (tabs, segmented, toggles, chips, menu items, rows, triggers) | 102 | 38 |

Solid danger fills: RequestsModal.scss:304, StudentHomeDashboard.scss:592, AssignmentEditorModal.scss:376, teamMeetings.scss:41, StoryModal.scss:341.
Other fills: student-home__toolbar-btn--join/--messages, member-manager__done (dark), gt-asst-report__review.

Global collisions (the same class declared in several files; the last stylesheet loaded wins):
- .tsrs-btn: Interest/InterestForm.scss:4 (10px 28px) vs TSRS/ContributionsTab.scss:252 (8px 24px).
- .buttonRectangle x5 (auth SignUp:150, ForgotPassword:91, Login:169, ResetPassword:142, AccountDetails:112); .authButton x3 (SignUp:179, VerifyEmail:82, Login:198); .eyeToggle x3.
- .add-assignment-btn (Modules/AddAssignmentButton.scss:3) reused by ProjectActionButton:32, InstructorHomeDashboard:246, MyClasses:375,378,386, and @use'd into MyClasses.scss:2 (emitted twice).

Per-file button classes. Tags: P primary, S grey secondary, O outline, G ghost/text/link, D danger, I icon-only,
T tonal, X other fill, B base or size-only, ctl a non-Button control. A modifier in brackets belongs to the class
before it.
- components/Toast/Toast.scss: G gt-toast__action, I gt-toast__dismiss. components/Menu/Menu.scss: ctl gt-menu__item.
- features/analytics/analytics.scss: O gt-analytics__refresh, O gt-table__export, P gt-filter__apply, I gt-definition__trigger; ctl toggle, unit-toggle, legend, stack, filter chips, table sort.
- $APP/Assignments/StudentAssignmentsTable.scss: B student-assignments__action-btn (--start P, --edit_submission T, --closed S, --opens_later S).
- $APP/Assistant/Assistant.scss: B gt-asst__btn (--ok P, --no G), G gt-asst__link, X gt-asst-report__review.
- $APP/Classes/ClassSettingsModal.scss: I __close-button, O __export-button, B __save-button, G __text-button, D __delete-button; ctl __status-pill.
- $APP/Classes/CreateClassModal.scss: I __close-button, O __cancel-button, P __submit-button, G __retry; ctl __term-button.
- $APP/Classes/JoinClassModal.scss: I join-class-modal__close (also used by ChangeEmailModal and EduVerifyModal).
- $APP/EditProject/EditProjectModal.scss: I edit-project__close, G __logo-change, G __logo-remove, B __btn (--save P, --secondary O, --delete D); ctl __tab, __toggle.
- $APP/Feedback/FeedbackForm.scss: B __btn (--primary P, --secondary S), P __submit.
- $APP/Fields/DatePickerField.scss: P dpf__confirm-btn, G `.rdp-nav button`; ctl dpf__trigger.
- $APP/Home/InstructorHomeDashboard.scss: I __alert-dismiss, B __create-btn; ctl __alert-main, __class-row.
- $APP/Home/RequestsModal.scss: I __close, B __btn (--accept P, --decline D); ctl __tab.
- $APP/Home/StudentHomeDashboard.scss: B __toolbar-btn (--browse P, --join X, --messages X), G __link, P __btn-accept, D __btn-deny.
- $APP/Interest/InterestForm.scss: B tsrs-btn (--primary P, --secondary S), I if-slot__clear, I if-pill__remove; ctl if-dropdown-list__item, if-toggle.
- $APP/Layout/Header.scss: I app-header__icon-button, __menu-button, __profile-button, __notification-dismiss; G __breadcrumb-link, __mark-all-read; ctl access pill, dropdown items, school toggle and options, notification body.
- $APP/Layout/PreviewBanner.scss: O preview-banner__exit. $APP/Layout/Sidebar.scss: ctl class selector, sidebar-item.
- $APP/Modules/AddAssignmentButton.scss: P add-assignment-btn. $APP/Modules/AssignmentList.scss: G title link, G edit-btn.
- $APP/Modules/AssignmentEditorModal.scss: I aem__close-btn, G __remove-window-btn, O __cancel-btn, P __save-btn, O __delete-btn, D __delete-confirm-btn, O __delete-cancel-btn; ctl __status-card.
- $APP/Modules/CreateAssignmentModal.scss: I __close-button, O __cancel-button, P __submit-button; ctl __template-button, __status-card.
- $APP/Overlays/ConfirmModal.scss: I __close, B __button (--cancel O, --confirm P).
- $APP/Project/AddProjectButton.scss, ProjectActionButton.scss: B (empty rules).
- $APP/Project/Assign: Assign.scss O __back-btn, P __save-btn; FocusedProjectCard.scss O __seat-btn (--primary P); Staffing.scss P __continue-btn; StaffingTable.scss I __step-btn; StudentDropSlot.scss I __remove; StudentListItem.scss I __quick-add; ViewToggle.scss I view-toggle__btn; ProjectSearchBar.scss ctl item.
- $APP/Project/MemberManagerModal.scss: I __close, B __btn (--accept P, --invite P, --decline O, --message O, --remove D on hover, --unsend D, --invited T), X __done (dark fill); ctl __tab.
- $APP/Project/ProjectList.scss: I preview-btn. ProjectMembersPopover.scss: O __copy (--copied T). ProjectView.scss: P __request-button (--requested P, --unsend D, --danger D). RequestModal.scss: I __close, B __button (--cancel O, --submit P).
- $APP/Roster: AddStudentModal.scss I __close, B __btn (--cancel O, --add P); ControlBar.scss B __btn (--invite P, --upload O, --timeline O), ctl filter; InviteModal.scss I __close, __draft-discard, __toolbar-btn (--active T), __link-cancel, O __draft-restore, __add-btn, __token-insert, D __link-remove, P __link-apply, B __btn (--cancel O, --send P), ctl cc buttons and chips; RosterList.scss P __add-student-btn, B __action-btn (--remove D, --invite G), ctl context menu; RosterTimelineModal.scss I __close, B __btn (--close O).
- $APP/Settings/Blocks (dead code): Portfolio.scss P save; Profile.scss O avatar-change, G avatar-remove, P save.
- $APP/Stats/ProjectHealth.scss: G health-card__details-btn.
- $APP/TAManagement: AddZoomModal.scss I close, O cancel, P save; DesignateTAsModal.scss I close, P done, ctl toggle; TAManagement.scss O ta-page__manage-btn, ctl meeting tab; TeamMeetingCard.scss I chevron, B ta-card__btn (--add O, --checkin O, --join X on an `<a>`), G __mark-all, ctl ta-toggle__seg; WeekNavigator.scss I btn.
- $APP/TSRS: ContributionsTab.scss B tsrs-btn (--primary P, --secondary S) — the same global class as InterestForm's; TSRView.scss ctl mode buttons and dropdown; TsrsStepper.scss ctl steps.
- $APP/TeamMeetings/teamMeetings.scss: B gt-button, gt-button--sm, P --primary, S --secondary, D --danger (copies of the design); G gt-tm__btn (--danger D), G gt-tm__link; ctl past toggle.
- $APP/shared/SortableHeader.scss: ctl sortable-header__button.
- $PG/CreateProject.scss: I __refresh-description, __add-skill-button, B __button (--primary P, --secondary G, --cancel O unused); ctl toggle button, mode buttons, role tags.
- $PG/Dashboard.scss: G card link, assignment title link. $PG/FinalReviewDetail.scss: G frd__back, I frd__setall-apply, G frd__undo-btn.
- $PG/FinalReviews.scss: I fr-error__close, O fr-row__open-btn, O fr-btn (--primary P, --signup P, --release D), P fr-day__zoom on an `<a>`.
- $PG/Home.scss: P `.home-page--guest button`. $PG/MyClasses.scss: B filter-btn, B create-btn, O join-btn, I hero-edit, I hero-leave; ctl code tag.
- $PG/Roster.scss: O roster__unsend-btn, I action-message dismiss. $PG/Settings.scss: I close, O avatar-change, G avatar-remove, O change, O retry, P save; ctl nav item.
- $PG/TAManagement.scss: D ta-card__demote, P ta-card__assign-btn, I `.ta-chip button`, O student-row__promote.
- features/auth: LogoutButton.scss O (component unused); SignUp.scss P buttonRectangle, S authButton, I eyeToggle, G link; VerifyEmail.scss S authButton, G link; AccountDetails.scss P buttonRectangle, G buttonLink; AuthConfirm.scss P button, G link; ForgotPassword.scss P buttonRectangle, G link; Login.scss P buttonRectangle, S authButton, I eyeToggle, G links; ResetPassword.scss P buttonRectangle, I eyeToggle, G link; RoleSelection.scss S button-rectangle; Unsubscribe.scss P button.
- features/landing (marketing, out of scope): ContactPage.scss P submit, ctl tabs; spotlights override `.gt-asst__btn--ok`.
- features/messages/pages/Messages.scss: G back-btn; I list search, conversation-menu trigger, widget back and minimize, new-conversation trigger; P composer send; O message-btn; ctl menu items, widget tab, results.
- features/schedule/schedule.scss: O gt-sched-item__action (--primary P, used on an `<a>`).
- features/scrum: BoardSettingsModal.scss I close, I repo-remove, P add; SprintPicker.scss ctl trigger; StoryEditorModal.scss I close, O cancel, P submit; StoryModal.scss I close, I task-delete, G edit, S edit-cancel, P edit-save, O add-description, O add-task, D delete, O confirm buttons, D confirm-delete; TaskEditorModal.scss I close, I dep-remove, G back, G add-label, G dep-key, O cancel, P submit, O dep-add; ScrumBoardPage.scss P primary, I icon-button, I story-slot open, T clear-filter, ctl views; scrum.scss I tag remove, P comments send, O backlog restore, ctl stories and pickers.
- features/search/search.scss: B gt-palette__esc, G result-group action, G retry, I compact pagination buttons; ctl trigger, scopes, kbd.

### .gt-button re-declaration
Only teamMeetings.scss (global, lines 20-52: base, sm, primary, secondary, danger, icon, spinner, duplicate @keyframes gt-spin) + contextual 153, 203, 231, 235, 240 (44px on phone). Used in TeamMeetingForm.tsx:274,279 and TeamMeetingsList.tsx:408,450,552,560. `gt-button__label` and `gt-button--loading` used in TSX with NO CSS. Reduced-motion bug: line 52 lacks !important so the index.css kill switch stops the spinner (the gt-spinner mixin guards this). .gt-icon-button appears nowhere.
Ghost re-implemented under local names: StoryModal.scss:79-80 (.story-modal__edit), TaskEditorModal.scss:146 (.task-editor__add-label, hover rgba(1,129,86,0.08)).

### Icon-only buttons: 73
Close x 22 (20 distinct classes; .join-class-modal__close shared by 3), dismiss 7, remove/clear/trash 9, chevron/nav/back/minimize 7, kebab/hamburger 2, toggle icons 10 (view toggle, 5 eye toggles, ...), other 16.
70 have aria-label; 3 do not: CreateProject/SkillsSection.tsx:49 ("+", no type), Project/ProjectList.tsx:158 (Eye, title only), Roster/InviteModal.tsx:192 ToolbarButton (title only, no aria-pressed; 7 instances at 457-465).

### Busy patterns
| Pattern | buttons | files |
|---|---|---|
| label swap "…ing…" | 53 | 40 (39 "…", 14 "...") |
| spinner in button | 18 | 13 (16 Loader2, 2 CSS ring) |
| aria-busy on button | 14 | 10 |
| disabled tied to busy flag | ~90 | 43 |
| gt-button--loading class (no CSS) | 2 | 2 |
~43 of 53 label-swap buttons lack aria-busy. 11 bespoke spinner classes: 5 use gt-spinner mixin (scrum); 6 define own keyframes 0.65-0.8s (StudentHomeDashboard:624, RequestsModal:316, InviteModal:765, RosterList:392, ControlBar:213, AddStudentModal:178).

### Links styled as buttons: 10 in 9 files
TeamMeetingCard.tsx:181 (<a> ta-card__btn--join, accent fill); MyProject.tsx:133 (Link browse-projects__cta); landing ClosingBand.tsx:17,20; landing Header.tsx:57,60; Hero.tsx:48; ScheduleItem.tsx:155 (<a> gt-sched-item__action--primary); FinalReviewDetail.tsx:667 + FinalReviews.tsx:369 (<a> fr-day__zoom).
Reverse: buttons that only navigate: ProjectActionButton.tsx:32 (navigate(to)), MessageButton.tsx:46.

### Deviations from the design spec
1 Padding: ~96 declarations, ~40 distinct values. md 10px 28px only InterestForm:8, FeedbackForm:197,231; sm 6px 14px only StoryModal:298, StudentAssignmentsTable:156, teamMeetings:36; lg never. Modal primaries 14px 24px or 0.75rem 1.5rem; auth 12px full width.
2 Radius: ~82 rules at 7px (16 via var(--gt-radius-sm), 58 $border-radius-sm, 8 literal); off-spec 10px, 9px, 8px (+ global index.css), 6px, 4px, 20px pill.
3 Disabled: only 16/64 opacity declarations at 0.45 (0.7 x17, 0.5 x14, 0.6 x6, 0.55 x4, 0.85 x3, 0.4 x2, 0.65, 1); 13 primaries switch to $disabled-bg #ccc; 19 disable-able buttons have no disabled style.
4 Hover: danger hover opacity 0.92; color.adjust lightness -4%; auth secondary #DADADA→#CCCCCC; LogoutButton hover 1.4:1 contrast (unused component); Login.scss:187 no :not(:disabled) guard.
5 Motion: hover lifts (RoleSelection -2px, ContactPage, landing Hero/Header); scale presses (MyClasses 0.98/0.96; eye toggles 0.95). Only 6 use gt-press.
6 Font weight: ~28 action-button rules at 600 instead of 500.
7 Icon-only sizes 12–40px vs design 28/36/44; 7 circular; modal closes mostly unboxed.
8 Tokens: most features use $primary-color / $border-radius-sm, not --gt-*; only scrum, search, schedule, analytics, messages, TeamMeetings are token-based.

Local button wrappers to fold in: ProjectActionButton, AddProjectButton, AssignProjectsButton, AddAssignmentButton, MessageButton, ToolbarButton (InviteModal), LogoutButton (unused).

## 2. Form controls

### Totals
| Control | JSX sites | Files |
|---|---|---|
| input (all types) | 99 | 51 |
| textarea | 26 | 18 |
| native select | 19 (33 option, 1 optgroup) | 14 |
| all native fields | 144 | 65 |
| custom select-like dropdowns | 12 widgets | 12 |
| native checkbox | 4 (1 role=switch) | 4 |
| native radio / fieldset / legend | 0 / 0 / 0 | - |
| DatePickerField usages | 10 | 5 |
| unclassed fields (styled by `.container input` rules) | 25 inputs, 8 selects, 5 textareas | - |

Input types: text 52 (+1 no type, StoryModal:138); email 14; password 1 static (BoardSettingsModal:151) + 5 show/hide toggles (SignUp:237,265, Login:152, ResetPassword:131,160); number 4 (CreateClassModal:329, DetailsTab:128, FinalReviewDetail:83 ScoreInput, TaskEditorModal:337); search 1 (MemberManagerModal:451); url 8; date 1 (TeamMeetingForm:201); time 2 (TeamMeetingForm:204, DatePickerField:213); file 5 (CreateClassModal:349 visually hidden+label; DetailsTab:81; ControlBar:134, Profile:127, Settings:305 display:none + ref.click()); checkbox 4; range 1 (ContributionsTab:219). 11 text inputs are search/filter boxes. inputMode 8x. Honeypots ContactCard:94, IssueCard:187.

Top files: pages/Settings.tsx 8 (i8); TeamMeetingForm 7; scrum/TaskEditorModal 7; Classes/CreateClassModal 6; CreateProject/DescriptionEditor 5 (t5); CreateProject/SponsorSection 5; landing/IssueCard 5; EditProject/DetailsTab 4; Roster/InviteModal 4 (+contentEditable); Settings/Blocks/Profile 4; FinalReviewDetail 4; ContactCard 4; StoryEditorModal 4; then AddStudentModal, AddZoomModal, ScrumMasterTab, SignUp, AccountDetails, StoryModal 3 each; 13 files with 2; 33 files with 1.

### Textarea classes (26)
create-project__textarea (DescriptionEditor x5, SponsorSection) CreateProject.scss:308,330; scrum-master-tab__textarea (x3) ScrumMasterTab.scss:124; team-feedback-tab__textarea (x2) TeamFeedbackTab.scss:102; frd__textarea (x2) FinalReviewDetail.scss:360; unclassed in TaskEditorModal/StoryModal/StoryEditorModal (scoped rules) and IssueCard/ContactCard (.contact-page__field textarea); gt-comments__input scrum.scss:360; messages-composer__input Messages.scss:595; gt-textarea teamMeetings.scss; request-modal__textarea; if-textarea InterestForm.scss:156,184; feedback-form__textarea FeedbackForm.scss:111; edit-project__textarea EditProjectModal.scss:189. contentEditable "textarea" InviteModal.tsx:471.

### Native select (19)
AnalyticsFilterRow:108,115 (gt-filter__select, UA chevron); CreateClassModal:253 (shares __input class, placeholder option); EditProject/TeamTab:47,66 (edit-project__select); StudentHomeDashboard:1119 (data-URI chevron); AddZoomModal:127; TAScheduleView:301 (unclassed); TeamMeetingCard:136 (ta-card__ta-select); TeamMeetingForm:211 (.gt-select + ChevronDown); FinalReviews:164 (fr-row__ta-select); TAManagement:222 (unclassed); TAReview:132; StoryEditorModal:110,118; StoryModal:288 (placeholder option); TaskEditorModal:226,362,404 (optgroup). No `options` prop pattern anywhere.

### Custom select-like dropdowns (12)
1 TSRView SearchDropdown (:104; listbox, arrows; no aria-controls/activedescendant); 2 Interest/MultiSelectDropdown (div onClick trigger, no ARIA); 3 RankedProjectSlot picker (no ARIA); 4 Assign/ProjectSearchBar (aria-autocomplete, no role=combobox); 5 scrum SprintPicker (Popover+Menu radio — good); 6 TaskEditorModal labels picker (Popover+Menu checked — good); 7 Roster/ControlBar filter (no ARIA); 8 Sidebar class selector (aria-expanded only); 9 Layout/SchoolSwitcher (aria-expanded/controls/current); 10 messages/NewConversationSearch (none); 11 CreateProject/SkillsSection suggestions (div onClick, not focusable); 12 CommandPalette (full combobox). #2 #3 #4 #7 share Interest/useClickOutside.ts.

### Checkbox (4)
MarkdownText:49 (read-only task list); AnalyticsPage:310 (wrapping label, native box); CreateClassModal:402 (appearance:none custom box); EmailPreferences:80 (role=switch). No indeterminate anywhere.

### Radio-like (0 native)
ScalePicker (scrum, radiogroup/radio aria-checked, every chip a tab stop, no arrows); PointPicker (same, used StoryEditorModal:103, TaskEditorModal:315, StoryModal:164); AnalyticsFilterRow:95-125 chips (full radio group, roving tabindex, arrows, Home/End); Menu menuitemradio; CreateAssignmentModal:176,197 + AssignmentEditorModal:258,281 Draft/Published status cards (drawn radio, no ARIA).
Single-choice button groups with aria-pressed (7): Assign/ViewToggle:13-26; analytics/UnitToggle:9-15; TeamMeetingCard AttendanceToggle:59-65 (.ta-toggle__seg); TeamPreferencesSection:43-55 (.if-toggle); ClassSettingsModal:263-288 status pills; IssueCard:149-153; CommandPalette:268-284.
Same with no ARIA state (5): TSRView:482,496 mode buttons; CreateClassModal:291 term buttons; CreateAssignmentModal:128 template buttons; DescriptionEditor:53,61 mode buttons; InviteModal:733,740 cc-btn.

### Toggle / switch
Real switch: Settings/EmailPreferences:80-89 (input checkbox role=switch .settings-modal__switch, Settings.scss:416-465).
Button styled as switch: CreateProject/ProjectHeader:60-66 (.create-project__toggle-button; no role, no state, no type; orphan label :46).
Dead CSS: AppView.scss:95 .dev-toggle-switch, :114 .dev-toggle-slider.
aria-pressed toggle buttons: 24 attrs in 14 files (AdminMemberCard:42, AnalyticsPage:204,265,314, ChartLegend:24, StoryCard:38, password .eyeToggle x5 ...). No-state toggle: DesignateTAsModal:137.

### DatePickerField (features/app/components/Fields/DatePickerField.tsx)
API: label: string; value: string ('yyyy-MM-dd' | 'yyyy-MM-dd HH:mm' | ''); onChange(val: string); showTime?; disabledBefore?: Date; labelClassName? ('dpf__label'); disabled?. Exports DATE_ONLY_FORMAT, DATETIME_FORMAT (DATETIME_FORMAT also imported by AssignmentEditorModal:4, CreateAssignmentModal:4). Lacks id, name, required, error, help, placeholder, className, disabledAfter, onBlur, ref.
Behaviour: label htmlFor useId → button.dpf__trigger; react-day-picker DayPicker single in a body portal (fixed, z 1100, flip); closes on outside pointerdown / pick / Done.
A11y gaps: no Esc, no focus move, no aria-expanded/haspopup/role=dialog; trigger aria-label "Pick {label}" overrides label and hides the value; time input uncontrolled + unlabelled (default 08:00).
Consumers (5 files, 10): ClassSettingsModal:299; CreateClassModal:303,312; AssignmentEditorModal:207,215,231 (showTime); CreateAssignmentModal:152,160 (showTime); AnalyticsFilterRow:137,138 (works around portal outside-press :33-40).
DatePickerField.scss uses legacy $ variables, not --gt-*.

### Feature SCSS re-declaring design names
teamMeetings.scss: .gt-field* :55-66, .gt-input/.gt-textarea :69-98, .gt-select* :103-126, plus .gt-button* and .gt-alert*; contextual .gt-tmform overrides :220,221,239 (44px on phone). DatePickerField.scss = the .dpf block (the design mirrors it). .gt-check/.gt-radio/.gt-toggle appear nowhere. In TSX gt-field/gt-input/gt-select/gt-textarea only in TeamMeetingForm.tsx. No design CSS imported globally.

### Accessibility — label association (144 controls)
| Association | input | textarea | select | total |
|---|---|---|---|---|
| A htmlFor↔id | 43 | 7 | 7 | 57 |
| B wrapping label | 14 | 3 | 6 | 23 |
| C aria-label only | 8 | 2 | 4 | 14 |
| D visible label, not associated | 13 | 6 | 1 | 20 |
| E placeholder only | 15 | 8 | 1 | 24 |
| E nothing | 6 | 0 | 0 | 6 |
=> 50/144 (35%) have no programmatic label (D + E).
Broken: InviteModal:797 label htmlFor="invite-body" with no such id (contentEditable div :471); TSRView:454,466,478 labels without htmlFor; DatePickerField trigger aria-label; ProjectHeader:46 orphan label.
Ids: 47 hard-coded (id="email"/"password" repeat across auth pages); 10 useId; 1 data key.
aria-invalid: 7 sites / 11 elements (TaskEditorModal, ClassSettingsModal, CreateClassModal, TeamMeetingForm x6, FinalReviewDetail). aria-errormessage never. aria-required 3. required attr 18.
aria-describedby: 11 field sites / 15 elements. Many visible hints unlinked (CreateClassModal:318,326,345; ClassSettingsModal:311; DescriptionEditor:124; DetailsTab:118,125; IssueCard:178; ScrumMasterTab:136; AssignmentEditorModal:227; CommentThread:104; TaskEditorModal:325).
Field-level error patterns: 13 (only TeamMeetingForm, CreateClassModal, ClassSettingsModal, TaskEditorModal link errors via describedby + aria-invalid). Red border only, no message: ScrumMasterTab, TeamFeedbackTab, AddStudentModal, FinalReviewDetail ScoreInput.
Form-level error banners without role/aria-live: >= 22 (8 auth .error divs + 14 others).

### Counters (5)
TeamMeetingForm:196,262 (gt-field__count); MessageComposer:79-85 (code points, no maxLength); RequestModal:98 (remaining, aria-live polite); CommentThread:105-107 (over-limit hint). maxLength without counter: 11 sites.

### Icons / prefixes / suffixes
Leading-icon inputs (10): ProjectSearchBar, StudentsPanel, MemberManagerModal, Roster/ControlBar, NonSubmittersList, TSRView dropdown search, pages/TAManagement, NewConversationSearch, CommandPalette, PreviousProjectSection (.if-input--with-icon). Prefixes 5 (Portfolio x2, Settings x2, IssueCard "@"). Suffixes 2 (TaskEditorModal "h", ContributionsTab "%"). Trailing: password .eyeToggle x5; chevrons; action buttons (InviteModal Add, SkillsSection +, palette Esc).

### Shared styles
No field mixin/partial. _mixins.scss has bottom-clearance-for-message-widget + gt-visually-hidden. .sr-only only in ScrumBoardPage.scss:238 (+ scoped .gt-md .sr-only).
Auth pages: GLOBAL unscoped classes duplicated: .formGroup in 6 files, .formGroup input in 5, .passwordInputContainer x3, .eyeToggle x3, .error x7, .codeInput, .inputReadonly.

### Local field pieces
TeamMeetingForm.tsx:138-170 inline helpers (fieldClass, describedBy, control(), label(), errorText(), field()) = de-facto port of Input/Select/Textarea. SearchDropdown (TSRView:104); EmailInputSection (InviteModal:129) + BodyEditor contentEditable (:212); ScoreInput (FinalReviewDetail:64); MultiSelectDropdown, RankedProjectSlot, useClickOutside (Interest/); ProjectSearchBar, ViewToggle (Assign/); UnitToggle (analytics); ScalePicker, PointPicker, SprintPicker (scrum); AttendanceToggle (TeamMeetingCard:55); MessageComposer, NewConversationSearch; SchoolSwitcher.

## 3. Modals, alerts, empty states, loading

### Modals: 24 overlay surfaces, all hand-rolled (22 centred, 1 drawer, 1 mobile nav)
| # | Component | role=dialog | name | Esc | trap | focus in | restore | scroll lock | portal | blocks while saving |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Overlays/ConfirmModal | N | N | Y | N | N | N | N | N | n/a |
| 2 | EditProject/EditProjectModal | N | N | Y no guard | N | N | N | N | N | N (only Cancel disabled; ×, Esc, scrim still close, :323) |
| 3 | Classes/ClassSettingsModal | Y | labelledby | Y | N | N | N | Y | N | N |
| 4 | Classes/CreateClassModal | N | N | Y | N | N | N | Y | N | N |
| 5 | Classes/JoinClassModal | N | N | **N** | N | Y | N | N | N | Y |
| 6 | Settings/ChangeEmailModal (JoinClassModal.scss + settings-modal__*) | Y | label | N (parent closes both) | N | Y | N | parent | in Settings portal | ~ |
| 7 | Settings/EduVerifyModal (JoinClassModal.scss) | N | N | N | N | Y | N | N | Settings portal; not portaled in auth/pages/AccountDetails | ~ |
| 8 | Home/RequestsModal | Y | labelledby | Y guarded | N | N | N | N | N | ~ |
| 9 | Project/RequestModal | N | N | Y no guard | N | N | N | N | N | ~ |
| 10 | Project/MemberManagerModal | N | N | Y | N | N | N | N | N | N |
| 11 | Modules/CreateAssignmentModal | N | N | Y | N | N | N | Y | N | N |
| 12 | Modules/AssignmentEditorModal (drawer 420px) | Y | **none** | Y | N | N | N | Y | N | N |
| 13 | Roster/AddStudentModal | Y (on scrim) | labelledby | Y guarded | N | Y | N | N | Y | Y |
| 14 | Roster/InviteModal | Y (on scrim) | labelledby | Y no guard | N | Y | Y | N | Y | N |
| 15 | Roster/RosterTimelineModal | Y (on scrim) | labelledby | Y | **Y** :48-65 | Y | Y | N | Y | n/a |
| 16 | TAManagement/AddZoomModal | N | N | Y | N | N | N | Y | N | N |
| 17 | TAManagement/DesignateTAsModal | N | N | Y | N | N | N | Y | N | N |
| 18 | pages/Settings (SettingsModal) | Y | label | Y no guard | N | N | N | Y | Y | N |
| 19 | search/CommandPalette | Y | label | Y capture | N | Y | ~ | Y (restores prev) | Y | n/a |
| 20 | scrum/BoardSettingsModal | Y | labelledby | Y | N | N | N | N | N | N |
| 21 | scrum/StoryEditorModal | Y | labelledby | Y | N | Y | N | N | N | N |
| 22 | scrum/StoryModal | Y | labelledby | Y | N | Y | N | N | N | N |
| 23 | scrum/TaskEditorModal | Y | labelledby | Y (Popover takes Esc first) | N | Y | N | N | N | N |
| 24 | Layout/Sidebar mobile drawer + AppView .app-nav-backdrop | N | N | N | N | N | N | N | N | n/a |

Totals /24: role=dialog 13 (3 on scrim), aria-modal 13, named 12, Esc 20, backdrop 24, trap 1, focus-in 10, restore 3, scroll lock 8, portal 5 (+2 nested), blocks-while-saving 2 full + 4 partial, × aria-label 22 (6 label strings).
Exit animations (isClosing + setTimeout): #3 #4 #11 #16 #17 (200ms), #12 (250ms), #19 (150ms). Titles h1 in #1 #3 #4 #5 #6 #7 #11, h2 elsewhere.

Problems:
- Stacked modals close together on Esc: #2 + nested ConfirmModal (EditProjectModal.tsx:492); #18 + #6/#7; #14 link panel inputs (:504, :518); #22 inline delete confirm.
- z-index split: 2000 hard-coded in RequestsModal, EditProjectModal, JoinClassModal (also #6 #7), ConfirmModal, MemberManagerModal, RequestModal; rest $z-index-modal / --gt-z-modal = 100; palette --gt-z-palette 2100; mobile nav scrim $z-index-modal - 2.
- Scrim: literal rgba(0,0,0,.5) in RequestsModal, EditProjectModal, MemberManagerModal; rest var(--gt-scrim). blur(4px) only in 7.
- Scroll locks reset each other: #3 #4 #11 #12 #16 #17 set body.style.overflow='unset'; #18 sets ''; only #19 restores previous.
- Not counted: inline role=alertdialog confirm in StoryModal.tsx:316; non-modal role=dialog: messages/MessageWidget.tsx:69, Project/ProjectMembersPopover.tsx:195 (on shared Popover).

Helpers: no useEscape/useFocusTrap/useBodyScrollLock/portal helper. Each modal copies a document keydown handler; 4 (#11 #12 #16 #17) use useEffectEvent. Interest/useClickOutside.ts used by 4 dropdowns (RankedProjectSlot, MultiSelectDropdown, Roster/ControlBar, Assign/ProjectSearchBar), no modal. lib/lazyModal.ts used 6x in 4 files (AppView CreateClass+JoinClass, InstructorHomeDashboard, MyClasses, Modules CreateAssignment+AssignmentEditor). Only focus trap: RosterTimelineModal FOCUSABLE_SELECTOR (:16, :48), comment calls it "reference implementation for later gt modals". Shared Popover + CommandPalette catch Esc in capture phase and stop it.

ConfirmModal: 5 caller files, 6 sites: EditProjectModal.tsx:492 (nested), ClassSettingsModal.tsx:442 (nested), ProjectView.tsx:632, CreateProject.tsx:334,347, MyClasses.tsx:434. No busy state, no destructive variant; onConfirm() sync then onClose().
Confirms without it: window.confirm x5 (Roster.tsx:154,254,268; TAManagement.tsx:109; messages/ConversationMenu.tsx:67); inline confirms x3 (StoryModal :316, AssignmentEditorModal :308-326, TeamMeetingsList :111); alert() x3 (ConversationMenu.tsx:76, EditProject/DetailsTab.tsx:40, Classes/CreateClassModal.tsx:112).

### Alerts / banners / inline messages: 131 sites, 57 announced (43%)
| Tone | Sites | role=alert | status/aria-live | Not announced |
|---|---|---|---|---|
| Error | 93 | 40 | 2 | 51 |
| Success | 17 | 0 | 8 | 9 |
| Warning | 10 | 2 | 0 | 8 |
| Info | 10 | 0 | 4 | 6 |
| Mixed | 1 | 1 | 0 | 0 |
Error not announced (51): modal/form errors 12 (3 linked by aria-describedby: ClassSettingsModal:368, CreateClassModal:393, TeamMeetingForm:158; others CreateClassModal:414, JoinClassModal:159, EduVerifyModal:131, AddZoomModal:152, DesignateTAsModal:148, InviteModal:177, CreateAssignmentModal:218, AssignmentEditorModal:301, pages/Settings:436); section/page errors 19 (InterestForm:298,351; FeedbackForm:219; FeedbackView:81; Staffing:228; Assign:514; SprintProgressCard:86; TeamMeetingsList:513; TSRView:441; TSRS:348,356,367,479; ContributionsTab:250; Dashboard:128; Modules:222; MessageComposer:86; NewConversationSearch:143; ScrumBoardPage:287); dead code 2 (Settings/Blocks/Profile:184, Portfolio:102 — only reachable from InstructorSettings/StudentSettings which nothing imports); auth bare .error 8 (VerifyEmail:97, Login:124, AccountDetails:132, ResetPassword:117,125, SignUp:218, RoleSelection:136, ForgotPassword:94; global .error declared in 7 auth SCSS files); page errors inside *__empty 10 (FinalReviews:264, FinalReviewDetail:575, ProjectDetails:135, TAReview:99, Assignments:294, MyProject:110, BrowseProjects:86, TAScheduleView:359, RosterList:130, ProjectList:86).
Only design-style alert: local .gt-alert error-only in teamMeetings.scss:130-142, used once (TeamMeetingForm:267). Shared Toast used only on scrum board; toast-like hand-rolls in PreviewBanner, MyClasses, Roster.
Warning: CreateProject:248 (banner-warning, alert), PreviewBanner:62 (toast, alert, z 1200), InstructorHomeDashboard:185 (Needs Attention rows), FeedbackForm:197,199, TSRS:409,411, InviteModal:539, StoryModal:262, AssignmentEditorModal:227.
Info: PreviewBanner:47 (status, fixed bar z 1100), AnalyticsPage:57, Unsubscribe:111, FinalReviewDetail:960, FeedbackForm:192, TSRS:404, InviteModal:708 (draft banner), SprintProgressCard:82, AuthConfirm:76.
Mixed: pages/Roster.tsx:323 roster__action-message--{success|error}.

### Empty states: 84 sites
- Round tinted well (3): InstructorHomeDashboard:171 (52px), StudentHomeDashboard:1100 (48px), TeamMeetingsList:403 (gt-tm__empty 40px).
- Bare icon (3): InstructorHomeDashboard:234, Assign/StudentsPanel:166, and feature-local **analytics/components/EmptyState.tsx** (.gt-empty, role=status, analytics.scss:73; used by ChartCard.tsx:27) — its name collides with the planned shared EmptyState.
- With CTA (3): TeamMeetingsList:403, TeamMeetingsList:243 (gt-tm__quiet), pages/MyProject:128.
- "No Class Selected" blocks (14 + 2 bare p): TAScheduleView:257, FinalReviews:247, Dashboard:118, TAReview:77, Assignments:251, Projects:125, MyProject:85, TSRViewPage:16, TAManagement:130, BrowseProjects:61, Modules:199, Roster:286, FeedbackViewPage:14, AssignmentDetail:53; bare p: Assign:481, Staffing:173.
- Text-only list/section empties (60) across scrum, messages, search, landing, analytics, app.
- Double duty: story-modal__empty also "Loading comments…"; messages-thread--empty also Loading/not found; 10 *__empty render errors.
- Unstyled: feedback-view-page__empty, tsr-view-page__empty. projects__empty declared in two files.

### Loading
- Spin keyframes: 9 (shared _motion.scss gt-spin + gt-spinner mixin used only in scrum; duplicate in teamMeetings.scss:51; 7 feature-local: StudentHomeDashboard, RequestsModal, InviteModal, AddStudentModal, ControlBar, RosterList, search).
- Spinner elements: 20 (17 lucide Loader2 in 11 files; 3 CSS rings: TeamMeetingForm:283, TeamMeetingsList:557, CommandPalette:260).
- Hand-rolled skeleton: CommandPalette gt-palette__skeleton (own shimmer).
- "Loading…" text: 12.
- Shared Skeleton imported by 34 files; TableSkeleton by 4.

### Shared component usage
Popover 6 files; Menu 3; Tooltip 1 (scrum/Chips); Toast+useToasts 1 (ScrumBoardPage); Skeleton 34; TableSkeleton 4.
Hand-rolled popovers/dropdowns/menus: 15 surfaces in 14 files (Header notifications :292 + profile :394; SchoolSwitcher:57; Sidebar class selector :225; ConversationMenu:100; NewConversationSearch:115; MessageWidget:69; MultiSelectDropdown:77; RankedProjectSlot:79; ControlBar:83; RosterList:312 context menu; ProjectSearchBar:102 listbox; TSRView:202 listbox; DatePickerField:187 portal; SkillsSection:57 autocomplete).
Hand-rolled tooltips: 5 (StatTooltip, GroupTooltip — hover-only portals; analytics ChartTooltip; recharts content in PieCharts:66, ProjectMembershipChart:36); ~45 native title= tooltips.

### designSystemPorts.test.tsx: 10 tests
Popover 3 (open-only render; Esc onClose once and not reaching an earlier document listener; outside mousedown). Menu 5 (autoFocus, arrows wrap, menuitemcheckbox, menuitemradio, autoFocus=checked + fallback). Tooltip 2 (role=tooltip + describedby; focusable=false).

## 4. Display and navigation

### Summary
| DS component | Hand-rolled | TSX files | Shared pieces already |
|---|---|---|---|
| Badge / Tag | 108 app pills + 3 icon-only role badges + 12 landing; + 6 status texts/dots + 5 text role labels | 53 app, 5 landing | SprintStatusPill, TagBadge, scrum Chips (Points, Estimate, PR), local Badge fn in schedule ScheduleItem.tsx:41 |
| Avatar | 35 app render sites (5 local avatar components + inline) + 6 landing | 22 consumers (+ InitialsAvatar), 3 landing | InitialsAvatar (messages, 6 consumers), AVATAR_COLORS (2 consumers) |
| Card | ~55 surface classes | 52 | ChartCard (analytics, 4 uses) |
| StatCard | DashboardMetricCard 10x (4 direct, 6 via StatTile) + 5 other stat-tile patterns | 2 + 5 | DashboardMetricCard |
| ProgressBar | 8 (only 1 role=progressbar) | 7 | none |
| Table | 16 <table> | 14 | SortableHeader (3 files), TableSkeleton (4) |
| Tabs | 10 strips | 10 | none |
| SegmentedControl | 18 | 17 | none |
| Pagination | 1 (+ week stepper) | 2 | search SearchPagination |
| SidebarNavItem | 1 implementation | 1 | none |
| Tooltip | 15 sites across 5 impls + 36 DOM title= | 4 + 23 | components/Tooltip used only in scrum Chips (2) |

### Badges
Status pills: 34, with conflicting mappings:
- status-badge global class defined twice: Modules/AssignmentList.scss:6-11,168-192 (active/draft/closed) and Assignments/StudentAssignmentsTable.scss:119-149 (not-started/in-progress/submitted).
- dashboard__pill (Dashboard.scss:225-249): active and closed colours swapped relative to AssignmentList.
- student-home__pill (StudentHomeDashboard.scss:317-346): "Not started" is amber here and grey in StudentAssignmentsTable.
- my-classes-card-status-tag (MyClasses.scss:428-449) byte-identical to instructor-home__status-tag (InstructorHomeDashboard.scss:328-346).
- project-grid__tag, sprint-status (SprintStatusPill), gt-prchip, schedule local Badge (attendance map ScheduleItem.tsx:26-31) duplicated by ta-card__status-pill (TeamMeetingCard.scss:301-312) + text + toggles; roster-list__badge x4 (raw hex); requests-modal__badge x7 byte-identical to student-home__badge x6; gt-sched-item__live duplicated by gt-live-pill (analytics); status-dot mapping x3 (search.scss:141-144, analytics.scss:9-11, scrum.scss:233-235); student-details__pill vs student-item__stat "No" (red vs grey).
Roles: 14 encode project roles (5 pills, 5 icons, 4 text). Owner amber (AdminMemberCard:32, EditProjectModal.scss:432); Product Owner green-soft (AdminMemberCard:36), but an amber Crown via --owner modifier in TeamTab.tsx:44 (conflict); Scrum Master: primary Star icon (TeamTab:63), solid primary "SCRUM MASTER ONLY" (ScrumMasterTab:84), Shield icon x3 (TSRView); any role one colour (MemberManagerModal:418). Green-soft role look 5x with different alphas (.10, .12, .15, primary-soft x2). Labels from memberUtils.ts projectRoleLabel:38-62 and routePermissions CLASS_ROLE_LABELS.
Counts 31: byte-identical 26px primary pill x4 (assignment-list__count-badge, browse-projects__count-badge, student-assignments__count-badge, roster-list__count-badge) + 12 variants. Unread counts in 3 colours (header --gt-error; sidebar #ff3b30; messages/widget/search primary).
Tags/chips 13: gt-tagbadge (scrum TagBadge, 4 consumers) vs gt-palette__tag neutral for the same task tags; if-pill, invite-modal__chip, ta-chip, create-project__skill-tag (span onClick, not keyboard reachable), project-view__skill-tag, member-manager__skill-tag x2, roster-list__project-tag x2, student-item__stat.
Pill-shaped controls 10 (role tags, point chips, filter chips, scopes, status pills, code tag, access pill).
A11y gaps: unread counts not announced (aria-label on role-less span; header badge inside "Notifications"-labelled button; sidebar bare number); colour-only status dot; meaning only in title (PointsChip, EstimateChip); TSR Scrum Master Shield aria-hidden inside hover-only StatTooltip.

### Avatars
Palettes/hashing (7): lib/avatarColors.ts AVATAR_COLORS; ScheduleItem avatarColor (the only real hashColor); app/utils/joinRequests.ts avatarBgFromEmail HSL (some hues ~3.3:1 with white — fails contrast; used StudentHomeDashboard:878,969, RequestsModal:297,380); index-based i%5 palette (StudentHomeDashboard:617, not deterministic); landing Spotlight.scss hand copy; FloatingCards fixed indices; classBannerGradients same hash.
Single-colour avatars 9 (member-manager, edit-project, fr-avatar, ta-card, designate-modal, messages-avatar, gt-entity--person, schedule gt-avatar, dead gt-mentionbox__avatar).
Initials helpers 4: memberUtils getInitials (8 files), joinRequests initialsFromEmail, StudentHomeDashboard initialsFromName (dup), search/format initialsOf; + inline project initials.
Render sites 35: InitialsAvatar (ConversationList:165, MessageWidget:81, NewConversationSearch:160, ConversationThread:180, scrum CommentThread:76, Chips:66,70); ScheduleItem Face; TeamMeetingCard Avatar (:45 x3); FinalReviews Avatar (:17 x2) + a duplicate in FinalReviewDetail (:60 x2); MemberManagerModal x3; AdminMemberCard; DesignateTAsModal; RequestsModal x3; StudentHomeDashboard x5; EntityIcon; icon/photo-only ProjectMembersPopover, Header:381, Settings:282, dead Settings/Blocks/Profile:104, TeamFeedbackTab:110, ScrumMasterTab:101.
No "+n" stacks in the app (only landing float-card__avatars).
A11y: initials read aloud next to the name (not aria-hidden) in member-manager, edit-project, student-home, requests-modal, team-avatar; image alt duplicates adjacent name. Bug: InitialsAvatar onError (InitialsAvatar.tsx:33-38) restyles an unrelated nextSibling.

### Cards
~55 surface classes from 52 files + TableSkeleton __table-card; 20 modal shells.
Recipes: hairline (white + --gt-shadow-hairline ± 1px border + radius-md) ~10 classes; LITERAL 0 0 4px rgba(0,0,0,.08) (= hairline, untokenised) x5 (metric-card, instructor-home__card, project-grid__card, my-classes-card, student-assignments__table-card); --gt-shadow-card ~10 (+ literal 2.61px in student-home__card); border-only $border-color ~14; border-only gray-200 (Assign) 6 (TeamMeetingCard .ta-card 12px); selectable radio cards x2; others.
Radius mostly 10px top-level, 7px nested; outliers 12/14/20/22. Global collision: .ta-card and .ta-card__name in TeamMeetingCard.scss:16 AND pages/TAManagement.scss:124. .scrum-board__placeholder 0 uses.

### Stat cards
DashboardMetricCard ($APP/Dashboard, accents primary/blue/purple/amber, delta, sparkline, StatTooltip label, button when clickable): Dashboard.tsx:131,140,148,155 + via analytics StatTile at AnalyticsPage.tsx:155-181 (6). Hand-rolled tiles: assign-summary__tile x3 (AssignSummaryBar), SprintProgressCard dl, dashboard__tsr-num, turn-in-card, FocusedProjectCard, ta-card__col.

### Progress (8; only SprintProgressCard has role=progressbar)
SprintProgressCard:115 OK; StoryCard:56 + SprintPicker:165 + BreakdownTable meter aria-hidden (text nearby); AssignmentList:118 submissions__bar none; AssignmentTurnInRate:39,52 none; Dashboard:274 none.

### Tables (16 in 14 files)
StudentHomeDashboard:730(skel),753; StudentAssignmentsTable:117; RosterList:164; RosterTimelineModal:172; FeedbackView:56(skel),99; ProjectList:119; AssignmentList:56; Assign/Staffing:213(skel); StaffingTable:85; TSRView:538; FinalReviewDetail:704; analytics CardTable:16 (3 consumers) + BreakdownTable:58; TableSkeleton:36.
SortableHeader: 14 headers in 3 files (StudentAssignmentsTable 4, ProjectList 5, RosterList 5). BreakdownTable own aria-sort.
Gaps: StaffingTable sort mouse-only (<th onClick>); <tr onClick> without keyboard (ProjectList:133, StudentAssignmentsTable:129; role=button on tr StudentHomeDashboard:781); scope= only RosterTimelineModal + analytics; caption only analytics. analytics.scss:151 local .gt-table collides with a shared Table.

### Tabs (10 strips; 4 with role=tablist; none with aria-controls or arrow keys; 1 tabpanel)
Most render as a segmented track (grey track, white active item), duplicated in 5 SCSS files. (The design's Tabs component draws underlines; the alignment round changes it to the track, decided 2026-10-19.)
EditProjectModal:362-389 (Details/Team/Meetings; no ARIA; EditProjectModal.scss:76-117); MemberManagerModal:294-311 (no ARIA); RequestsModal:228-253 (tablist/tab/selected, no tabpanel); ScrumBoardPage:341-356 (tablist + tabpanel, no id linkage); TAScheduleView:317-330 (tablist); MyClasses:357-372 (tablist misused for a filter; reuses create-class-modal__term-button); Settings:245-270 nav (aria-current only); TsrsStepper:29-56 (no ARIA; completion icon only); landing IssueCard:149 (group + aria-pressed); TSRView:479-507 mode buttons (no ARIA).

### Segmented controls (18; only AnalyticsFilterRow complete)
Complete radiogroup: AnalyticsFilterRow:76-135. radiogroup without arrows: ScalePicker, PointPicker. group + aria-pressed: Assign/ViewToggle, analytics UnitToggle, TeamMeetingCard AttendanceToggle, ClassSettingsModal:263 status pills, IssueCard:149, CommandPalette:268 scopes. aria-pressed no group: TeamPreferencesSection:44. no ARIA: TSRView:479, CreateClassModal:286 term buttons, DescriptionEditor:51, ProjectHeader:60 preview switch, CreateAssignmentModal:121 templates + :174-213 status cards, AssignmentEditorModal:256-300 status cards, TeamSidePanel:92 role tags. Tablist misuse MyClasses:357. Single toggles AnalyticsPage x3, ChartLegend, StoryCard, AdminMemberCard.

### Pagination
search SearchPagination (compact prev/next + aria-live "p / n"); TAManagement WeekNavigator stepper. So the design's numbered Pagination is not used anywhere.

### Sidebar
Layout/Sidebar.tsx + config/sidebar.ts buildSidebarConfig; nav without aria-label; button.sidebar-item[.active] aria-current=page; external a.sidebar-item; badge #ff3b30 bare number; class selector aria-expanded only. Single implementation.

### Tooltips outside components/Tooltip: 51
StatTooltip (Assign, portal) 9 calls (RosterList x2, StudentListItem x3, DashboardMetricCard, TSRView x3) + GroupTooltip 2 calls — both mouse-only. ChartTooltip (analytics, keyboard in WeeklyLine). SliceTooltip duplicated (Roster/PieCharts:55, Stats/ProjectMembershipChart:25). CSS ::after data-tooltip (MyClasses:301). 36 native title= in 23 files (3 on disabled buttons: InterestForm:358, AssignmentEditorModal:261, ScalePicker:58).

### Other
Local ports that clash: schedule.scss .gt-badge/.gt-avatar; analytics.scss .gt-table (+ .gt-empty). Global classes defined twice: .status-badge, .ta-card. Cross-feature class reuse: MyClasses borrows create-class-modal__term-button; TeamMeetingsList borrows gt-sched-item__live. Dead code: .gt-mention/.gt-mentionbox* CSS, MOCK_OUTGOING_JOIN_REQUESTS (Home/mockData.ts:55), InstructorSettings/StudentSettings/Blocks/Profile (+ Portfolio) never imported.
