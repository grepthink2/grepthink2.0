const { Sidebar, Header } = window.GTKShell;
const { HomeScreen, ProjectsScreen, AssignmentsScreen, TsrScreen, MessagesScreen, RosterScreen, MeetingsScreen, StubScreen } = window.GTKScreens;

const TITLES = {
  home: 'Home', messages: 'Messages', projects: 'Projects', assignments: 'Assignments',
  tsr: 'TSRs', roster: 'Roster', meetings: 'Meetings', settings: 'Settings', help: 'Help Center',
};
const USERS = { student: 'Josh Nguyen', ta: 'Sam Ortiz', instructor: 'Prof. Jullig' };

function App() {
  const [persona, setPersona] = React.useState(() => localStorage.getItem('gtk-persona') || 'student');
  const [screen, setScreen] = React.useState(() => localStorage.getItem('gtk-screen') || 'home');

  const setP = (p) => { setPersona(p); setScreen('home'); localStorage.setItem('gtk-persona', p); localStorage.setItem('gtk-screen', 'home'); };
  const nav = (s) => { setScreen(s); localStorage.setItem('gtk-screen', s); };

  let body;
  switch (screen) {
    case 'home': body = <HomeScreen persona={persona} />; break;
    case 'projects': body = <ProjectsScreen />; break;
    case 'assignments': body = <AssignmentsScreen />; break;
    case 'tsr': body = <TsrScreen />; break;
    case 'messages': body = <MessagesScreen />; break;
    case 'roster': body = <RosterScreen />; break;
    case 'meetings': body = <MeetingsScreen />; break;
    default: body = <StubScreen title={TITLES[screen] || screen} />;
  }

  return (
    <div className="gtk-app" data-screen-label={`${persona} / ${TITLES[screen] || screen}`}>
      <div className="gtk-persona-bar">
        <span>Viewing as</span>
        {['student', 'ta', 'instructor'].map((p) => (
          <button
            key={p}
            type="button"
            className={persona === p ? 'gtk-persona-bar__opt gtk-persona-bar__opt--active' : 'gtk-persona-bar__opt'}
            onClick={() => setP(p)}
          >
            {p === 'ta' ? 'TA' : p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
        <em>same design language — only permissions change</em>
      </div>
      <div className="gtk-frame">
        <Sidebar persona={persona} screen={screen} onNav={nav} />
        <main className="gtk-main">
          <Header title={TITLES[screen] || 'Home'} user={USERS[persona]} />
          <div className="gtk-content">{body}</div>
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
