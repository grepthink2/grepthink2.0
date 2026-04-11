import React, { useState, useEffect, type KeyboardEvent } from 'react';
import { ArrowRight, Check, Copy, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useClass, type Class } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import './MyClasses.scss';

const MyClasses: React.FC = () => {
    const { classes, loading, successMessage, setSuccessMessage, setSelectedClass } = useClass();
    const { role } = useAuth();
    const navigate = useNavigate();
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const isInstructor = role === 'instructor';

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => {
                setSuccessMessage(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, setSuccessMessage]);

    const handleCopyCode = (_e: React.MouseEvent, cls: Class) => {
        if (!cls.course_code) return;
        navigator.clipboard.writeText(cls.course_code);
        setCopiedId(cls.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleStudentCardActivate = (cls: Class) => {
        setSelectedClass(cls);
        navigate('/app/my-project');
    };

    const handleInstructorCardActivate = (cls: Class) => {
        setSelectedClass(cls);
        navigate('/app/dashboard');
    };

    const handleStudentCardKeyDown = (e: KeyboardEvent<HTMLDivElement>, cls: Class) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStudentCardActivate(cls);
        }
    };

    const handleEditClick = () => {
        navigate('/app/class-settings');
    };

    if (loading) {
        return <div className="my-classes-loading">Loading classes...</div>;
    }

    return (
        <div className="my-classes">
            {successMessage && (
                <div className="my-classes-success">
                    {successMessage}
                </div>
            )}

            <div className="my-classes-list">
                {classes.length === 0 ? (
                    <div className="my-classes-empty">
                        <p>You are not in any classes yet.</p>
                        {isInstructor ? (
                            <p>Use &quot;Create Class&quot; in the sidebar to add one.</p>
                        ) : (
                            <p>Click &quot;Join Class&quot; in the sidebar to join with a course code.</p>
                        )}
                    </div>
                ) : (
                    classes.map((cls) =>
                        isInstructor ? (
                            <div key={cls.id} className="my-classes-card my-classes-card--instructor">
                                <div className="my-classes-card-hero my-classes-card-hero--instructor">
                                    {cls.course_code ? (
                                        <button
                                            type="button"
                                            className={`my-classes-card-code-tag${
                                                copiedId === cls.id ? ' my-classes-card-code-tag--copied' : ''
                                            }`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopyCode(e, cls);
                                            }}
                                            aria-label={
                                                copiedId === cls.id
                                                    ? 'Access code copied'
                                                    : `Copy access code ${cls.course_code}`
                                            }
                                        >
                                            {copiedId === cls.id ? (
                                                <>
                                                    <Check size={12} strokeWidth={2.5} aria-hidden />
                                                    <span>Copied</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="my-classes-card-code-tag__text">
                                                        {cls.course_code}
                                                    </span>
                                                    <Copy
                                                        size={13}
                                                        strokeWidth={2}
                                                        className="my-classes-card-code-tag__copy-icon"
                                                        aria-hidden
                                                    />
                                                </>
                                            )}
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        className="my-classes-card-hero-edit"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEditClick();
                                        }}
                                        aria-label="Class settings"
                                    >
                                        <Pencil size={18} strokeWidth={2} />
                                    </button>
                                </div>
                                <div className="my-classes-card-body my-classes-card-body--instructor">
                                    <button
                                        type="button"
                                        className="my-classes-card-instructor-main"
                                        aria-label={`Open ${cls.name} dashboard`}
                                        onClick={() => handleInstructorCardActivate(cls)}
                                    >
                                        <div className="my-classes-card-title">{cls.name}</div>
                                        {cls.description && (
                                            <div className="my-classes-card-subtitle">{cls.description}</div>
                                        )}
                                        <div className="my-classes-card-row">
                                            <span className="my-classes-card-row-spacer" aria-hidden />
                                            <span className="my-classes-select-cta">
                                                Select <ArrowRight size={16} />
                                            </span>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div
                                key={cls.id}
                                className="my-classes-card my-classes-card--student"
                                role="button"
                                tabIndex={0}
                                aria-label={`Open ${cls.name} and go to My Project`}
                                onClick={() => handleStudentCardActivate(cls)}
                                onKeyDown={(e) => handleStudentCardKeyDown(e, cls)}
                            >
                                <div className="my-classes-card-hero my-classes-card-hero--student" />
                                <div className="my-classes-card-body my-classes-card-body--student">
                                    <div className="my-classes-card-title">{cls.name}</div>
                                    {cls.description && (
                                        <div className="my-classes-card-subtitle">{cls.description}</div>
                                    )}
                                    <div className="my-classes-card-row">
                                        <div className="my-classes-card-enrollment">~ ENROLLED</div>
                                        <span className="my-classes-select-cta">
                                            Select <ArrowRight size={16} />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )
                    )
                )}
            </div>
        </div>
    );
};

export default MyClasses;
