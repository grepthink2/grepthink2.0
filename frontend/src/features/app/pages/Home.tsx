import React from 'react';
import { useUser, useAuth } from '@/lib/auth';
import { useNavigate, Link } from 'react-router-dom';
import { useClass } from '@/lib/classContext';
import StudentHomeDashboard from '@features/app/components/Home/StudentHomeDashboard';
import './Home.scss';

const Home: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { role } = useAuth();
  const navigate = useNavigate();
  const { selectedClass } = useClass();

  if (!isLoaded) {
    return <div className="home-page home-page--loading">Loading...</div>;
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

  if (role === 'student') {
    return <StudentHomeDashboard />;
  }

  const displayName = user.user_metadata?.full_name || user.email || 'there';

  return (
    <div className="home-page home-page--instructor">
      <div className="home-page__welcome-card">
        <h1 className="home-page__title">Welcome, {displayName}</h1>
        <p className="home-page__lede">
          Select a class in the sidebar to open the dashboard, or go to your classes.
        </p>
        <div className="home-page__actions">
          {selectedClass && (
            <Link className="home-page__link" to="/app/dashboard">
              Open dashboard for {selectedClass.name}
            </Link>
          )}
          <Link className="home-page__link home-page__link--secondary" to="/app/my-classes">
            My Classes
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
