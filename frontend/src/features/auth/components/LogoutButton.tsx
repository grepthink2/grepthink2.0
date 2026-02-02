import React from 'react';
import { useClerk, useUser, useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import './LogoutButton.scss';

interface LogoutButtonProps {
    onLogout?: () => void;
    className?: string;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({ onLogout, className = '' }) => {
    const { signOut } = useClerk();
    const { getToken } = useAuth();
    const { user } = useUser();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            // Optional: Call backend to log out (audit log, invalidate server session if exists)
            // Even though Clerk handles auth, we might want to tell our backend 
            const token = await getToken();
            if (token) {
                try {
                    await fetch('/api/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                } catch (error) {
                    console.error("Backend logout failed:", error);
                    // We continue client-side logout anyway
                }
            }
        } catch (error) {
            console.error("Error during logout preparation:", error);
        } finally {
            // Always sign out on the client
            await signOut(() => {
                if (onLogout) onLogout();
                navigate('/');
            });
        }
    };

    if (!user) return null;

    return (
        <button className={`logout-button ${className}`} onClick={handleLogout}>
            Log Out
        </button>
    );
};

export default LogoutButton;
