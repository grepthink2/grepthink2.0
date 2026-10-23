# Sprint plan documents on GrepThink — brainstorm

**Date:** 2026-10-21
**Status:** brainstorm, not approved. Open ends below await the maintainer. Nothing is built; no spec exists yet.
**Next step:** answers (or "use your picks") → `docs/superpowers/specs/2026-10-21-sprint-plan-docs-design.md` → builder check → plan.

## The ask

Teams write a Google Doc per sprint from the CSE 115 "Sprint Plan Template". Build it into GrepThink instead:
a draft state, team collaboration as saved iterations with a simple diff (no live editor, no conflict
machinery), an AI "refine" that turns a one- or two-line idea into a structured story with tasks (a
lightweight Workers AI model, with a "slug" that crawls over the old text and leaves the model's output
behind), and a bridge that exports the plan to stories and tasks on the scrum board, scrum master only.
Objective: speed, so students are not lost in documentation.

## The headline

The template is mostly data GrepThink already holds. The fastest version is a structured document that is
generated from the board and exported back to it, not a free-text page. Students type three things: the
goal, the stories with tasks and hours, and roles plus scrum times. Everything else is derived.

| Template section | Where it comes from |
| --- | --- |
| Heading: Sprint N Plan, product, team, completion date, revision number and date | project, sprint and the saved revisions, all automatic |
| Goal, 1 to 2 sentences | typed |
| Task listing by story in priority order, estimates, per-story totals | typed or pre-filled from the board; totals computed |
| Team roles for this sprint | typed, carried forward from the last plan |
| Initial task assignment | the first task's assignee per member |
| Initial burnup chart | the board's burnup, embedded |
| Initial scrum board | the board itself, once exported |
| Scrum times and the TA visit | the `meetings` table from the schedule-sources work |
| Updated release plan if it changed | a second document kind, later |

## The shape I'd build

- **One document per sprint, in structured sections with stable item ids.** Each story and task gets an id
  the moment it is typed, so diffs and export links survive reordering.
- **Every save is a revision.** The whole body is stored with who saved it and when. The diff view compares
  two revisions per item: added, removed, a changed field, a move in priority.
- **One safety rail on concurrent saves.** A save carries the revision it started from. If a teammate saved
  in between, sections nobody else touched merge on their own, and only a section both people edited shows
  the two versions side by side. Cheap, and it never loses a teammate's work silently.
- **Draft until the scrum master marks it final.** Saves keep working afterwards and bump the revision
  number and date, which is what the template's heading wants. Finalizing can notify the TA.
- **AI refine acts on one item, in place.** Select a one-line idea and choose refine, split into tasks, or
  estimate. The backend reuses the paused draft client (`backend/app/scrum/ai_draft.py`) and its daily
  quota, and answers with a patch for that item only. The slug is a client-side sweep that replaces the old
  text field by field once the response lands, with undo. No streaming through Vercel is needed; the slug
  can crawl in place while the model is still thinking.
- **Export is scrum master only.** It creates the sprint if missing, then stories in priority order with
  their tasks, hours and initial assignees, and writes the new ids back into the plan. A second export only
  creates unlinked items. The role already exists as one exclusive scrum master per project
  (`backend/app/projects/controller.py`, `assign_scrum_master`), set on the team tab or automatically when
  someone joins and nobody holds it.
- **After export the task listing goes live.** Linked items show the board's status inside the plan, and
  edits to a linked item go to the board. The burnup and "initial scrum board" sections become live embeds.
  This is how Shortcut Docs behave, and it removes drift.
- **Access matches the board.** Members write, class staff read (`_board_access` in the scrum controller).
  The TA gets one list of plans per class with status, revision and last save, instead of chasing Drive
  links.

### Enhancements for speed, ranked

1. **Pre-fill.** A new plan seeds from the board's sprint when stories already exist, and carries roles and
   scrum times forward from the previous plan. Zero retyping.
2. **A deterministic checker, no model.** Tasks over the six-hour guideline, stories missing "so that", a
   member with no initial task, totals against team capacity, fewer than three scrum times, no TA-visit
   meeting. Instant feedback instead of a TA note a week later; the TA sees the same checklist.
3. **Scrum times write to the `meetings` table** on the unpushed `feat/team-meetings` branch, with a flag
   for the TA-visit meeting, so attendance and the calendar feed share the rows.
4. **PDF or Markdown export** for a TA who still wants a file.
5. **Name the tables by document kind,** so the release plan and a sprint report reuse the engine later.
   The template asks for an updated release plan whenever it changes.
6. **Keep points out of the plan.** It is hours-only like the template; stories get points on the board
   later if the team wants them.

## What Jira, Shortcut and Linear do now (research 2026-10-21)

- **Jira.** "Break down with Rovo" proposes child items from a parent's summary, description, existing
  children and linked pages; you accept, edit or decline each one before anything is created. In
  Confluence, highlighting text offers "+ Jira issue" with an AI-drafted summary, and a page scan proposes
  a batch of items, capped at ten.
- **Shortcut.** Korey sits in the right-click menu on a story to improve the description, clean up
  acceptance criteria, generate sub-tasks and spot dependencies. Docs let you highlight text and create a
  Story, Epic or Iteration from it, synced both ways. It is metered per interaction.
- **Linear.** Linear Agent, in beta since March 2026, drafts issues and descriptions from chat. Triage
  Intelligence suggests the team, assignee and labels and flags duplicates.
- **The common rule.** None of them write to the board directly. The model proposes, a person accepts, and
  batches stay small. "Refine only" matches that. Two details worth copying: a selection-based refine
  instead of a chat box, and suggesting the assignee from the roles section.

The limits that shape the AI part:

| Limit | Today | Why it matters |
| --- | --- | --- |
| Task estimate | 1 to 15 hours on the board | the template's guideline is 6 ideal hours |
| AI drafts | 10 per user per day, 5 per minute | the refine would share this quota |
| Model latency | 0.8 to 17 seconds through the gateway | the client gives up at 15 seconds today |
| Gateway | one shared by DEV and PROD, free daily cap | prompts must never be logged |

Sources:
- https://jimiwikman.se/atlassian/atlassian-resources/atlassian-app-updates/break-down-work-items-with-rovo-in-list-view-r1265/
- https://www.eesel.ai/blog/atlassian-intelligence-suggest-child-work-items
- https://support.atlassian.com/jira-software-cloud/docs/use-atlassian-intelligence-to-help-write-or-edit-content/
- https://community.atlassian.com/forums/Confluence-articles/Turn-Confluence-pages-into-trackable-work-in-Jira-with-the-help/ba-p/2894261
- https://www.atlassian.com/blog/confluence/moving-from-idea-to-action-with-confluence-and-jira
- https://www.shortcut.com/release-notes/
- https://www.shortcut.com/korey/
- https://www.shortcut.com/agents/
- https://www.shortcut.com/product/docs/
- https://www.shortcut.com/blog/10-ways-to-use-shortcut-docs/
- https://workmanagementhub.com/linear-agent-feature-deep-dive-2026/
- https://www.sentra.app/articles/linear-ai

## Open ends

Most important first, each with my pick.

1. **Source of truth after export.** Link the plan to the board and go live, or keep the doc independent and
   accept drift? My pick: link.
2. **Structured sections or a free-form page?** Form-like sections with Markdown only inside descriptions
   keep diffs clean and give the slug a target. The Google Docs feel is a far bigger build. My pick:
   structured.
3. **Roles per sprint versus the project's one scrum master.** The template lists roles per sprint; the app
   has one scrum master per project. My pick: the plan's roles are per sprint, and finalizing updates the
   project role when the scrum master changes. Finalizing itself: the scrum master, with the product owner
   as fallback.
4. **Conflict policy.** Last writer wins plus a diff, or the base-revision check with section merge? My
   pick: the check.
5. **The six-hour guideline.** Warn or block? My pick: warn in the checker and leave the board's cap alone.
6. **AI scope and budget.** Refine only, or also "draft a plan from the goal"? Same daily quota? My pick:
   refine only, same quota, thinking off, the timeout raised to about 25 seconds with the slug as the
   waiting state.
7. **TA involvement.** Notify on finalize? Comments on the plan? My pick: notify through the existing
   outbox; comments later, since the scrum comments table only knows stories and tasks.
8. **Where it lives.** A Plan view on the board page per sprint, reached from the sprint picker and the
   project page's sprint card? My pick: yes.
9. **Release plan and sprint report.** Now or later? My pick: later, with generic table names now.
10. **Does any TA still require a Google Doc?** If yes, the PDF export belongs in v1.

## Size

A project with a written design. After the answers: the spec, a builder check, then the plan
(superpowers:writing-plans). Mockups of the plan page and the slug refine can be shown in a browser tab on
request.
