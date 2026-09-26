import React, { startTransition, useId, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, School } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { pathAfterClassSwitch } from '@features/app/config/routePermissions';

interface SchoolSwitcherProps {
  /** Close the profile menu after a school is picked (and move focus off the closing menu). */
  onPicked: () => void;
}

/**
 * The profile-menu row for accounts whose active classes span two or more schools. Expands in
 * place (no flyout, so it works with touch and keyboard); picking a school selects the class last
 * used there and lands on the page your role in it calls for.
 */
const SchoolSwitcher: React.FC<SchoolSwitcherProps> = ({ onPicked }) => {
  const { showSchoolSwitcher, schools, currentSchool, selectSchool, selectedClass } = useClass();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!showSchoolSwitcher) return null;

  const pick = (schoolId: string) => {
    setOpen(false);
    onPicked();
    // One transition for the class and the page (see the sidebar's class switcher).
    startTransition(() => {
      const target = selectSchool(schoolId);
      // Still in the same class (its school picked again): the page already fits, and a preview
      // of that class goes on, so its own role would not be the one the page follows.
      if (!target || target.id === selectedClass?.id) return;
      const next = pathAfterClassSwitch(pathname, target.my_role);
      if (next) navigate(next);
    });
  };

  return (
    <div className="app-header__school">
      <button
        type="button"
        className="app-header__dropdown-item app-header__school-toggle"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <School size={18} aria-hidden />
        <span className="app-header__school-label">School: {currentSchool?.name ?? 'None selected'}</span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`app-header__school-chevron${open ? ' app-header__school-chevron--open' : ''}`}
        />
      </button>
      {open && (
        <ul id={listId} className="app-header__school-list" aria-label="Schools">
          {schools.map((school) => {
            const current = school.id === currentSchool?.id;
            return (
              <li key={school.id}>
                <button
                  type="button"
                  className={`app-header__school-option${current ? ' app-header__school-option--current' : ''}`}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => pick(school.id)}
                >
                  <span className="app-header__school-check" aria-hidden>
                    {current && <Check size={14} />}
                  </span>
                  <span>{school.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SchoolSwitcher;
