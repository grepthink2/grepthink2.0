import { BarChart3, Clock, Layers, MessageSquare, School, Table as TableIcon, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AnalyticsSection, AnalyticsUnit, ApiAnalyticsDashboard } from '@/lib/api/types';
import '../analytics.scss';
import { AnalyticsFilterRow } from '../components/AnalyticsFilterRow';
import { BarsBySprint } from '../components/BarsBySprint';
import { BreakdownTable, breakdownColumns, breakdownCsvRows } from '../components/BreakdownTable';
import { ChartCard, type ChartCardState } from '../components/ChartCard';
import { SplitBar } from '../components/SplitBar';
import { StackedBars } from '../components/StackedBars';
import { StatTile } from '../components/StatTile';
import { TrendLines } from '../components/TrendLines';
import { UnitToggle } from '../components/UnitToggle';
import { WeeklyLine } from '../components/WeeklyLine';
import { useAnalyticsDashboard } from '../hooks/useAnalyticsDashboard';
import { compactNumber, rangeLabel } from '../utils/analyticsFormat';
import { downloadCsv, toCsv } from '../utils/csv';

const FORBIDDEN = 'Analytics is available to instructors and maintainers.';
const DEFINITIONS = {
  conversations: { title: 'How this is counted', body: 'Messages sent in team-member channels of the teams in view, plus direct messages between two people of the school, in the selected range. Conversations between staff and a student of their class are left out: the team ↔ TA and team ↔ instructor channels, and direct messages between an instructor or TA and a student of the same class. Direct messages are counted for the whole school and do not change with the class filter. Weeks start on Monday in the school\'s time zone.' },
  scrum: { title: 'How this is counted', body: 'Every task in view, by its current column and by the sprint of its story. Sprints are aligned by order within each team (Sprint 1 is each team\'s first sprint), not by date. Tasks whose story is in the backlog are "Backlog". Tasks of archived stories are not shown. Switch between the number of tasks and their story points. Stories and tasks created in the range count archived stories too.' },
  chars: { title: 'How this is counted', body: 'The number of characters in a task\'s (or story\'s) title and description, as typed, including markdown. The median is shown; half of the items are shorter.' },
  trends: { title: 'How this is counted', body: 'Weekly figures per team from the nightly snapshot over the selected range, with the range of the same length just before it drawn in grey for comparison. Deleted classes and teams stay in the history. Yesterday is the latest day; today is added tonight.' },
  active: 'People of the school who signed in at least once in the last seven days.',
};

export default function AnalyticsPage() {
  const { scope, scopeLoading, scopeError, filters, setFilters, data, loading, refetching, error, refresh } = useAnalyticsDashboard();
  const [unit, setUnit] = useState<AnalyticsUnit>('count');
  const [compare, setCompare] = useState(true);
  const [conversationsTable, setConversationsTable] = useState(false);
  const [scrumTable, setScrumTable] = useState(false);

  const institution = useMemo(() => scope?.institutions.find((i) => i.id === filters.institutionId) ?? null, [scope, filters.institutionId]);
  const classes = useMemo(() => institution?.classes.map((c) => ({ id: c.id, label: c.label })) ?? [], [institution]);

  if (error === 403 || scopeError === 403 || (scope !== null && scope.institutions.length === 0)) {
    return <div className="gt-analytics"><p className="gt-analytics__forbidden" role="status">{FORBIDDEN}</p></div>;
  }

  const failed = error !== null && error !== 403 && !refetching; // the latest request failed (0 = unreachable)
  const state = (section: AnalyticsSection, empty = false): ChartCardState => {
    if (failed && !data) return 'error';
    if (loading || !data) return 'loading';
    if (data.failures.includes(section)) return 'error';
    if (empty) return 'empty';
    return refetching ? 'refetching' : 'ready';
  };
  const d: ApiAnalyticsDashboard | null = data;
  // a null count whose source failed, or a first load that failed outright
  const tileHint = (failed && !d) || d?.failures.includes('overview') ? 'Could not load' : undefined;
  const failureNote = failed
    ? `${error === 0 ? 'The server could not be reached.' : `The latest request failed (HTTP ${error}).`}${d ? ' Showing the previous figures.' : ''}`
    : null;
  const vs = d ? (d.meta.range.previous_from ? `vs previous ${rangeLabel(d.meta.range.previous_from, d.meta.range.previous_to!)}` : 'no previous range') : '';
  const exportCsv = () => {
    if (!d) return;
    const csv = toCsv(breakdownColumns(d.breakdown.kind).map((c) => ({ key: c.key, label: c.label })), breakdownCsvRows(d.breakdown.kind, d.breakdown.rows));
    downloadCsv(`analytics-${d.meta.institution.slug}-${d.meta.range.from}-${d.meta.range.to}.csv`, csv);
  };

  return (
    <div className="gt-analytics" aria-busy={refetching}>
      <header className="gt-analytics__header">
        <h1 className="gt-analytics__title"><BarChart3 size={20} aria-hidden="true" /> Analytics</h1>
        {institution ? <span className="gt-analytics__badge">{institution.name}</span> : null}
        <button type="button" className="gt-analytics__refresh" onClick={refresh} disabled={!d}>Refresh</button>
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
        <StatTile label="Classes" value={d?.overview.active_classes ?? null} icon={School} hint={tileHint} loading={loading} />
        <StatTile label="Teams" value={d?.overview.teams ?? null} icon={Layers} accent="blue" hint={tileHint} loading={loading} />
        <StatTile label="Students" value={d?.overview.students ?? null} icon={Users} accent="purple" hint={tileHint} loading={loading} />
        <StatTile label="Active users (7d)" value={d?.overview.active_users_7d ?? null} icon={Clock} accent="amber" hint={tileHint ?? (d && d.overview.active_users_7d === null ? 'Appears once sign-ins are recorded' : DEFINITIONS.active)} delta={d && d.overview.active_users_7d !== null ? { value: d.overview.deltas.active_users_7d ?? null, vsLabel: 'vs previous 7 days', goodWhenUp: true } : undefined} loading={loading} />
        <StatTile label="Messages" value={d?.overview.messages ?? null} icon={MessageSquare} delta={d ? { value: d.overview.deltas.messages ?? null, vsLabel: vs, goodWhenUp: true } : undefined} trend={d?.overview.trends.messages} hint={tileHint} loading={loading} />
      </section>
      <div className="gt-analytics__grid">
        <ChartCard title="Conversations" subtitle="Team channels and direct messages." definition={DEFINITIONS.conversations} state={state('conversations', d?.conversations.total === 0)} emptyMessage={{ icon: MessageSquare, title: 'No messages yet', hint: 'Team channels fill in as teams start talking.' }}
          actions={<button type="button" className="gt-analytics__toggle" aria-pressed={conversationsTable} onClick={() => setConversationsTable((v) => !v)}><TableIcon size={14} aria-hidden="true" /> Table</button>}
          footnote={d ? `${compactNumber(d.conversations.total)} messages · ${rangeLabel(d.meta.range.from, d.meta.range.to)} · direct messages are school-wide` : undefined}>
          {d ? (conversationsTable ? (
            <div className="gt-table__scroll"><table className="gt-table__table"><thead><tr><th scope="col">Week</th><th scope="col" className="gt-table__num">Team channels</th><th scope="col" className="gt-table__num">Direct</th></tr></thead>
              <tbody>{d.conversations.weekly.map((w) => <tr key={w.week_start}><td>{w.week_start}</td><td className="gt-table__num">{w.team_members}</td><td className="gt-table__num">{w.dm}</td></tr>)}</tbody></table></div>
          ) : (
            <>
              <WeeklyLine ariaLabel="Messages per week, team channels and direct messages" series={[
                { key: 'team', label: 'Team channels', colorClass: 'gt-series--1', points: d.conversations.weekly.map((w) => ({ weekStart: w.week_start, value: w.team_members })) },
                { key: 'dm', label: 'Direct', colorClass: 'gt-series--2', points: d.conversations.weekly.map((w) => ({ weekStart: w.week_start, value: w.dm })) }]} />
              <SplitBar segments={[{ key: 'team', label: 'Team channels', value: d.conversations.team_members ?? 0, colorClass: 'gt-series--1' }, { key: 'dm', label: 'Direct', value: d.conversations.dm ?? 0, note: 'school-wide', colorClass: 'gt-series--2' }]} />
            </>
          )) : null}
        </ChartCard>
        <ChartCard className="gt-chart-card--wide" title="Scrum board" subtitle="Tasks on every team's board right now, by sprint." live definition={DEFINITIONS.scrum} state={state('scrum', d?.scrum.by_sprint.length === 0)} emptyMessage={{ icon: Layers, title: 'No sprints yet', hint: 'Boards fill in once teams create their first sprint.' }}
          actions={<><UnitToggle value={unit} onChange={setUnit} /><button type="button" className="gt-analytics__toggle" aria-pressed={scrumTable} onClick={() => setScrumTable((v) => !v)}><TableIcon size={14} aria-hidden="true" /> Table</button></>}
          footnote={d ? `${compactNumber(d.scrum.stories_created)} stories (${compactNumber(d.scrum.story_points_created)} pts) · ${compactNumber(d.scrum.tasks_created)} tasks (${compactNumber(d.scrum.task_points_created)} pts) created in range` : undefined}>
          {d ? (scrumTable ? (
            <div className="gt-table__scroll"><table className="gt-table__table"><thead><tr><th scope="col">Sprint</th><th scope="col" className="gt-table__num">Teams</th><th scope="col" className="gt-table__num">To do</th><th scope="col" className="gt-table__num">In progress</th><th scope="col" className="gt-table__num">Done</th></tr></thead>
              <tbody>{d.scrum.by_sprint.map((s) => <tr key={s.ordinal}><td>{s.label}</td><td className="gt-table__num">{s.teams}</td><td className="gt-table__num">{unit === 'points' ? s.points_todo : s.todo}</td><td className="gt-table__num">{unit === 'points' ? s.points_in_progress : s.in_progress}</td><td className="gt-table__num">{unit === 'points' ? s.points_done : s.done}</td></tr>)}</tbody></table></div>
          ) : (
            <div className="gt-analytics__scrum">
              <StackedBars unit={unit} rows={d.scrum.by_sprint.map((s) => ({ key: String(s.ordinal), label: s.label, teams: s.teams, segments: [
                { status: 'todo', count: s.todo, points: s.points_todo }, { status: 'in_progress', count: s.in_progress, points: s.points_in_progress }, { status: 'done', count: s.done, points: s.points_done }] }))} />
              <BarsBySprint panels={(['task', 'story'] as const).map((entity) => {
                const rows = d.scrum.chars.filter((c) => c.entity === entity);
                const overall = rows.find((c) => c.ordinal === null);
                return { key: entity, title: entity === 'task' ? 'Characters per task' : 'Characters per story', overall: { median: overall?.median ?? 0, n: overall?.n ?? 0 }, columns: rows.filter((c) => c.ordinal !== null).map((c) => ({ label: c.label, median: c.median, n: c.n })) };
              })} />
            </div>
          )) : null}
        </ChartCard>
        <ChartCard className="gt-chart-card--wide" title="Trends" subtitle="Week by week, against the previous range." definition={DEFINITIONS.trends} state={state('trends')}
          actions={<label className="gt-analytics__check"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with previous range</label>}>
          {d ? <TrendLines panels={d.trends.panels} compare={compare} asOf={d.trends.as_of} /> : null}
        </ChartCard>
        <ChartCard className="gt-chart-card--wide" title={d?.breakdown.kind === 'team' ? 'By team' : 'By class'} state={state('breakdown', d?.breakdown.rows.length === 0)} emptyMessage={{ icon: TableIcon, title: 'Nothing to list', hint: 'Rows appear once the school has classes and teams.' }}>
          {d ? <BreakdownTable kind={d.breakdown.kind} rows={d.breakdown.rows} onExport={exportCsv} /> : null}
        </ChartCard>
      </div>
      <p className="gt-analytics__footnote">Aggregates only. No individual student is identified on this page. Groups of fewer than 3 are combined.</p>
    </div>
  );
}
