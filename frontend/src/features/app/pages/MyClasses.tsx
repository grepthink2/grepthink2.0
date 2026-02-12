import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import './MyClasses.scss';

const MyClasses: React.FC = () => {
    const { classes, loading, refreshClasses } = useClass();
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                    // once the student is able to enroll into the course, devtools should show class contents
                    classes.map((cls) => (
                        <div key={cls.id} className="my-classes-card">
                            <h3 className="my-classes-card-name">{cls.name}</h3>
                            {cls.description && (
                                <p className="my-classes-card-description">{cls.description}</p>
                            )}
                            <div className="my-classes-card-meta">
                                <span className="my-classes-card-code">Course Code: {cls.course_code}</span>
                                <span className="my-classes-card-teacher">Instructor: {cls.teacher_email || cls.created_by}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default MyClasses;
