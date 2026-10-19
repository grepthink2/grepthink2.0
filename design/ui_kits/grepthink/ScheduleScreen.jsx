/* GrepThink schedule — UI-kit screen composition.
   Composes components/schedule/*; reads window.GT_SCHEDULE_SAMPLE. The clock is pinned per demo "now". */
const NS = window.GrepThinkDesignSystem_36e7e3;
const { ScheduleList, SidebarNavItem, SidebarSectionTitle, Avatar, Badge, Kbd, ModKey } = NS;
const modKey = ModKey || (() => '⌘');
const S = window.GT_SCHEDULE_SAMPLE;
const PT = 'America/Los_Angeles';
const NOWS = {
  live:    { label: 'Tue 3:12 PM', at: new Date(S.nows.live) },
  morning: { label: 'Tue 9:00 AM', at: new Date(S.nows.morning) },
  evening: { label: 'Tue 8:30 PM', at: new Date(S.nows.evening) },
  quiet:   { label: 'Sat (empty)', at: new Date(S.nows.quiet) },
};
const ZONES = { pt: { label: 'PT', zone: PT }, ist: { label: 'IST', zone: 'Asia/Kolkata' } };
const USERS = { student: { name: 'Joshua Cruz', first: 'Josh' }, ta: { name: 'Priya Kapoor', first: 'Priya' }, instructor: { name: 'Richard Jullig', first: 'Prof. Jullig' } };
const dateLabel = (now, zone) => new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(now);

const svg = (d, size = 18) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
const I = {
  home: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  msg: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  cal: svg('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
  classes: svg('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'),
  project: svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
  video: svg('<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>'),
  check: svg('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  bell: svg('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', 20),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>', 22),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 18),
  book: svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>', 16),
  folder: svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', 16),
  chev: svg('<path d="m6 9 6 6 6-6"/>', 14),
};

function Shell({ phone, lens, screen, title, children }) {
  const staff = lens !== 'student';
  return (
    <div className="sch-app">
      {!phone && (
        <aside className="sch-side">
          <img className="sch-side__logo" src="../../assets/grepthink-logo.svg" alt="GrepThink" />
          <button type="button" className="sch-class">{I.classes}<span>2026F CSE 115B</span><span>{I.chev}</span></button>
          <SidebarSectionTitle>Main</SidebarSectionTitle>
          <SidebarNavItem icon={I.home} label="Home" active={screen === 'home'} />
          <SidebarNavItem icon={I.msg} label="Messages" badge={4} />
          <SidebarNavItem icon={I.cal} label="Schedule" active={screen === 'agenda'} />
          {staff ? <SidebarNavItem icon={I.video} label="TA Meetings" /> : <SidebarNavItem icon={I.classes} label="My Classes" />}
          {staff ? <SidebarNavItem icon={I.check} label="Final Reviews" /> : <SidebarNavItem icon={I.project} label="My Project" />}
          <SidebarSectionTitle>Settings</SidebarSectionTitle>
          <SidebarNavItem icon={I.gear} label="Settings" />
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(255,255,255,.75)', padding: '8px 4px' }}>Press <Kbd onDark keys={[modKey(), 'K']} /> to search</div>
        </aside>
      )}
      <div className="sch-main">
        <header className="sch-header">
          {phone && <button type="button" className="sch-header__menu" aria-label="Open menu">{I.menu}</button>}
          <h1 className="sch-header__title">{title}</h1>
          <div className="sch-header__right">
            <button type="button" className="sch-header__icon" aria-label="Search">{I.search}</button>
            <button type="button" className="sch-header__icon" aria-label="Notifications">{I.bell}</button>
            {!phone && <Avatar name={USERS[lens].name} size="sm" />}
          </div>
        </header>
        <main className="sch-content">{children}</main>
      </div>
    </div>
  );
}

function ScheduleCard({ lens, now, zone, status, log, ...rest }) {
  return (
    <section className="sch-card" aria-labelledby="schedule-heading">
      <div className="sch-card__head"><h2 id="schedule-heading" className="sch-card__title">Today’s Schedule</h2><span className="sch-card__date">{dateLabel(now, zone)}</span></div>
      <ScheduleList variant="compact" items={S[lens]} lens={lens} now={now} zone={zone} status={status} onRetry={() => log('retry')}
        calendarHref={S.calendarHref} seeAllHref="#agenda"
        onJoin={(it) => log(`join · ${it.title}${it.teamName ? ` · ${it.teamName}` : ''}`)}
        onMarkAttendance={(it) => log(`mark attendance · ${it.teamName}`)} onSetTime={(it) => log(`set time · ${it.teamName || it.title}`)} {...rest} />
    </section>
  );
}

function HomeView({ lens, now, zone, status, log }) {
  const staff = lens !== 'student';
  return (
    <div>
      <h2 className="sch-home__welcome">Welcome Back, {USERS[lens].first}</h2>
      <div className="sch-home__grid">
        <div className="sch-home__col">
          <section className="sch-card">
            <div className="sch-card__head"><h2 className="sch-card__title">{staff ? 'TSRs to review' : 'Upcoming Deadlines'}</h2><a href="#" style={{ fontSize: 12, fontWeight: 500 }}>See All</a></div>
            <div className="sch-row"><span><span className="sch-row__name">TSR 4</span><br /><span className="sch-row__meta">CSE 115B · {staff ? '48 of 62 submitted' : 'GrepThink 2.0'}</span></span><span className="sch-row__meta">Oct 20, 2026</span><Badge tone="error">Due Soon</Badge></div>
            <div className="sch-row"><span><span className="sch-row__name">TSR 5</span><br /><span className="sch-row__meta">CSE 115B · {staff ? 'opens Oct 21' : 'GrepThink 2.0'}</span></span><span className="sch-row__meta">Oct 27, 2026</span><Badge tone="neutral">Not Started</Badge></div>
            <div className="sch-row"><span><span className="sch-row__name">Interest Form</span><br /><span className="sch-row__meta">CSE 115B</span></span><span className="sch-row__meta">Oct 12, 2026</span><Badge tone="success">Submitted</Badge></div>
          </section>
          <section className="sch-card">
            <div className="sch-card__head"><h2 className="sch-card__title">{staff ? 'Join requests' : 'Join Requests'}</h2></div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--gt-text-tertiary)' }}>{staff ? '2 pending · oldest 2 days' : 'No pending requests.'}</p>
          </section>
        </div>
        <div className="sch-home__col">
          {!staff && (
            <div className="sch-toolbar" role="toolbar" aria-label="Quick actions">
              <button type="button" className="sch-toolbar__btn sch-toolbar__btn--join">{I.book}Join Class</button>
              <button type="button" className="sch-toolbar__btn sch-toolbar__btn--messages">{I.msg}Messages</button>
              <button type="button" className="sch-toolbar__btn sch-toolbar__btn--browse">{I.folder}Browse</button>
            </div>
          )}
          <ScheduleCard lens={lens} now={now} zone={zone} status={status} log={log} />
          <section className="sch-card" aria-labelledby="team-heading">
            <div className="sch-card__head"><h2 id="team-heading" className="sch-card__title">{staff ? 'Your teams' : 'Your team'}</h2>{!staff && <span className="sch-card__date">GrepThink 2.0</span>}</div>
            <ul className="sch-team" style={{ marginTop: 8 }}>
              {(staff
                ? [['Team 1', 'GrepThink 2.0 · 4 members'], ['Team 4', 'Slug Dining · 5 members'], ['Team 6', 'Campus Nav AR · 4 members']]
                : [['Ashton Liu', 'Product Owner'], ['Tony Wang', 'Scrum Master'], ['Landon Nguyen', 'Member'], ['Joshua Cruz', 'Member (You)']]
              ).map(([n, r]) => <li key={n}><Avatar name={n} size="md" square={staff} /><span>{n}<small>{r}</small></span></li>)}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function AgendaView({ lens, now, zone, status, log, ...rest }) {
  return (
    <ScheduleList variant="agenda" items={S[lens]} lens={lens} now={now} zone={zone} status={status} onRetry={() => log('retry')}
      classes={lens === 'student' ? undefined : S.classes} calendarHref={S.calendarHref}
      onJoin={(it) => log(`join · ${it.title}${it.teamName ? ` · ${it.teamName}` : ''}`)}
      onMarkAttendance={(it) => log(`mark attendance · ${it.teamName}`)} onSetTime={(it) => log(`set time · ${it.teamName || it.title}`)} {...rest} />
  );
}

function StatesView({ log }) {
  const C = ({ title, date, children }) => <section className="sch-card"><div className="sch-card__head"><h2 className="sch-card__title">{title || 'Today’s Schedule'}</h2>{date && <span className="sch-card__date">{date}</span>}</div>{children}</section>;
  const common = { calendarHref: S.calendarHref, seeAllHref: '#agenda', onMarkAttendance: (it) => log(`mark attendance · ${it.teamName}`), onSetTime: (it) => log(`set time · ${it.teamName || it.title}`) };
  return (
    <div className="sch-states">
      <p className="sch-states__lbl">Compact card — Student</p>
      <div><p className="sch-caption">Loading</p><C><ScheduleList variant="compact" status="loading" /></C></div>
      <div><p className="sch-caption">Error</p><C><ScheduleList variant="compact" status="error" onRetry={() => log('retry')} /></C></div>
      <div><p className="sch-caption">Live now — Now line, Join window, overlap, deadline marker, sprint rule</p><C date="Tue, Oct 20"><ScheduleList variant="compact" items={S.student} now={NOWS.live.at} zone={PT} {...common} /></C></div>
      <div><p className="sch-caption">Morning — nothing live yet, Now line on top</p><C date="Tue, Oct 20"><ScheduleList variant="compact" items={S.student} now={NOWS.morning.at} zone={PT} {...common} /></C></div>
      <div><p className="sch-caption">Evening — all past (dimmed), attendance shown</p><C date="Tue, Oct 20"><ScheduleList variant="compact" items={S.student} now={NOWS.evening.at} zone={PT} {...common} /></C></div>
      <div><p className="sch-caption">Nothing today — peek at the next day, Add to your calendar</p><C date="Sat, Oct 24"><ScheduleList variant="compact" items={S.student} now={NOWS.quiet.at} zone={PT} {...common} /></C></div>
      <div><p className="sch-caption">Viewer in IST — times in the viewer's zone, campus time on hover</p><C date="Tue, Oct 20"><ScheduleList variant="compact" items={S.student} now={NOWS.morning.at} zone="Asia/Kolkata" {...common} /></C></div>
      <div><p className="sch-caption">No items at all</p><C date="Sat, Oct 24"><ScheduleList variant="compact" items={[]} now={NOWS.quiet.at} zone={PT} {...common} /></C></div>
      <p className="sch-states__lbl">Compact card — TA · Instructor</p>
      <div><p className="sch-caption">TA, live — Mark attendance, Time TBD → Set time, +more</p><C date="Tue, Oct 20"><ScheduleList variant="compact" items={S.ta} lens="ta" now={NOWS.live.at} zone={PT} {...common} /></C></div>
      <div><p className="sch-caption">Instructor, live</p><C date="Tue, Oct 20"><ScheduleList variant="compact" items={S.instructor} lens="instructor" now={NOWS.live.at} zone={PT} {...common} /></C></div>
      <p className="sch-states__lbl">Agenda</p>
      <div className="sch-states__wide"><p className="sch-caption">Loading</p><ScheduleList variant="agenda" status="loading" now={NOWS.live.at} zone={PT} /></div>
      <div className="sch-states__wide"><p className="sch-caption">Error</p><ScheduleList variant="agenda" status="error" now={NOWS.live.at} zone={PT} onRetry={() => log('retry')} /></div>
      <div className="sch-states__wide"><p className="sch-caption">Empty week (Dec 14 – 20) — next item + Add to your calendar</p><ScheduleList variant="agenda" items={S.student} now={NOWS.live.at} zone={PT} weekAnchor="2026-12-14" onWeekChange={() => {}} calendarHref={S.calendarHref} /></div>
      <div className="sch-states__wide"><p className="sch-caption">Kind filter on (Final reviews) — sprint rules stay</p><ScheduleList variant="agenda" items={S.student} now={NOWS.live.at} zone={PT} kinds={['final_review']} onKindsChange={() => {}} /></div>
      <div className="sch-states__wide"><p className="sch-caption">Expanded TA meeting (MeetingCard) — TA lens, IST viewer</p><ScheduleList variant="agenda" items={S.ta} lens="ta" now={NOWS.live.at} zone="Asia/Kolkata" classes={S.classes} expandedId="t-m5" onToggle={() => {}} {...common} /></div>
    </div>
  );
}

function ScheduleApp() {
  const [view, setView] = React.useState('home');       // home | agenda | states | phone
  const [lens, setLens] = React.useState('student');
  const [nowKey, setNowKey] = React.useState('live');
  const [zoneKey, setZoneKey] = React.useState('pt');
  const [status, setStatus] = React.useState('ready');
  const [last, setLast] = React.useState(null);
  const now = NOWS[nowKey].at, zone = ZONES[zoneKey].zone;
  const log = React.useCallback((s) => setLast(s), []);
  const title = view === 'agenda' ? 'Schedule' : view === 'states' ? 'Schedule — states' : 'Home';

  let stage;
  if (view === 'phone') {
    stage = (
      <div className="sch-stage sch-stage--phone">
        <Shell phone lens={lens} screen="home" title="Home"><HomeView lens={lens} now={now} zone={zone} status={status} log={log} /></Shell>
        <Shell phone lens={lens} screen="agenda" title="Schedule"><AgendaView lens={lens} now={now} zone={zone} status={status} log={log} /></Shell>
      </div>
    );
  } else {
    stage = (
      <div className="sch-stage">
        <Shell lens={lens} screen={view} title={title}>
          {view === 'home' && <HomeView lens={lens} now={now} zone={zone} status={status} log={log} />}
          {view === 'agenda' && <AgendaView lens={lens} now={now} zone={zone} status={status} log={log} />}
          {view === 'states' && <StatesView log={log} />}
        </Shell>
      </div>
    );
  }

  const Opt = ({ on, onClick, children }) => <button type="button" className="sch-demo__opt" aria-pressed={on} onClick={onClick}>{children}</button>;
  return (
    <>
      {stage}
      <div className="sch-demo" role="toolbar" aria-label="Demo controls">
        <span className="sch-demo__group"><span className="sch-demo__lbl">view</span>{['home', 'agenda', 'states', 'phone'].map((v) => <Opt key={v} on={view === v} onClick={() => setView(v)}>{v}</Opt>)}</span>
        <span className="sch-demo__group"><span className="sch-demo__lbl">lens</span>{['student', 'ta', 'instructor'].map((l) => <Opt key={l} on={lens === l} onClick={() => setLens(l)}>{l}</Opt>)}</span>
        <span className="sch-demo__group"><span className="sch-demo__lbl">now</span>{Object.keys(NOWS).map((k) => <Opt key={k} on={nowKey === k} onClick={() => setNowKey(k)}>{NOWS[k].label}</Opt>)}</span>
        <span className="sch-demo__group"><span className="sch-demo__lbl">zone</span>{Object.keys(ZONES).map((k) => <Opt key={k} on={zoneKey === k} onClick={() => setZoneKey(k)}>{ZONES[k].label}</Opt>)}</span>
        <span className="sch-demo__group"><span className="sch-demo__lbl">data</span>{['ready', 'loading', 'error'].map((s) => <Opt key={s} on={status === s} onClick={() => setStatus(s)}>{s}</Opt>)}</span>
        {last && <span className="sch-demo__log">→ {last}</span>}
      </div>
    </>
  );
}
window.ScheduleApp = ScheduleApp;
