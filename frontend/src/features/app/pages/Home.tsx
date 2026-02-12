import React from 'react';
import { useUser, useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import LogoutButton from '@features/auth/components/LogoutButton';
import './Home.scss';

const Home: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth(); // Correct hook for getToken
  const navigate = useNavigate();
  const [backendStatus, setBackendStatus] = React.useState<string>('Checking backend...');

  React.useEffect(() => {
    const checkBackend = async () => {
        try {
            const token = await getToken();
        if (!token) {
          setBackendStatus('Not authenticated');
          return;
        }
            const res = await fetch('/api/test-auth', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            setBackendStatus(data.message || 'Backend Connected');
        } catch (err: unknown) {
          setBackendStatus(
            'Backend unreachable: ' + (err instanceof Error ? err.message : 'Unknown error')
          );
        }
    }
    
    if (user) {
        checkBackend();
    }
  }, [user, getToken]);

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
