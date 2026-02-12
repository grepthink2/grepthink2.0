import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import './MyClasses.scss';

const MyClasses: React.FC = () => {
    const { classes, loading, refreshClasses, successMessage, setSuccessMessage } = useClass();
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Auto-hide success message after 4 seconds
    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => {
                setSuccessMessage(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, setSuccessMessage]);

    const handleRefresh = async () => {
        setRefreshing(true);
        setError(null);

        try {
            await refreshClasses();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to refresh classes');
        } finally {
            setRefreshing(false);
        }
    };

    if (loading) {
        return <div className="my-classes-loading">Loading classes...</div>;
    }

    return (
        <div className="my-classes">
            {/* Header with Refresh button - aligns with "My Classes" in Header */}
            <div className="my-classes-header">
                <button
                    className="my-classes-refresh-btn"
                    onClick={handleRefresh}
                    disabled={refreshing}
                    aria-label="Refresh classes"
                >
                    <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
                    Refresh
                </button>
            </div>

            {/* Success Message */}
            {successMessage && (
                <div className="my-classes-success">
                    {successMessage}
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="my-classes-error">
                    {error}
                </div>
            )}

            {/* Classes List */}
            <div className="my-classes-list">
                {classes.length === 0 ? (
                    <div className="my-classes-empty">
                        <p>You are not enrolled in any classes yet.</p>
                        <p>Click "Join Class" in the sidebar to join a class with a course code.</p>
                    </div>
                ) : (
                    classes.map((cls) => (
                        <div key={cls.id} className="my-classes-card">
                            <div className="my-classes-card-hero">
                                <div className="my-classes-card-title">{cls.name}</div>
                                <div className="my-classes-card-subtitle">Winter term</div>
                            </div>
                            <div className="my-classes-card-row my-classes-card-row--muted">
                                <div className="my-classes-card-row-left">
                                    <span className="my-classes-card-label">Skills:</span>
                                </div>
                            </div>
                            <div className="my-classes-card-row">
                                <div className="my-classes-card-row-left">
                                    <span className="my-classes-card-label">Owner:</span>
                                    <span className="my-classes-card-value">{cls.teacher_email}</span>
                                </div>
                                <div className="my-classes-card-row-right">
                                    {cls.course_code && (
                                        <span className="my-classes-card-pill">{cls.course_code}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default MyClasses;
