/* GrepThink Analytics — page composition for the UI kit.
   Composes components/analytics/*; reads window.ANALYTICS_SAMPLE / _EMPTY. */
const NS = window.GrepThinkDesignSystem_36e7e3;
const { SidebarNavItem, SidebarSectionTitle, Badge, Button,
        AnalyticsFilterRow, StatTile, ChartCard, ChartCardTool, ChartCardCheck, UnitToggle, AnalyticsIcon,
        WeeklyLine, SplitBar, StackedBars, TimelinessBars, OnTimeMeter, BarsBySprint, TrendLines, BreakdownTable,
        BREAKDOWN_COLUMNS, TEAM_BREAKDOWN_COLUMNS, TIMELINESS_COLUMNS } = NS;

// Local copies of the ChartFormat helpers (keeps the kit independent of bundle compile timing).
const fmtCompact = (n) => (n === null || n === undefined ? '—' : Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : Math.abs(n) >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : n.toLocaleString('en-US'));
const fmtWeek = (iso, y) => { const [Y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(Y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}), timeZone: 'UTC' }); };
const fmtRange = (a, b) => { const cross = a.slice(0, 4) !== b.slice(0, 4); return `${fmtWeek(a, cross)} – ${fmtWeek(b, cross)}`; };

const CLASSES = [
  { id: 'c1', label: 'CSE 115A · Fall 2026' }, { id: 'c2', label: 'CSE 115B' },
  { id: 'c3', label: 'CSE 115C · Fall 2026' }, { id: 'c4', label: 'CSE 115D (pilot) · Fall 2026' },
];

const DEFS = {
  messages: 'Messages sent in team-member channels of the teams in view, plus direct messages between two people of the school, in the selected range. Conversations between staff and a student of their class are left out: the team ↔ TA and team ↔ instructor channels, and direct messages between an instructor or TA and a student of the same class. Direct messages are counted for the whole school and do not change with the class filter. Weeks start on Monday in the school\u2019s time zone.',
  timeliness: 'For each assignment due in the range, every expected submitter (team members for a TSR; enrolled students for feedback and interest forms) is placed in one bucket by the time they finished submitting: early (more than 24 h before the deadline), on time (within the last 24 h), late (after the deadline, inside the late-submission window), or missing (nothing by the end). The deadline is the end of the due date in the school\u2019s time zone, as it was set \u2014 reopening an assignment adds a late window and does not move it. Submissions edited after the deadline are counted separately. \u201cNot due yet\u201d rows are shown but excluded from the on-time rate.',
  scrum: 'Every task in view, by its current column and by the sprint of its story. Sprints are aligned by order within each team (Sprint 1 is each team\u2019s first sprint), not by date. Tasks whose story is in the backlog are \u201cBacklog\u201d. Tasks of archived stories are not shown. Switch between the number of tasks and their story points.',
  chars: 'The number of characters in a task\u2019s (or story\u2019s) title and description, as typed, including markdown. The median is shown; half of the items are shorter.',
  active: 'People of the school who signed in explicitly in the last 7 days (staying signed in does not count).',
  trends: 'Weekly figures per team from the nightly rollup over the selected range, with the range of the same length just before it drawn in grey for comparison. Each night\u2019s rollup adds yesterday, at about 02:00 Pacific time and about 12:00 in Istanbul, so an Istanbul board snapshot (Points done) is taken at midday. Per-team figures count only the classes in session, from the week of each class\u2019s first activity to the week of its last. Only complete weeks are drawn: the week in progress appears once it ends. Deleted classes and teams stay in the history.',
};

// Tile hints (revision 2026-10-08): counts are everything on record, active or not.
const HINTS = {
  classes: (cls) => (cls ? 'The selected class' : 'All classes on record'),
  teams: (cls) => (cls ? 'All teams on record in this class' : 'All teams on record'),
  students: (cls) => (cls ? 'All students on record in this class' : 'All students on record'),
  signedIn: DEFS.active,
};

// Page failure strip copy (the page's one alert). `kind`: http | refused | unreachable.
function failureText(f, hasPrevious) {
  const base = f.kind === 'http' ? `The latest request failed (HTTP ${f.status}).`
    : f.kind === 'refused' ? `The latest request failed: ${f.reason}`
    : 'The server could not be reached.';
  return hasPrevious ? `${base} Showing the previous figures.` : base;
}

const PRESET_DAYS = { '7d': 7, '30d': 30, '90d': 90, 'class': 14, 'all': 120 };
const TODAY = '2026-10-07';
function shiftIso(iso, days) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function rangeFor(range) {
  if (range.preset === 'custom' && range.from && range.to) return { from: range.from, to: range.to };
  const days = PRESET_DAYS[range.preset] || 30;
  return { from: shiftIso(TODAY, -(days - 1)), to: TODAY };
}
function previousOf({ from, to }) {
  const len = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  return { from: shiftIso(from, -len), to: shiftIso(from, -1) };
}

function toCsv(rows, columns) {
  const esc = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\n');
}

const Icons = {
  home: <AnalyticsIcon name="layout-grid" />, msg: <AnalyticsIcon name="message-square" />, classes: <AnalyticsIcon name="graduation-cap" />,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  chart: <AnalyticsIcon name="bar-chart-3" />,
  gear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
};

const FOOTNOTE = 'Aggregates only. No individual student is identified on this page. Groups of fewer than 3 are combined.';

function Shell({ active = 'Analytics', children, hideSidebar }) {
  return (
    <div className="an-app">
      {!hideSidebar && (
        <aside className="an-side">
          <img className="an-side__logo" src="../../assets/grepthink-logo.svg" alt="GrepThink" />
          <SidebarSectionTitle>Main</SidebarSectionTitle>
          <SidebarNavItem icon={Icons.home} label="Home" />
          <SidebarNavItem icon={Icons.msg} label="Messages" badge={2} />
          <SidebarNavItem icon={Icons.classes} label="My Classes" />
          <SidebarNavItem icon={Icons.plus} label="Create Class" />
          {active === 'Analytics' && <SidebarNavItem icon={Icons.chart} label="Analytics" active />}
          <SidebarSectionTitle>Settings</SidebarSectionTitle>
          <SidebarNavItem icon={Icons.gear} label="Settings" />
        </aside>
      )}
      <div className="an-main">{children}</div>
    </div>
  );
}

function AnalyticsScreen({ data, demoState, withTimeliness, failure }) {
  const [filter, setFilter] = React.useState({ classId: '', range: { preset: '30d' } });
  const [unit, setUnit] = React.useState('count');
  const [compare, setCompare] = React.useState(true);
  const [tables, setTables] = React.useState({});
  const [sort, setSort] = React.useState({ key: 'team_messages', dir: 'desc' });
  const [refetching, setRefetching] = React.useState(false);
  const [retried, setRetried] = React.useState(false);
  const timer = React.useRef(null);

  const simulateRefetch = () => {
    if (demoState === 'loading' || demoState === 'empty') return;
    setRefetching(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRefetching(false), 800);
  };
  const onFilter = (v) => { setFilter(v); simulateRefetch(); };
  const toggleTable = (k) => setTables((t) => ({ ...t, [k]: !t[k] }));
  const view = (k) => (tables[k] ? 'table' : 'chart');

  const loading = demoState === 'loading';
  const isRefetch = demoState === 'refetching' || refetching;
  const cardState = (key, hasData) => (loading ? 'loading' : (data.failures.includes(key) && !retried) ? 'error' : !hasData ? 'empty' : isRefetch ? 'refetching' : 'ready');

  const cur = filter.range.preset === '30d' && !filter.classId ? { from: data.meta.range.from, to: data.meta.range.to } : rangeFor(filter.range);
  const prev = filter.range.preset === 'all' ? null : (filter.range.preset === '30d' && !filter.classId && data.meta.range.previous_from ? { from: data.meta.range.previous_from, to: data.meta.range.previous_to } : previousOf(cur));
  const rangeLabel = fmtRange(cur.from, cur.to);
  const prevLabel = prev ? `vs previous ${fmtRange(prev.from, prev.to)}` : null;
  const classView = filter.classId ? window.ANALYTICS_CLASS_VIEW(filter.classId) : null;
  const classLabel = CLASSES.find((c) => c.id === filter.classId)?.label;
  const o = data.overview, conv = data.conversations, sc = data.scrum;
  const tl = withTimeliness ? data.timeliness : { ...data.timeliness, on_time_rate: null, rows: [], expected: 0, late: 0, missing: 0, edited_late: 0 };

  const timeRows = (classView ? classView.rows : tl.rows).map((r) => ({
    key: r.key, label: r.label, dueAt: r.due_at, expected: r.expected, editedLate: r.edited_late, href: r.kind === 'folded' ? undefined : r.href,
    folded: r.kind === 'folded', notDueYet: !!r.notDueYet, buckets: Object.entries(r.buckets).map(([key, value]) => ({ key, value })),
  }));
  const stackedRows = sc.by_sprint.map((s) => ({ key: String(s.ordinal), label: s.label, teams: s.teams, segments: [
    { status: 'todo', count: s.todo, points: s.points_todo }, { status: 'in_progress', count: s.in_progress, points: s.points_in_progress }, { status: 'done', count: s.done, points: s.points_done }] }));
  const charPanels = ['task', 'story'].map((e) => ({ key: e, title: e === 'task' ? 'Tasks' : 'Stories', overall: sc.chars.find((c) => c.entity === e && c.ordinal === null) || { median: 0, n: 0 }, columns: sc.chars.filter((c) => c.entity === e && c.ordinal !== null) }));
  const trendPanels = data.trends.panels.filter((p) => withTimeliness || p.key !== 'on_time_rate').map((p) => ({ ...p,
    // Demo: the 7d preset holds only the week in progress (→ "No complete week in this range yet.");
    // the pilot class (c4) had no class in session (→ "No team activity in this range.").
    current: p.current.filter((x) => filter.range.preset !== '7d' || x.week_start >= cur.from).map((x) => ({ weekStart: x.week_start, value: filter.classId === 'c4' ? null : x.value })),
    previous: p.previous && filter.range.preset !== '7d' ? p.previous.map((x) => ({ weekStart: x.week_start, value: filter.classId === 'c4' ? null : x.value })) : null }));
  const bdRows = classView ? classView.teams : data.breakdown.rows;
  const columns = [...(classView ? TEAM_BREAKDOWN_COLUMNS : BREAKDOWN_COLUMNS), ...(withTimeliness ? TIMELINESS_COLUMNS : [])];

  const exportCsv = () => {
    const blob = new Blob([toCsv(bdRows, columns)], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `grepthink-analytics-${data.meta.institution.slug}-${cur.from}_${cur.to}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const onRowView = (r) => { if (classView) { window.alert(`Opens ${r.name}\u2019s scrum board`); } else { onFilter({ ...filter, classId: r.id }); } };

  const sub = (s) => (filter.classId ? `${s} · ${classLabel}` : s);
  const hasAny = o.teams > 0 || o.messages > 0;
  const failed = (key) => data.failures.includes(key) && !retried;
  const tableCard = (key, pressed) => <span className="gt-analytics__toggle"><ChartCardTool icon="table" label="Table" pressed={pressed} onClick={() => toggleTable(key)} /></span>;
  // With a class selected the Messages tile becomes that class's team-channel messages; direct messages stay school-wide.
  const teamMsgs = classView ? classView.teams.reduce((s, t) => s + (t.team_messages || 0), 0) : null;
  const convFoot = classView
    ? `${fmtCompact(teamMsgs)} team messages · ${rangeLabel} · direct messages are school-wide: ${fmtCompact(conv.dm)}`
    : `${fmtCompact(conv.total)} messages · ${rangeLabel} · direct messages are school-wide`;

  return (
    <div className="gt-analytics">
      <div className="gt-analytics__header">
        <h1 className="gt-analytics__title"><AnalyticsIcon name="bar-chart-3" size={20} />Analytics</h1>
        <span className="gt-analytics__badge"><Badge tone="neutral">{data.meta.institution.name}</Badge></span>
        <span className="gt-analytics__refresh">
          <Button variant="secondary" size="sm" iconLeft={<AnalyticsIcon name="refresh-cw" size={14} />} onClick={simulateRefetch} disabled={loading}>Refresh</Button>
        </span>
      </div>

      <AnalyticsFilterRow classes={CLASSES} classId={filter.classId} range={filter.range} onChange={onFilter} disabled={loading} today={new Date(`${TODAY}T12:00:00Z`)} />

      {failure && (
        <div className="gt-analytics__error" role="alert">
          <AnalyticsIcon name="alert-circle" size={15} />
          <span className="gt-analytics__error-text">{failureText(failure, true)}</span>
        </div>
      )}

      <div className={['gt-analytics__tiles', withTimeliness ? 'gt-analytics__tiles--6' : ''].filter(Boolean).join(' ')}>
        <StatTile label="Classes" value={classView ? 1 : o.active_classes} icon={<AnalyticsIcon name="graduation-cap" />} loading={loading} failed={failed('overview') && o.active_classes === null} hint={HINTS.classes(filter.classId)} />
        <StatTile label="Teams" value={classView ? classView.teams.length : o.teams} icon={<AnalyticsIcon name="users" />} accent="blue" loading={loading} failed={failed('overview') && o.teams === null} hint={HINTS.teams(filter.classId)} />
        <StatTile label="Students" value={classView ? classView.teams.reduce((s, t) => s + (t.members || 0), 0) : o.students} icon={<AnalyticsIcon name="users" />} accent="purple" loading={loading} failed={failed('overview') && o.students === null} hint={HINTS.students(filter.classId)} />
        <StatTile label="Signed in (7d)" value={o.active_users_7d} icon={<AnalyticsIcon name="activity" />} accent="amber" loading={loading}
          delta={{ value: o.active_users_7d === null ? null : (o.deltas.active_users_7d ?? null), vsLabel: 'vs the 7 days before' }}
          hint={o.active_users_7d === null ? 'Appears once sign-ins are recorded' : HINTS.signedIn} />
        {classView ? (
          <StatTile label="Team messages" value={teamMsgs} icon={<AnalyticsIcon name="message-square" />} loading={loading}
            delta={{ value: prev ? (o.deltas.messages ?? null) : null, vsLabel: prevLabel }} trend={o.trends.messages ? o.trends.messages.map((v) => Math.round(v * 0.45)) : undefined}
            hint={`Direct messages are school-wide: ${fmtCompact(conv.dm)}`} />
        ) : (
          <StatTile label="Messages" value={o.messages} icon={<AnalyticsIcon name="message-square" />} loading={loading}
            delta={{ value: prev ? (o.deltas.messages ?? null) : null, vsLabel: prevLabel }} trend={o.trends.messages} />
        )}
        {withTimeliness && (
          <StatTile label="On time" value={tl.on_time_rate} format="percent" icon={<AnalyticsIcon name="check-circle-2" />} accent="blue" loading={loading}
            delta={{ value: prev ? (o.deltas.on_time_rate ?? null) : null, vsLabel: prevLabel }} hint={tl.on_time_rate === null ? 'No deadlines in this range' : undefined} />
        )}
      </div>

      <div className="gt-analytics__grid">
        <ChartCard title="Conversations" subtitle={sub('Team channels and direct messages.')} definition={DEFS.messages} wide={!withTimeliness}
          state={cardState('conversations', conv.weekly.length > 0)}
          emptyMessage={{ icon: 'message-square', title: 'No messages yet', hint: 'Team channels fill in as teams start talking.' }}
          hero={fmtCompact(conv.total)} heroMeta="messages in range"
          footnote={convFoot}
          actions={tableCard('conv', !!tables.conv)}>
          <WeeklyLine height={200} view={view('conv')} series={[
            { key: 'team', label: 'Team channels', points: conv.weekly.map((w) => ({ weekStart: w.week_start, value: w.team_members })) },
            { key: 'dm', label: 'Direct', points: conv.weekly.map((w) => ({ weekStart: w.week_start, value: w.dm })) }]} />
          {view('conv') === 'chart' && <div style={{ marginTop: 14 }}>
            <SplitBar mixedScope={!!filter.classId} segments={[{ key: 'team', label: 'Team channels', value: conv.team_members }, { key: 'dm', label: 'Direct', value: conv.dm, note: 'school-wide' }]} />
          </div>}
        </ChartCard>

        {withTimeliness && (
          <ChartCard title="Timeliness" subtitle={sub('Submissions against the deadline.')} definition={DEFS.timeliness}
            state={cardState('timeliness', timeRows.length > 0)}
            emptyMessage={{ icon: 'calendar', title: 'No deadlines in this range', hint: 'Timeliness fills in once an assignment is due.' }}
            footnote={tl.edited_late ? `${tl.edited_late} submissions were edited after the deadline · "Not due yet" rows are excluded from the rate` : undefined}
            actions={tableCard('time', !!tables.time)}>
            <OnTimeMeter rate={tl.on_time_rate} late={tl.late} missing={tl.missing} editedLate={tl.edited_late} />
            <div style={{ marginTop: 14 }}><TimelinessBars rows={timeRows} view={view('time')} bucketOrder={tl.bucket_order} /></div>
          </ChartCard>
        )}

        <ChartCard wide title="Scrum board" live subtitle={sub('Tasks on every team\u2019s board right now, by sprint.')} definition={DEFS.scrum}
          state={cardState('scrum', stackedRows.length > 0)} onRetry={() => setRetried(true)}
          emptyMessage={{ icon: 'kanban', title: 'No sprints yet', hint: 'Boards fill in once teams create their first sprint.' }}
          footnote={`${sc.stories_created} stories (${sc.story_points_created} pts) · ${sc.tasks_created} tasks (${sc.task_points_created} pts) created in range`}
          actions={<><UnitToggle value={unit} onChange={setUnit} />{tableCard('scrum', !!tables.scrum)}</>}>
          <div className="gt-analytics__scrum">
            <StackedBars rows={stackedRows} unit={unit} view={view('scrum')} />
            <BarsBySprint height={128} panels={charPanels} view={view('scrum')} />
          </div>
        </ChartCard>

        <ChartCard wide title="Trends" subtitle="Week by week, against the previous range." definition={DEFS.trends}
          state={cardState('trends', trendPanels.length > 0)}
          emptyMessage={{ icon: 'trending-up', title: 'Trends appear after the first nightly rollup.' }}
          footnote={undefined}
          actions={<><span className="gt-analytics__check"><ChartCardCheck label="Compare with previous range" checked={compare && !!prev} onChange={setCompare} disabled={!prev} /></span>{tableCard('trends', !!tables.trends)}</>}>
          <TrendLines panels={trendPanels} compare={compare && !!prev} asOf={data.trends.as_of} height={96} view={view('trends')} />
        </ChartCard>

        <ChartCard wide title={classView ? `By team · ${classLabel}` : 'By class'} subtitle={`Teams, activity and board progress · ${rangeLabel}`}
          state={cardState('breakdown', bdRows.length > 0)}
          emptyMessage={{ icon: 'table', title: 'Nothing to list', hint: 'Rows appear once the school has classes and teams.' }}
          actions={<ChartCardTool icon="download" label="Export CSV" className="gt-table__export" onClick={exportCsv} disabled={!bdRows.length} />}>
          <BreakdownTable rows={bdRows} columns={columns} sort={sort} onSort={setSort} onRowView={onRowView} />
        </ChartCard>
      </div>

      <p className="gt-analytics__footnote">{FOOTNOTE}</p>
    </div>
  );
}

function Forbidden() {
  return (
    <div className="gt-analytics">
      <div className="gt-analytics__header">
        <h1 className="gt-analytics__title"><AnalyticsIcon name="bar-chart-3" size={20} />Analytics</h1>
      </div>
      <div className="gt-analytics__forbidden" role="status">
        <span className="gt-analytics__forbidden-icon"><AnalyticsIcon name="shield-off" size={20} /></span>
        <span className="gt-analytics__forbidden-title">Analytics is available to instructors and maintainers.</span>
        <span className="gt-analytics__forbidden-text">Your class dashboard shows your own team{'\u2019'}s progress. Ask your instructor if you need an institution-wide view.</span>
      </div>
      <p className="gt-analytics__footnote">{FOOTNOTE}</p>
    </div>
  );
}

const WIDTHS = { desktop: null, '1000': 1000, phone: 390 };

// Demo: a refetch that failed — the previous payload stays on screen, one source came back null.
function failedVariant(base) {
  const d = JSON.parse(JSON.stringify(base));
  d.overview.teams = null;
  d.breakdown.rows.forEach((r, i) => { if (i % 2 === 1) r.team_messages = null; });
  d.failures = ['overview'];
  d.meta.cached = true;
  return d;
}

function AnalyticsApp() {
  const [demoState, setDemoState] = React.useState('filled');
  const [withTimeliness, setWithTimeliness] = React.useState(false);
  const [widthKey, setWidthKey] = React.useState('desktop');
  const failedData = React.useMemo(() => failedVariant(window.ANALYTICS_SAMPLE), []);
  const data = demoState === 'empty' ? window.ANALYTICS_EMPTY : demoState === 'failed' ? failedData : window.ANALYTICS_SAMPLE;
  const failure = demoState === 'failed' ? { kind: 'http', status: 502 } : null;
  const w = WIDTHS[widthKey];
  const phone = widthKey === 'phone';
  return (
    <>
      <div className="an-stage" style={w ? { maxWidth: w + (phone ? 0 : 256), margin: '0 auto', borderLeft: '1px solid var(--gt-border)', borderRight: '1px solid var(--gt-border)' } : undefined}>
        <Shell hideSidebar={phone} active={demoState === 'forbidden' ? 'Home' : 'Analytics'}>
          <div className="an-content">
            {demoState === 'forbidden' ? <Forbidden /> : <AnalyticsScreen key={`${demoState}-${withTimeliness}`} data={data} demoState={demoState} withTimeliness={withTimeliness} failure={failure} />}
          </div>
        </Shell>
      </div>
      <div className="an-demo" role="group" aria-label="Demo controls">
        <span className="an-demo__group"><span className="an-demo__lbl">State</span>
          {['filled', 'empty', 'loading', 'refetching', 'failed', 'forbidden'].map((s) => <button key={s} type="button" className="an-demo__opt" aria-pressed={demoState === s} onClick={() => setDemoState(s)}>{s}</button>)}
        </span>
        <span className="an-demo__group"><span className="an-demo__lbl">Release</span>
          <button type="button" className="an-demo__opt" aria-pressed={!withTimeliness} onClick={() => setWithTimeliness(false)}>first</button>
          <button type="button" className="an-demo__opt" aria-pressed={withTimeliness} onClick={() => setWithTimeliness(true)}>+ timeliness</button>
        </span>
        <span className="an-demo__group"><span className="an-demo__lbl">Width</span>
          {Object.keys(WIDTHS).map((k) => <button key={k} type="button" className="an-demo__opt" aria-pressed={widthKey === k} onClick={() => setWidthKey(k)}>{k}</button>)}
        </span>
      </div>
    </>
  );
}

window.AnalyticsApp = AnalyticsApp;
