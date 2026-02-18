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
        // Always sign out on the client
        await signOut();
        if (onLogout) onLogout();
        navigate('/');
    };

    if (!user) return null;

    return (
        <button className={`logout-button ${className}`} onClick={handleLogout}>
            Log Out
        </button>
    );
};

export default LogoutButton;
