/* GrepThink ⌘K search — UI-kit screen composition.
   Composes components/search/*; reads window.GT_SEARCH_SAMPLE. */
const NS = window.GrepThinkDesignSystem_36e7e3;
const { SidebarNavItem, SidebarSectionTitle, Avatar, SearchTrigger, CommandPalette, SearchField, Kbd, ModKey } = NS;
const modKey = ModKey || (() => '⌘');
const { items, recent } = window.GT_SEARCH_SAMPLE;

const I = {
  home: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  msg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  classes: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>,
  project: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>,
  gear: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  bell: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>,
};

function Shell({ phone, children, onOpenSearch }) {
  return (
    <div className="sk-app">
      {!phone && (
        <aside className="sk-side">
          <img className="sk-side__logo" src="../../assets/grepthink-logo.svg" alt="GrepThink" />
          <SidebarSectionTitle>Main</SidebarSectionTitle>
          <SidebarNavItem icon={I.home} label="Home" active />
          <SidebarNavItem icon={I.msg} label="Messages" badge={4} />
          <SidebarNavItem icon={I.classes} label="My Classes" />
          <SidebarNavItem icon={I.project} label="My Project" />
          <SidebarSectionTitle>Settings</SidebarSectionTitle>
          <SidebarNavItem icon={I.gear} label="Settings" />
          <div className="sk-side__tip">Press <Kbd onDark keys={[modKey(), 'K']} /> to search</div>
        </aside>
      )}
      <div className="sk-main">
        <header className="sk-header">
          {phone && <button type="button" className="sk-header__menu" aria-label="Open menu">{I.menu}</button>}
          <h1 className="sk-header__title">Home</h1>
          <div className="sk-header__right">
            <SearchTrigger onOpen={onOpenSearch} iconOnly={phone} />
            <button type="button" className="sk-header__icon" aria-label="Notifications">{I.bell}</button>
            {!phone && <Avatar name="Joshua Cruz" size="sm" />}
          </div>
        </header>
        <main className="sk-content">{children}</main>
      </div>
    </div>
  );
}

/* Minimal Home stand-in so the scrim has something to blur. */
function HomeStub() {
  return (
    <div className="sk-home">
      <h2 className="sk-home__welcome">Welcome Back, Josh</h2>
      <div className="sk-home__grid">
        <section className="sk-card"><h3>Upcoming Deadlines</h3><p>TSR 3 · Due Oct 12</p><p>Interest Form · Due Oct 20</p></section>
        <section className="sk-card"><h3>Current Group</h3><p>Grepthink 2.0 · Team 1 · 4 members</p></section>
        <section className="sk-card"><h3>My Tasks</h3><p>GT-12 Roster CSV importer rejects UTF-8 BOM</p><p>GT-9 Supabase RLS policy for roster reads</p></section>
      </div>
    </div>
  );
}

function SearchApp() {
  const [open, setOpen] = React.useState(true);
  const [mode, setMode] = React.useState('local');     // local | async | error
  const [phone, setPhone] = React.useState(false);
  const [lastRoute, setLastRoute] = React.useState(null);
  const onOpen = React.useCallback(() => setOpen(true), []);
  const onClose = React.useCallback(() => setOpen(false), []);

  const asyncSearch = React.useCallback((q, scope) => new Promise((res, rej) => {
    setTimeout(() => {
      if (mode === 'error') return rej(new Error('offline'));
      const ql = q.toLowerCase();
      res(items.filter((i) => scope === 'all' || i.type === scope).filter((i) => [i.title, i.key, i.subtitle, i.email, ...(i.keywords || [])].filter(Boolean).join(' ').toLowerCase().includes(ql)));
    }, 900);
  }), [mode]);

  const paletteProps = mode === 'local' ? { items } : { onSearch: asyncSearch };

  return (
    <div className={['sk-stage', phone ? 'sk-stage--phone' : ''].join(' ')}>
      <Shell phone={phone} onOpenSearch={onOpen}><HomeStub /></Shell>
      <CommandPalette
        open={open} onOpen={onOpen} onClose={onClose}
        recent={recent} role="student" initialQuery={mode === 'local' ? 'roster' : ''}
        onSelect={(item, route) => setLastRoute(route || `(no route yet for ${item.type})`)}
        {...paletteProps}
      />
      <div className="sk-demo" role="toolbar" aria-label="Demo controls">
        <span className="sk-demo__group"><span className="sk-demo__lbl">source</span>
          {['local', 'async', 'error'].map((m) => <button key={m} type="button" className="sk-demo__opt" aria-pressed={mode === m} onClick={() => { setMode(m); setOpen(true); }}>{m}</button>)}
        </span>
        <span className="sk-demo__group"><span className="sk-demo__lbl">width</span>
          <button type="button" className="sk-demo__opt" aria-pressed={!phone} onClick={() => setPhone(false)}>desktop</button>
          <button type="button" className="sk-demo__opt" aria-pressed={phone} onClick={() => setPhone(true)}>phone</button>
        </span>
        <button type="button" className="sk-demo__opt" onClick={() => setOpen(true)}>open ⌘K</button>
        {lastRoute && <span className="sk-demo__route">→ {lastRoute}</span>}
      </div>
    </div>
  );
}
window.SearchApp = SearchApp;
