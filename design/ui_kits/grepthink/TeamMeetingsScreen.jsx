/* GrepThink team meetings — UI-kit screen composition.
   Composes components/domain/TeamMeetings*; reads window.GT_TEAM_MEETINGS_SAMPLE. The clock is pinned to Tue Oct 20, 2026 3:12 PM PT. */
const NS = window.GrepThinkDesignSystem_36e7e3;
const { TeamMeetingsList, TeamMeetingForm, TeamMeetingsModel, SidebarNavItem, SidebarSectionTitle, Avatar, AvatarGroup, Button, ProgressBar, Kbd, ModKey } = NS;
const { showTeamMeetingsCard } = TeamMeetingsModel;
const modKey = ModKey || (() => '⌘');
const S = window.GT_TEAM_MEETINGS_SAMPLE;
const NOW = new Date(S.now);
const ZONES = { pt: { label: 'PT', zone: 'America/Los_Angeles' }, ist: { label: 'IST', zone: 'Asia/Kolkata' } };
const ROLES = { po: { label: 'product owner', name: 'Ashton Liu', first: 'Ashton' }, member: { label: 'member', name: 'Joshua Cruz', first: 'Josh' } };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const svg = (d, size = 18) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;
const I = {
  home: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  msg: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  cal: svg('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>'),
  calDays: svg('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>', 16),
  classes: svg('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'),
  project: svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
  folderKanban: svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>', 28),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  gear16: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 16),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 16),
  bell: svg('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>', 20),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>', 22),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', 18),
  chev: svg('<path d="m6 9 6 6 6-6"/>', 14),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>', 24),
  trash: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', 16),
  camera: svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>', 16),
  code: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', 15),
  server: svg('<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>', 15),
  bug: svg('<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>', 15),
};

function Shell({ phone, role, title, children }) {
  return (
    <div className="tm-app">
      {!phone && (
        <aside className="tm-side">
          <img className="tm-side__logo" src="../../assets/grepthink-logo.svg" alt="GrepThink" />
          <button type="button" className="tm-class">{I.classes}<span>{S.classLabel}</span><span>{I.chev}</span></button>
          <SidebarSectionTitle>Main</SidebarSectionTitle>
          <SidebarNavItem icon={I.home} label="Home" />
          <SidebarNavItem icon={I.msg} label="Messages" badge={4} />
          <SidebarNavItem icon={I.cal} label="Schedule" />
          <SidebarNavItem icon={I.classes} label="My Classes" />
          <SidebarNavItem icon={I.project} label="My Project" active />
          <SidebarSectionTitle>Settings</SidebarSectionTitle>
          <SidebarNavItem icon={I.gear} label="Settings" />
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'rgba(255,255,255,.75)', padding: '8px 4px' }}>Press <Kbd onDark keys={[modKey(), 'K']} /> to search</div>
        </aside>
      )}
      <div className="tm-main">
        <header className="tm-header">
          {phone && <button type="button" className="tm-header__menu" aria-label="Open menu">{I.menu}</button>}
          <h1 className="tm-header__title">{title}</h1>
          <div className="tm-header__right">
            <button type="button" className="tm-header__icon" aria-label="Search">{I.search}</button>
            <button type="button" className="tm-header__icon" aria-label="Notifications">{I.bell}</button>
            {!phone && <Avatar name={ROLES[role].name} size="sm" />}
          </div>
        </header>
        <main className="tm-content">{children}</main>
      </div>
    </div>
  );
}

/* The project page's "Team meetings" card — chrome belongs to the page, the body is TeamMeetingsList. */
function TeamMeetingsCard({ meetings, status, zone, canManage, onManage, log, ...rest }) {
  if (!showTeamMeetingsCard(meetings, { canManage, status })) return null;
  return (
    <section className="tm-card" aria-labelledby="tm-card-heading">
      <div className="tm-card__head"><h2 id="tm-card-heading" className="tm-card__title">Team meetings</h2>{canManage && status === 'ready' && meetings.length > 0 && <a href="#manage" onClick={(e) => { e.preventDefault(); onManage(); }}>Manage</a>}</div>
      <TeamMeetingsList variant="card" meetings={meetings} status={status} now={NOW} zone={zone} teamName={S.teamName} people={S.people} canManage={canManage}
        onManage={onManage} onRetry={() => log('retry')} onJoin={(it) => log(`join · ${it.title}`)} {...rest} />
    </section>
  );
}

function ProjectPage({ role, meetings, status, zone, onEdit, log }) {
  const po = role === 'po';
  return (
    <div>
      <header className="tm-pv__header">
        <span className="tm-pv__logo">{I.folderKanban}</span>
        <div><h2 className="tm-pv__title">{S.projectName}</h2><p className="tm-pv__meta">{S.classLabel} · {S.teamName} · 4 of 5 members</p></div>
        <div className="tm-pv__members"><AvatarGroup names={S.members} max={5} size="sm" /></div>
        <div className="tm-pv__actions">
          {po && <Button variant="secondary" size="sm" iconLeft={I.users} onClick={() => log('manage members')}>Manage Members</Button>}
          {po && <Button variant="secondary" size="sm" iconLeft={I.gear16} onClick={() => onEdit('details')}>Edit Project</Button>}
        </div>
      </header>
      <div className="tm-pv__content">
        <section className="tm-card tm-desc" aria-label="Project description">
          <p>GrepThink 2.0 is the team and project platform CSE 115 runs on: roster import, team formation, sprint boards, TSRs and TA meetings in one place.</p>
          <p>This quarter the team owns the schedule layer and the ⌘K search, and ships the analytics dashboard's first release to the 115B staff.</p>
          <h4>Sprint 3 goals</h4>
          <ul><li>Today's Schedule card on Student Home, with the live Now line</li><li>Global search over people, projects, stories and TSRs</li><li>Roster import end to end, with a sponsor demo on Oct 30</li></ul>
        </section>
        <div className="tm-pv__aside">
          <section className="tm-card" aria-labelledby="sprint-heading">
            <div className="tm-card__head"><h2 id="sprint-heading" className="tm-card__title">Sprint 3</h2><span className="tm-card__date">Oct 19 – 30</span></div>
            <ProgressBar value={6} max={14} size="sm" />
            <p className="tm-sprint__meta"><span>6 of 14 points done</span><span>10 days left</span></p>
          </section>
          <TeamMeetingsCard meetings={meetings} status={status} zone={zone} canManage={po} onManage={() => onEdit('meetings')} log={log} />
          <section className="tm-card" aria-labelledby="roles-heading">
            <h2 id="roles-heading" className="tm-card__title">Roles needed</h2>
            <ul className="tm-roles"><li><span className="tm-roles__ico">{I.code}</span>Frontend</li><li><span className="tm-roles__ico">{I.server}</span>Backend</li><li><span className="tm-roles__ico">{I.bug}</span>QA &amp; testing</li></ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/* Edit Project modal (mirrors EditProjectModal.tsx): Details · Team, plus Meetings for the Product Owner only. */
function EditProjectModal({ role, tab, onTab, onClose, inline, children }) {
  const po = role === 'po';
  const tabs = [['details', I.gear16, 'Details'], ['team', I.users, 'Team'], ...(po ? [['meetings', I.calDays, 'Meetings']] : [])];
  const sheet = (
    <div className={['tm-ep', inline ? 'tm-ep--inline' : ''].filter(Boolean).join(' ')} role="dialog" aria-modal={inline ? undefined : 'true'} aria-labelledby="ep-title">
      <button type="button" className="tm-ep__close" aria-label="Close" onClick={onClose}>{I.x}</button>
      <header className="tm-ep__header"><h2 id="ep-title" className="tm-ep__title">Edit Project</h2><p className="tm-ep__subtitle">Manage your project configuration and team roles</p></header>
      <div className="tm-ep__tabs" role="tablist">
        {tabs.map(([id, icon, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tm-ep__tab ${tab === id ? 'tm-ep__tab--active' : ''}`} onClick={() => onTab(id)}>{icon}<span>{label}</span></button>)}
      </div>
      <div className="tm-ep__body">
        {tab === 'details' && (
          <>
            <section className="tm-ep__section"><h3 className="tm-ep__section-title">Project Logo</h3><p className="tm-ep__section-hint">Shown on Browse Projects when set. Leave empty to use the default icon.</p>
              <div className="tm-ep__logo-row"><div className="tm-ep__logo">{I.folderKanban}</div><button type="button" className="tm-ep__logo-change">{I.camera}Upload logo</button></div></section>
            <section className="tm-ep__section"><h3 className="tm-ep__section-title">Project Name</h3><input className="tm-ep__input" defaultValue={S.projectName} aria-label="Project name" /></section>
            <section className="tm-ep__section"><h3 className="tm-ep__section-title">Description</h3><textarea className="tm-ep__textarea" rows={4} aria-label="Project description" defaultValue="GrepThink 2.0 is the team and project platform CSE 115 runs on." /></section>
            <section className="tm-ep__section"><h3 className="tm-ep__section-title">Max Team Size</h3><p className="tm-ep__section-hint">Maximum number of members allowed on this project.</p><input className="tm-ep__input tm-ep__input--short" type="number" defaultValue={5} aria-label="Max team size" /></section>
          </>
        )}
        {tab === 'team' && (
          <section className="tm-ep__section"><h3 className="tm-ep__section-title">Team roles</h3><p className="tm-ep__section-hint">Assign the Scrum roles for this project.</p>
            <div className="tm-ep__role-row"><span className="tm-ep__role-name">Product Owner</span><select className="tm-ep__select" defaultValue="u-ashton" aria-label="Product Owner">{Object.values(S.people).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            <div className="tm-ep__role-row"><span className="tm-ep__role-name">Scrum Master</span><select className="tm-ep__select" defaultValue="u-tony" aria-label="Scrum Master">{Object.values(S.people).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          </section>
        )}
        {tab === 'meetings' && children}
      </div>
      <footer className="tm-ep__footer">
        <button type="button" className="tm-ep__btn tm-ep__btn--delete">{I.trash}Delete Project</button>
        <div className="tm-ep__footer-right">
          {tab === 'meetings'
            ? <button type="button" className="tm-ep__btn tm-ep__btn--save" onClick={onClose}>Done</button>
            : <><button type="button" className="tm-ep__btn tm-ep__btn--secondary" onClick={onClose}>Cancel</button><button type="button" className="tm-ep__btn tm-ep__btn--save" onClick={onClose}>Save Changes</button></>}
        </div>
      </footer>
    </div>
  );
  if (inline) return sheet;
  return <div className="tm-ep-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>{sheet}</div>;
}

function StatesView({ zone, log }) {
  const noop = () => delay(600);
  const fail = () => delay(600).then(() => { throw new Error('fail'); });
  const P = ({ cap, wide, children }) => <div className={wide ? 'tm-states__wide' : ''}><p className="tm-caption">{cap}</p>{children}</div>;
  const Card = ({ manage, children }) => <section className="tm-card"><div className="tm-card__head"><h2 className="tm-card__title">Team meetings</h2>{manage && <a href="#manage" onClick={(e) => e.preventDefault()}>Manage</a>}</div>{children}</section>;
  const common = { now: NOW, zone, canManage: true, onCreate: noop, onUpdate: noop, onDelete: noop };
  return (
    <div className="tm-states">
      <p className="tm-states__lbl">Meetings tab — Product Owner</p>
      <P cap="Ready — 4 upcoming (one live), Past (3) collapsed" wide><div className="tm-panel"><TeamMeetingsList variant="manage" meetings={S.meetings} {...common} /></div></P>
      <P cap="One editor at a time — a row in edit (Add / other Edit disabled) · a delete waiting on its confirm" wide><div className="tm-panel"><TeamMeetingsList variant="manage" meetings={S.upcoming} {...common} defaultEditingId="tm-2" defaultConfirmId="tm-3" /></div></P>
      <P cap="Empty"><div className="tm-panel"><TeamMeetingsList variant="manage" meetings={[]} {...common} /></div></P>
      <P cap="Loading"><div className="tm-panel"><TeamMeetingsList variant="manage" status="loading" now={NOW} /></div></P>
      <P cap="Error"><div className="tm-panel"><TeamMeetingsList variant="manage" status="error" now={NOW} onRetry={() => log('retry')} /></div></P>
      <P cap="Saving fails — try Add meeting → Add: the error stays inline, the draft is kept"><div className="tm-panel"><TeamMeetingsList variant="manage" meetings={S.upcoming.slice(0, 2)} {...common} onCreate={fail} onUpdate={fail} onDelete={fail} /></div></P>
      <P cap="8+ meetings with a long title, past open" wide><div className="tm-panel"><TeamMeetingsList variant="manage" meetings={S.many} {...common} defaultPastOpen /></div></P>
      <p className="tm-states__lbl">TeamMeetingForm</p>
      <P cap="New — viewer in IST: the campus time sits under the start time"><div className="tm-panel"><TeamMeetingForm mode="create" now={NOW} zone="Asia/Kolkata" onSubmit={(v) => log(`submit · ${v.title}`)} onCancel={() => log('cancel')} /></div></P>
      <P cap="Edit — save error, draft kept"><div className="tm-panel"><TeamMeetingForm mode="edit" meeting={S.upcoming[2]} now={NOW} zone={zone} error="Couldn’t save this meeting. Your changes are still here — try again." onSubmit={() => {}} onCancel={() => {}} /></div></P>
      <P cap="Edit — saving"><div className="tm-panel"><TeamMeetingForm mode="edit" meeting={S.upcoming[1]} now={NOW} zone={zone} saving onSubmit={() => {}} onCancel={() => {}} /></div></P>
      <p className="tm-states__lbl">Project-page card — every member</p>
      <P cap="Ready — live meeting → Join Zoom, grouped by day, Past meetings (3)"><Card manage><TeamMeetingsList variant="card" meetings={S.meetings} teamName={S.teamName} people={S.people} canManage now={NOW} zone={zone} onJoin={(it) => log(`join · ${it.title}`)} /></Card></P>
      <P cap="Past open (dimmed rows)"><Card><TeamMeetingsList variant="card" meetings={S.meetings} teamName={S.teamName} people={S.people} now={NOW} zone={zone} defaultPastOpen /></Card></P>
      <P cap="9 upcoming — five shown, then +4 more · See all in Schedule"><Card><TeamMeetingsList variant="card" meetings={S.many} teamName={S.teamName} people={S.people} now={NOW} zone={zone} /></Card></P>
      <P cap="Empty, Product Owner — the quiet line with Add one"><Card><TeamMeetingsList variant="card" meetings={[]} canManage now={NOW} zone={zone} onManage={() => log('manage')} /></Card></P>
      <P cap="Empty, member — the card is not rendered"><p className="tm-note">showTeamMeetingsCard([], {'{ canManage: false }'}) → false: the page skips the card until the first meeting exists.</p></P>
      <P cap="Viewer in IST — times in IST, campus time on hover, zone note"><Card><TeamMeetingsList variant="card" meetings={S.meetings} teamName={S.teamName} people={S.people} now={NOW} zone="Asia/Kolkata" /></Card></P>
      <P cap="Loading · Error"><Card><TeamMeetingsList variant="card" status="loading" now={NOW} /></Card><div style={{ height: 16 }} /><Card><TeamMeetingsList variant="card" status="error" now={NOW} onRetry={() => log('retry')} /></Card></P>
      <p className="tm-states__lbl">A member opens Edit Project — no Meetings tab</p>
      <P cap="Details · Team only (canEditProjectDetails as today)" wide><div style={{ maxWidth: 580 }}><EditProjectModal inline role="member" tab="details" onTab={() => {}} onClose={() => {}} /></div></P>
    </div>
  );
}

function TeamMeetingsApp() {
  const [view, setView] = React.useState('project');   // project | modal | states | phone
  const [role, setRole] = React.useState('po');
  const [zoneKey, setZoneKey] = React.useState('pt');
  const [data, setData] = React.useState('ready');       // ready | empty | many | loading | error
  const [apiOk, setApiOk] = React.useState(true);
  const [tab, setTab] = React.useState('meetings');
  const [meetings, setMeetings] = React.useState(S.meetings);
  const [last, setLast] = React.useState(null);
  const zone = ZONES[zoneKey].zone;
  const log = React.useCallback((s) => setLast(s), []);
  const status = data === 'loading' || data === 'error' ? data : 'ready';
  const pickData = (d) => { setData(d); if (d === 'ready') setMeetings(S.meetings); if (d === 'empty') setMeetings([]); if (d === 'many') setMeetings(S.many); };
  const guard = async (ms) => { await delay(ms); if (!apiOk) throw new Error('Request failed'); };
  const api = {
    onCreate: async (v) => { await guard(700); setMeetings((ms) => [...ms, { id: `tm-${Date.now()}`, projectId: 'p-gt2', createdBy: 'u-ashton', updatedAt: new Date().toISOString(), ...v }]); log(`created · ${v.title}`); },
    onUpdate: async (id, v) => { await guard(700); setMeetings((ms) => ms.map((m) => (m.id === id ? { ...m, ...v, updatedAt: new Date().toISOString() } : m))); log(`saved · ${v.title}`); },
    onDelete: async (id) => { await guard(600); setMeetings((ms) => ms.filter((m) => m.id !== id)); log('deleted'); },
  };
  const openEdit = (t) => { setTab(role === 'po' ? t : 'details'); setView('modal'); };
  const closeEdit = () => setView('project');
  const manageList = (extra) => <TeamMeetingsList variant="manage" meetings={meetings} status={status} now={NOW} zone={zone} canManage {...api} onRetry={() => log('retry')} {...extra} />;

  let stage;
  if (view === 'phone') {
    stage = (
      <div className="tm-stage tm-stage--phone">
        <Shell phone role={role} title="My Project"><ProjectPage role={role} meetings={meetings} status={status} zone={zone} onEdit={() => {}} log={log} /></Shell>
        <Shell phone role="po" title="My Project">
          <ProjectPage role="po" meetings={meetings} status={status} zone={zone} onEdit={() => {}} log={log} />
          <EditProjectModal role="po" tab="meetings" onTab={() => {}} onClose={() => {}}>{manageList({ defaultEditingId: 'new' })}</EditProjectModal>
        </Shell>
      </div>
    );
  } else {
    stage = (
      <div className="tm-stage">
        <Shell role={role} title={view === 'states' ? 'Team meetings — states' : 'My Project'}>
          {view === 'states' ? <StatesView zone={zone} log={log} /> : <ProjectPage role={role} meetings={meetings} status={status} zone={zone} onEdit={openEdit} log={log} />}
          {view === 'modal' && <EditProjectModal role={role} tab={tab} onTab={setTab} onClose={closeEdit}>{manageList()}</EditProjectModal>}
        </Shell>
      </div>
    );
  }

  const Opt = ({ on, onClick, children }) => <button type="button" className="tm-demo__opt" aria-pressed={on} onClick={onClick}>{children}</button>;
  return (
    <>
      {stage}
      <div className="tm-demo" role="toolbar" aria-label="Demo controls">
        <span className="tm-demo__group"><span className="tm-demo__lbl">view</span>{['project', 'modal', 'states', 'phone'].map((v) => <Opt key={v} on={view === v} onClick={() => { setView(v); if (v === 'modal') setTab(role === 'po' ? 'meetings' : 'details'); }}>{v}</Opt>)}</span>
        <span className="tm-demo__group"><span className="tm-demo__lbl">role</span>{Object.keys(ROLES).map((r) => <Opt key={r} on={role === r} onClick={() => { setRole(r); if (r !== 'po') setTab('details'); else setTab('meetings'); }}>{ROLES[r].label}</Opt>)}</span>
        <span className="tm-demo__group"><span className="tm-demo__lbl">zone</span>{Object.keys(ZONES).map((k) => <Opt key={k} on={zoneKey === k} onClick={() => setZoneKey(k)}>{ZONES[k].label}</Opt>)}</span>
        <span className="tm-demo__group"><span className="tm-demo__lbl">data</span>{['ready', 'empty', 'many', 'loading', 'error'].map((d) => <Opt key={d} on={data === d} onClick={() => pickData(d)}>{d}</Opt>)}</span>
        <span className="tm-demo__group"><span className="tm-demo__lbl">api</span><Opt on={apiOk} onClick={() => setApiOk(true)}>ok</Opt><Opt on={!apiOk} onClick={() => setApiOk(false)}>fails</Opt></span>
        {last && <span className="tm-demo__log">→ {last}</span>}
      </div>
    </>
  );
}
window.TeamMeetingsApp = TeamMeetingsApp;
