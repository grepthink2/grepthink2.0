import React from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import './Home.scss';

const Home: React.FC = () => {
  const { user, isLoaded } = useUser();
  const { signOut, getToken } = useClerk();
  const navigate = useNavigate();
  const [backendStatus, setBackendStatus] = React.useState<string>('Checking backend...');

  React.useEffect(() => {
    const checkBackend = async () => {
        try {
            const token = await getToken();
            const res = await fetch('/api/test-auth', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            setBackendStatus(data.message || 'Backend Connected');
        } catch (err: any) {
            setBackendStatus('Backend unreachable: ' + err.message);
        }
    }
    
    if (user) {
        checkBackend();
    }
  }, [user]);

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
      <h1>Welcome, {user.firstName || user.emailAddresses[0].emailAddress}!</h1>
      <p>You have successfully logged in.</p>
      
      <div className="user-details">
         <p><strong>User ID:</strong> {user.id}</p>
         <p><strong>Email:</strong> {user.emailAddresses[0].emailAddress}</p>
         <p><strong>Backend Status:</strong> {backendStatus}</p>
      </div>

      <button onClick={() => signOut(() => navigate('/'))}>Sign Out</button>
    </div>
  );
};

export default Home;
