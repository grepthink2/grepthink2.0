import { BarChart3, Clock, Layers, MessageSquare, School, Table as TableIcon, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import type { AnalyticsSection, AnalyticsUnit, ApiAnalyticsDashboard } from '@/lib/api/types';
import '../analytics.scss';
import { AnalyticsFilterRow } from '../components/AnalyticsFilterRow';
import { BarsBySprint, type CharsPanel } from '../components/BarsBySprint';
import { BreakdownTable, breakdownColumns, breakdownCsvRows } from '../components/BreakdownTable';
import { CardTable } from '../components/CardTable';
import { ChartCard, type ChartCardState } from '../components/ChartCard';
import { SplitBar } from '../components/SplitBar';
import { StackedBars, type StackedRow } from '../components/StackedBars';
import { StatTile } from '../components/StatTile';
import { TrendLines, TrendTable } from '../components/TrendLines';
import { UnitToggle } from '../components/UnitToggle';
import { WeeklyLine } from '../components/WeeklyLine';
import { useAnalyticsDashboard } from '../hooks/useAnalyticsDashboard';
import { compactNumber, dateLabel, rangeLabel } from '../utils/analyticsFormat';
import { downloadCsv, fileSlug, toCsv } from '../utils/csv';

const FORBIDDEN = 'Analytics is available to instructors and maintainers.';
const NO_CLASSES = 'Analytics appears once you teach a class.';
/** A range whose dates never break inside: each date's spaces become no-break spaces, while the dash between them can still break. */
const wholeDates = (from: string, to: string) => rangeLabel(from, to).split(' – ').map((date) => date.replace(/ /g, '\u00a0')).join(' – ');
const DEFINITIONS = {
  conversations: { title: 'How this is counted', body: 'Messages sent in team-member channels of the teams in view, plus direct messages between two people of the school, in the selected range. Conversations between staff and a student of their class are left out: the team ↔ TA and team ↔ instructor channels, and direct messages between an instructor or TA and a student of the same class. Direct messages are counted for the whole school and do not change with the class filter. Weeks start on Monday in the school\'s time zone.' },
  scrum: { title: 'How this is counted', body: 'Every task in view, by its current column and by the sprint of its story. Sprints are aligned by order within each team (Sprint 1 is each team\'s first sprint), not by date. Tasks whose story is in the backlog are "Backlog". Tasks of archived stories are not shown. Switch between the number of tasks and their story points. Stories and tasks created in the range count archived stories too. Characters per task or story count the title and description as typed, markdown included; each column shows the median, so half of the items are shorter.' },
  trends: { title: 'How this is counted', body: 'Weekly figures per team from the nightly rollup over the selected range, with the range of the same length just before it drawn in grey for comparison. Each night\'s rollup adds yesterday, at about 02:00 Pacific time and about 12:00 in Istanbul, so an Istanbul board snapshot (Points done) is taken at midday. Per-team figures count the teams of classes in session, from each class\'s first to its last day with activity. Only complete weeks are drawn: the week in progress appears once it ends. Deleted classes and teams stay in the history.' },
  active: 'People of the school who signed in explicitly in the last 7 days (staying signed in does not count).',
};
/** The scope counts are every class, team and student on record, active or not (counting by activity in the range is a follow-up). */
const ON_RECORD = {
  school: { classes: 'All classes on record', teams: 'All teams on record', students: 'All students on record' },
  class: { classes: 'The selected class', teams: 'All teams on record in this class', students: 'All students on record in this class' },
};

export default function AnalyticsPage() {
  const { canCreateClasses } = useAuth();
  const { scope, scopeLoading, scopeError, filters, setFilters, data, loading, refetching, error, errorDetail, refresh } = useAnalyticsDashboard();
  const [unit, setUnit] = useState<AnalyticsUnit>('count');
  const [compare, setCompare] = useState(true);
  const [conversationsTable, setConversationsTable] = useState(false);
  const [scrumTable, setScrumTable] = useState(false);
  const [trendsTable, setTrendsTable] = useState(false);

  const institution = useMemo(
    () => scope?.institutions.find((i) => i.id === filters.institutionId) ?? null,
    [scope, filters.institutionId],
  );
  const classes = useMemo(() => institution?.classes.map((c) => ({ id: c.id, label: c.label })) ?? [], [institution]);

  // An account with no class to report on: an instructor is told when the page fills in, anyone else whom it is for. The
  // empty scope decides before a refusal does: an `?institution` link asks before the scope arrives, and that 403 stays.
  const noScope = scope !== null && scope.institutions.length === 0;
  const refusal = noScope ? (canCreateClasses ? NO_CLASSES : FORBIDDEN) : error === 403 || scopeError === 403 ? FORBIDDEN : null;
  if (refusal) {
    return <div className="gt-analytics"><p className="gt-analytics__forbidden" role="status">{refusal}</p></div>;
  }

  const d: ApiAnalyticsDashboard | null = data;
  const o = d?.overview;
  // The last settled result decides a failure, so a retry in flight keeps the strip and the failed cards instead of
  // unmounting and announcing them again: the dashboard request's status (0 = unreachable), or the scope's while there
  // is no institution to load.
  const scopeFailed = scopeError !== null && scopeError !== 403 && !filters.institutionId;
  const failure = error !== null && error !== 403 ? error : scopeFailed ? scopeError : null;
  const failed = failure !== null;
  const pending = !d && !failed; // the first payload is on its way: skeletons
  const state = (section: AnalyticsSection, empty = false): ChartCardState => {
    if (failed && !d) return 'error';
    if (!d) return 'loading';
    if (d.failures.includes(section)) return 'error';
    if (empty) return 'empty';
    return refetching ? 'refetching' : 'ready';
  };
  // "Could not load" goes under a tile when the whole first load failed, or when its own figure is missing because its source failed.
  const hintFor = (value: number | null | undefined) =>
    (failed && !d) || (value == null && d?.failures.includes('overview')) ? 'Could not load' : undefined;
  // A refused request (4xx) says why in the backend's own fixed words ("a range may span at most 2 years"); anything
  // else keeps its status.
  const reason = error !== null && error >= 400 && error < 500 && errorDetail ? errorDetail.replace(/\.$/, '') : null;
  const failureNote = failed
    ? (failure === 0 ? 'The server could not be reached.'
      : reason ? `The latest request failed: ${reason}.`
      : `The latest request failed (HTTP ${failure}).`)
      + (d ? ' Showing the previous figures.' : '')
    : null;
  const range = d?.meta.range;
  const vs = !range ? ''
    : range.previous_from && range.previous_to ? `vs previous ${wholeDates(range.previous_from, range.previous_to)}`
    : 'no previous range';
  // With a class selected, the Messages tile and the Conversations footnote lead with that class's team-channel messages:
  // direct messages are counted for the whole school, so they appear beside it, never in it (spec Q-B4).
  const classView = Boolean(d?.meta.class);
  // A card whose section failed shows no footnote: its counts are null.
  const conversationsFootnote = d && range && !d.failures.includes('conversations')
    ? (classView
      ? `${compactNumber(d.conversations.team_members)} team messages`
      : `${compactNumber(d.conversations.total)} messages`)
      + ` · ${rangeLabel(range.from, range.to)} · direct messages are school-wide`
    : undefined;
  const scrumFootnote = d && !d.failures.includes('scrum')
    ? `${compactNumber(d.scrum.stories_created)} stories (${compactNumber(d.scrum.story_points_created)} pts) · `
      + `${compactNumber(d.scrum.tasks_created)} tasks (${compactNumber(d.scrum.task_points_created)} pts) created in range`
    : undefined;
  const weekly = d?.conversations.weekly ?? [];
  const boardRows: StackedRow[] = (d?.scrum.by_sprint ?? []).map((s) => ({
    key: String(s.ordinal),
    label: s.label,
    teams: s.teams,
    segments: [
      { status: 'todo', count: s.todo, points: s.points_todo },
      { status: 'in_progress', count: s.in_progress, points: s.points_in_progress },
      { status: 'done', count: s.done, points: s.points_done },
    ],
  }));
  const charsPanels: CharsPanel[] = (['task', 'story'] as const).map((entity) => {
    const rows = d?.scrum.chars.filter((c) => c.entity === entity) ?? [];
    const overall = rows.find((c) => c.ordinal === null);
    return {
      key: entity,
      title: entity === 'task' ? 'Characters per task' : 'Characters per story',
      overall: { median: overall?.median ?? 0, n: overall?.n ?? 0 },
      columns: rows.filter((c) => c.ordinal !== null).map((c) => ({ label: c.label, median: c.median, n: c.n })),
    };
  });
  const exportCsv = () => {
    if (!d) return;
    const columns = breakdownColumns(d.breakdown.kind).map((c) => ({ key: c.key, label: c.label }));
    const csv = toCsv(columns, breakdownCsvRows(d.breakdown.kind, d.breakdown.rows));
    // a class's export names the class too (its id when the label has nothing to spell a file name with)
    const cls = d.meta.class ? `-${fileSlug(d.meta.class.label) || d.meta.class.id.slice(0, 8)}` : '';
    downloadCsv(`analytics-${d.meta.institution.slug}${cls}-${d.meta.range.from}-${d.meta.range.to}.csv`, csv);
  };
  const onRecord = classView ? ON_RECORD.class : ON_RECORD.school;

  return (
    <div className="gt-analytics" aria-busy={pending || refetching || scopeLoading}>
      <header className="gt-analytics__header">
        <h1 className="gt-analytics__title"><BarChart3 size={20} aria-hidden="true" /> Analytics</h1>
        {institution ? <span className="gt-analytics__badge">{institution.name}</span> : null}
        <button type="button" className="gt-analytics__refresh" onClick={refresh} disabled={refetching || scopeLoading}>Refresh</button>
      </header>
      <AnalyticsFilterRow
        institutions={scope?.institutions.map((i) => ({ id: i.id, name: i.name })) ?? []}
        institutionId={filters.institutionId}
        classes={classes}
        classId={filters.classId}
        range={{ preset: filters.window, from: filters.from, to: filters.to }}
        onChange={setFilters}
        disabled={scopeLoading || (loading && !d)}
      />
      {failureNote && <p className="gt-analytics__error" role="alert">{failureNote}</p>}
      <section className="gt-analytics__tiles" aria-label="Overview">
        <StatTile label="Classes" value={o?.active_classes ?? null} icon={School} hint={hintFor(o?.active_classes) ?? (o ? onRecord.classes : undefined)} loading={pending} />
        <StatTile label="Teams" value={o?.teams ?? null} icon={Layers} accent="blue" hint={hintFor(o?.teams) ?? (o ? onRecord.teams : undefined)} loading={pending} />
        <StatTile label="Students" value={o?.students ?? null} icon={Users} accent="purple" hint={hintFor(o?.students) ?? (o ? onRecord.students : undefined)} loading={pending} />
        <StatTile
          label="Signed in (7d)"
          value={o?.active_users_7d ?? null}
          icon={Clock}
          accent="amber"
          hint={hintFor(o?.active_users_7d)
            ?? (o && o.active_users_7d === null ? 'Appears once sign-ins are recorded' : DEFINITIONS.active)}
          delta={o && o.active_users_7d !== null
            ? { value: o.deltas.active_users_7d ?? null, vsLabel: 'vs previous 7 days', goodWhenUp: true }
            : undefined}
          loading={pending}
        />
        {classView ? (
          <StatTile
            label="Team messages"
            value={d?.conversations.team_members ?? null}
            icon={MessageSquare}
            delta={o ? { value: o.deltas.team_messages ?? null, vsLabel: vs, goodWhenUp: true } : undefined}
            trend={o?.trends.team_messages}
            hint={hintFor(d?.conversations.team_members) ?? `Direct messages are school-wide: ${compactNumber(d?.conversations.dm)}`}
            loading={pending}
          />
        ) : (
          <StatTile
            label="Messages"
            value={o?.messages ?? null}
            icon={MessageSquare}
            delta={o ? { value: o.deltas.messages ?? null, vsLabel: vs, goodWhenUp: true } : undefined}
            trend={o?.trends.messages}
            hint={hintFor(o?.messages)}
            loading={pending}
          />
        )}
      </section>
      <div className="gt-analytics__grid">
        {/* Wide until sub-project C adds the Timeliness card beside it. */}
        <ChartCard
          className="gt-chart-card--wide"
          title="Conversations"
          subtitle="Team channels and direct messages."
          definition={DEFINITIONS.conversations}
          state={state('conversations', d?.conversations.total === 0)}
          emptyMessage={{ icon: MessageSquare, title: 'No messages yet', hint: 'Team channels fill in as teams start talking.' }}
          actions={(
            <button
              type="button"
              className="gt-analytics__toggle"
              aria-label="Conversations as a table"
              aria-pressed={conversationsTable}
              onClick={() => setConversationsTable((v) => !v)}
            >
              <TableIcon size={14} aria-hidden="true" /> Table
            </button>
          )}
          footnote={conversationsFootnote}
        >
          {d ? (conversationsTable ? (
            <CardTable
              caption="Messages per week"
              columns={[
                { key: 'week', label: 'Week' },
                { key: 'team', label: 'Team channels', numeric: true },
                { key: 'dm', label: 'Direct', numeric: true },
              ]}
              rows={weekly.map((w) => ({ key: w.week_start, cells: [dateLabel(w.week_start), w.team_members, w.dm] }))}
            />
          ) : (
            <>
              <WeeklyLine
                ariaLabel="Messages per week, team channels and direct messages"
                series={[
                  {
                    key: 'team',
                    label: 'Team channels',
                    colorClass: 'gt-series--1',
                    points: weekly.map((w) => ({ weekStart: w.week_start, value: w.team_members })),
                  },
                  {
                    key: 'dm',
                    label: 'Direct',
                    colorClass: 'gt-series--2',
                    points: weekly.map((w) => ({ weekStart: w.week_start, value: w.dm })),
                  },
                ]}
              />
              <SplitBar
                segments={[
                  { key: 'team', label: 'Team channels', value: d.conversations.team_members ?? 0, colorClass: 'gt-series--1' },
                  { key: 'dm', label: 'Direct', value: d.conversations.dm ?? 0, note: 'school-wide', colorClass: 'gt-series--2' },
                ]}
              />
            </>
          )) : null}
        </ChartCard>
        <ChartCard
          className="gt-chart-card--wide"
          title="Scrum board"
          subtitle="Tasks on every team's board right now, by sprint."
          live
          definition={DEFINITIONS.scrum}
          state={state('scrum', d?.scrum.by_sprint.length === 0)}
          emptyMessage={{ icon: Layers, title: 'No sprints yet', hint: 'Boards fill in once teams create their first sprint.' }}
          actions={(
            <>
              <UnitToggle value={unit} onChange={setUnit} />
              <button
                type="button"
                className="gt-analytics__toggle"
                aria-label="Board as a table"
                aria-pressed={scrumTable}
                onClick={() => setScrumTable((v) => !v)}
              >
                <TableIcon size={14} aria-hidden="true" /> Table
              </button>
            </>
          )}
          footnote={scrumFootnote}
        >
          {d ? (scrumTable ? (
            <CardTable
              caption={unit === 'points' ? 'Story points on the board by sprint' : 'Tasks on the board by sprint'}
              columns={[
                { key: 'sprint', label: 'Sprint' },
                { key: 'teams', label: 'Teams', numeric: true },
                { key: 'todo', label: 'To do', numeric: true },
                { key: 'in_progress', label: 'In progress', numeric: true },
                { key: 'done', label: 'Done', numeric: true },
              ]}
              rows={d.scrum.by_sprint.map((s) => ({
                key: String(s.ordinal),
                cells: unit === 'points'
                  ? [s.label, s.teams, s.points_todo, s.points_in_progress, s.points_done]
                  : [s.label, s.teams, s.todo, s.in_progress, s.done],
              }))}
            />
          ) : (
            <div className="gt-analytics__scrum">
              <StackedBars unit={unit} rows={boardRows} />
              <BarsBySprint panels={charsPanels} />
            </div>
          )) : null}
        </ChartCard>
        <ChartCard
          className="gt-chart-card--wide"
          title="Trends"
          subtitle="Week by week, against the previous range."
          definition={DEFINITIONS.trends}
          state={state('trends')}
          actions={(
            <>
              {/* The table lists this range only, so the comparison does not apply to it. */}
              <label className="gt-analytics__check">
                <input type="checkbox" checked={compare} disabled={trendsTable} onChange={(e) => setCompare(e.target.checked)} /> Compare with previous range
              </label>
              <button
                type="button"
                className="gt-analytics__toggle"
                aria-label="Trends as a table"
                aria-pressed={trendsTable}
                onClick={() => setTrendsTable((v) => !v)}
              >
                <TableIcon size={14} aria-hidden="true" /> Table
              </button>
            </>
          )}
        >
          {d ? (trendsTable
            ? <TrendTable panels={d.trends.panels} asOf={d.trends.as_of} />
            : <TrendLines panels={d.trends.panels} compare={compare} asOf={d.trends.as_of} />) : null}
        </ChartCard>
        <ChartCard
          className="gt-chart-card--wide"
          title={d?.breakdown.kind === 'team' ? 'By team' : 'By class'}
          state={state('breakdown', d?.breakdown.rows.length === 0)}
          emptyMessage={{ icon: TableIcon, title: 'Nothing to list', hint: 'Rows appear once the school has classes and teams.' }}
        >
          {d ? <BreakdownTable kind={d.breakdown.kind} rows={d.breakdown.rows} onExport={exportCsv} /> : null}
        </ChartCard>
      </div>
      <p className="gt-analytics__footnote">
        Aggregates only. No individual student is identified on this page. Groups of fewer than 3 are combined.
      </p>
    </div>
  );
}
