import { useState, useEffect } from 'react';
import { useUser, useAuth, SignIn, UserButton } from '@clerk/clerk-react';
import { createClient } from '@supabase/supabase-js';

const SupabaseTest = () => {
    const { user } = useUser();
    const { getToken } = useAuth();
    const [status, setStatus] = useState<string>('Waiting for action...');
    const [data, setData] = useState<any>(null);
    const [backendStatus, setBackendStatus] = useState<string>('');

    const testBackend = async () => {
        setBackendStatus('Testing backend...');
        try {
            const res = await fetch('/api/test-auth');
            const data = await res.json();
            setBackendStatus(data.message || 'Backend Connected');
        } catch (err: any) {
            setBackendStatus('Backend Error: ' + err.message);
        }
    };

    const testConnection = async () => {
        try {
            setStatus('Getting token...');
            // Get the JWT token from Clerk (Native Integration)
            // Note: You must have enabled Supabase Integration in Clerk Dashboard and set up Clerk as Provider in Supabase
            let token;
            try {
                // Native integration uses the default token (no template needed)
                token = await getToken();
            } catch (authError: any) {
                setStatus('Error getting token: ' + authError.message);
                throw authError; 
            }
            
            if (!token) {
                setStatus('Error: No token received. Ensure you are signed in.');
                return;
            }

            setStatus('Initializing Supabase client...');
            
            // Initialize Supabase client with the Clerk token
            // IMPORTANT: This must use the SUPABASE_ANON_KEY (public), not the service_role key!
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.SUPABASE_KEY;

            if (!supabaseUrl || !supabaseKey) {
                 throw new Error("Missing Supabase URL or VITE_SUPABASE_KEY in environment variables.");
            }

            const supabase = createClient(
                supabaseUrl,
                supabaseKey,
                {
                    global: {
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    }
                }
            );

            setStatus('Querying database (with Clerk Token)... (URL: ' + supabaseUrl + ')');
            
            // Try to fetch data. 
            // Note: This relies on you having a table or RLS setup. 
            // We'll just try to get the current session user roughly or a simple query.
            // Since we authenticated with a custom token, standard supabase.auth.getUser() might behave differently 
            // than the standard Supabase Auth, but RLS on tables will work.
            
            // Let's try to query a simple command or table.
            // Since we don't know your specific tables, we will list the authenticated user id
            // to prove the token is accepted.
            
            // Verifying the JWT is valid for Supabase is mostly about making a request.
            // Let's try to select from a hypothetical 'todos' table, or just report success if no error is strict.
            // Or better, let's just show the token is there.
            
            // We will attempt to select from the 'profiles' table.
            const { data, error } = await supabase.from('profiles').select('*').limit(1);
            
            if (error) {
                // If profiles doesn't exist, we still want to know we connected successfully
                if (error.code === '42P01') { // undefined_table
                     setStatus(`Connected to Supabase, but 'profiles' table does not exist. (Authenticated as ${user?.id})`);
                } else {
                     setStatus(`Database error: ${error.message} (Code: ${error.code})`);
                }
            } else {
                setData(data);
                setStatus(`Success! Retrieved ${data.length} profile(s).`);
            }

        } catch (err: any) {
            setStatus(`Error: ${err.message}`);
        }
    };

    return (
        <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '20px' }}>
            <h2>Supabase Integration Test</h2>
            <p><strong>Clerk User ID:</strong> {user?.id}</p>
            <button 
                onClick={testConnection}
                style={{
                    backgroundColor: '#6b46c1',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer',
                    marginRight: '10px'
                }}
            >
                Test Database Connection (Direct)
            </button>
            <button
                onClick={testBackend}
                style={{
                    backgroundColor: '#10b981',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    cursor: 'pointer'
                }}
            >
                Test Backend API
            </button>
            <div style={{ marginTop: '10px', padding: '10px', background: '#f5f5f5', borderRadius: '4px' }}>
                <p style={{ color: 'black' }}><strong>DB Status:</strong> {status}</p>
                {backendStatus && <p><strong>Backend Status:</strong> {backendStatus}</p>}
                {status.includes('No JWT template') && (
                    <div style={{color: 'red', marginTop: '10px'}}>
                        <strong>Configuration Required:</strong> You need to create a JWT template named `supabase` in your Clerk Dashboard.
                        <br/>
                        Check the file <code>CLERK_SUPABASE_SETUP.md</code> in your frontend directory for instructions.
                    </div>
                )}
            </div>
            {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
        </div>
    );
};

export default function ClerkDemo() {
    const { isSignedIn } = useUser();

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px', fontFamily: 'system-ui' }}>
            <h1>Clerk + Supabase Integration</h1>
            
            <div style={{ marginBottom: '20px' }}>
                {!isSignedIn ? (
                    <div>
                        <p>Please sign in to test the integration.</p>
                        <SignIn />
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                            <UserButton />
                            <span>Logged in successfully!</span>
                        </div>
                        <SupabaseTest />
                    </div>
                )}
            </div>
        </div>
    );
}
