import React from 'react';
import { useAuth, useUser } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import './LogoutButton.scss';

interface LogoutButtonProps {
    onLogout?: () => void;
    className?: string;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({ onLogout, className = '' }) => {
    const { signOut } = useAuth();
    const { user } = useUser();
    const navigate = useNavigate();

    const handleLogout = async () => {
        // signOut triggers SIGNED_OUT in onAuthStateChange, which clears
        // the context session in this tab AND any other open tabs (via
        // localStorage propagation). ProtectedRoute reacts automatically;
        // we still navigate explicitly so the user lands on the landing
        // page instead of a brief /login flash.
        await signOut();
        if (onLogout) onLogout();
        navigate('/', { replace: true });
    };

    if (!user) return null;

    return (
        <button className={`logout-button ${className}`} onClick={handleLogout}>
            Log Out
        </button>
    );
};

export default LogoutButton;
