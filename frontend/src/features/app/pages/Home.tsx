import React from 'react';
import { useUser, useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import StudentHomeDashboard from '@features/app/components/Home/StudentHomeDashboard';
import InstructorHomeDashboard from '@features/app/components/Home/InstructorHomeDashboard';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './Home.scss';

const Home: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { role } = useAuth();
  const navigate = useNavigate();

  if (!isLoaded) {
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

  if (role === 'student') {
    return <StudentHomeDashboard />;
  }

  return <InstructorHomeDashboard />;
};

export default Home;
