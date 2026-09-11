const NS = window.GrepThinkDesignSystem_36e7e3;
const { SidebarNavItem, SidebarSectionTitle, Toggle, UnreadBadge, Avatar } = NS;

/* ── Lucide-style inline icons (stroke-2, 24 viewBox) ───────── */
const Icon = {
  home: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  msg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  folder: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  class: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  clip: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" stroke="currentColor" strokeWidth="2"/><rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="2"/></svg>,
  users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/></svg>,
  cal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  gear: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  help: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  bell: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  video: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M23 7l-7 5 7 5V7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="1" y="5" width="15" height="14" rx="2" stroke="currentColor" strokeWidth="2"/></svg>,
  chevron: <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

const NAV = {
  student: [
    { section: 'Main', items: [
      { id: 'home', label: 'Home', icon: Icon.home },
      { id: 'messages', label: 'Messages', icon: Icon.msg, badge: 3 },
      { id: 'projects', label: 'Projects', icon: Icon.folder },
      { id: 'assignments', label: 'Assignments', icon: Icon.clip },
      { id: 'tsr', label: 'TSRs', icon: Icon.cal },
    ]},
    { section: 'Settings', items: [
      { id: 'settings', label: 'Settings', icon: Icon.gear },
      { id: 'help', label: 'Help Center', icon: Icon.help },
    ]},
  ],
  ta: [
    { section: 'Main', items: [
      { id: 'home', label: 'Home', icon: Icon.home },
      { id: 'messages', label: 'Messages', icon: Icon.msg, badge: 3 },
      { id: 'meetings', label: 'Meetings', icon: Icon.video },
      { id: 'roster', label: 'Roster', icon: Icon.users },
    ]},
    { section: 'Settings', items: [
      { id: 'settings', label: 'Settings', icon: Icon.gear },
      { id: 'help', label: 'Help Center', icon: Icon.help },
    ]},
  ],
  instructor: [
    { section: 'Main', items: [
      { id: 'home', label: 'Home', icon: Icon.home },
      { id: 'messages', label: 'Messages', icon: Icon.msg, badge: 3 },
      { id: 'projects', label: 'Projects', icon: Icon.folder },
      { id: 'roster', label: 'Roster', icon: Icon.users },
      { id: 'assignments', label: 'Assignments', icon: Icon.clip },
    ]},
    { section: 'Settings', items: [
      { id: 'settings', label: 'Settings', icon: Icon.gear },
      { id: 'help', label: 'Help Center', icon: Icon.help },
    ]},
  ],
};

function Sidebar({ persona, screen, onNav }) {
  const [dark, setDark] = React.useState(false);
  return (
    <aside className="gtk-sidebar">
      <div className="gtk-sidebar__logo">
        <img src="../../assets/grepthink-logo.svg" alt="GrepThink" />
      </div>
      <button type="button" className="gtk-class-selector">
        <span className="gtk-class-selector__icon">{Icon.class}</span>
        <span>2026W CSE 115B</span>
        <span className="gtk-class-selector__chev">{Icon.chevron}</span>
      </button>
      <nav className="gtk-sidebar__nav">
        {NAV[persona].map((group) => (
          <div key={group.section} className="gtk-sidebar__section">
            <SidebarSectionTitle>{group.section}</SidebarSectionTitle>
            {group.items.map((item) => (
              <SidebarNavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                badge={item.badge}
                active={screen === item.id}
                onClick={() => onNav(item.id)}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="gtk-sidebar__foot">
        <Toggle label="Dark Mode" checked={dark} onChange={(e) => setDark(e.target.checked)} className="gtk-darkmode" />
      </div>
    </aside>
  );
}

function Header({ title, user }) {
  return (
    <header className="gtk-header">
      <h1 className="gtk-header__title">{title}</h1>
      <div className="gtk-header__search">
        {Icon.search}
        <input placeholder="Search" aria-label="Search" />
      </div>
      <div className="gtk-header__right">
        <button type="button" className="gtk-header__bell" aria-label="Notifications">
          {Icon.bell}
          <UnreadBadge count={8} />
        </button>
        <Avatar name={user} size="md" />
      </div>
    </header>
  );
}

window.GTKShell = { Sidebar, Header, Icon };
