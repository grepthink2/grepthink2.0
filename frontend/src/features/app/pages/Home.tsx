import React from 'react';
import { useUser, useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import LogoutButton from '@features/auth/components/LogoutButton';
import './Home.scss';

const Home: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { getToken, signOut } = useAuth();
  const navigate = useNavigate();
  const [backendStatus, setBackendStatus] = React.useState<string>('Checking backend...');

  React.useEffect(() => {
    let cancelled = false;

    const checkBackend = async () => {
      try {
        // getToken() now auto-refreshes a stale session internally,
        // so a null return here means the session is genuinely gone.
        const token = await getToken();
        if (!token) {
          // Session is dead. Tear down and bounce to login. ProtectedRoute
          // will also pick this up via onAuthStateChange, but calling
          // signOut here guarantees storage is cleared.
          await signOut();
          return;
        }

        const res = await fetch('/api/test-auth', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;

        if (res.status === 401) {
          // Backend rejected the token. Log out rather than show a
          // misleading "connected" status.
          await signOut();
          return;
        }

        const data = await res.json();
        if (!cancelled) {
          setBackendStatus(data.message || 'Backend Connected');
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setBackendStatus(
          'Backend unreachable: ' + (err instanceof Error ? err.message : 'Unknown error')
        );
      }
    };

    if (user) {
      checkBackend();
    }

    return () => {
      cancelled = true;
    };
  }, [user, getToken, signOut]);

  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <div className="home-page">
        <h1>Welcome to GrepThink</h1>
        <p>Please log in or sign up to continue.</p>
        <button onClick={() => navigate('/login')}>Login</button>
      </div>
    );
  }

  return (
    <div className="home-page">
      <h1>Welcome, {user.user_metadata?.full_name || user.email}!</h1>
      <p>You have successfully logged in.</p>
      
      <div className="user-details">
         <p><strong>User ID:</strong> {user.id}</p>
        <p><strong>Email:</strong> {user.email}</p>
         <p><strong>Backend Status:</strong> {backendStatus}</p>
      </div>

      <LogoutButton />
    </div>
  );
};

export default Home;
