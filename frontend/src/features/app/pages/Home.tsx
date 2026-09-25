import React from 'react';
import { useUser, useAuth } from '@/lib/auth';
import { useSelectedClassRole } from '@/lib/classContext';
import { useNavigate } from 'react-router-dom';
import StudentHomeDashboard from '@features/app/components/Home/StudentHomeDashboard';
import InstructorHomeDashboard from '@features/app/components/Home/InstructorHomeDashboard';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './Home.scss';

const Home: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { canCreateClasses } = useAuth();
  // `undefined` only until the first class list is known (as the class route guard waits), so a
  // later refresh with a spinner never unmounts the dashboards.
  const classRole = useSelectedClassRole();
  const navigate = useNavigate();

  if (!isLoaded || classRole === undefined) {
    return (
      <div className="home-page home-page--loading" aria-busy="true">
        <div className="home-page__welcome-card">
          <Skeleton width={220} height={22} />
          <Skeleton width={280} height={14} style={{ marginTop: 10 }} />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="home-page home-page--guest">
        <h1>Welcome to GrepThink</h1>
        <p>Please log in or sign up to continue.</p>
        <button type="button" onClick={() => navigate('/login')}>
          Login
        </button>
      </div>
    );
  }

  // Home follows the selected class; with no class selected (null), what the account can do.
  const instructorHome = classRole === null ? canCreateClasses : classRole === 'instructor';
  return instructorHome ? <InstructorHomeDashboard /> : <StudentHomeDashboard />;
};

export default Home;
