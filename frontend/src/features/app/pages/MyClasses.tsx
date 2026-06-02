import React, { useState, useEffect, useMemo, type KeyboardEvent } from 'react';
import { ArrowRight, Check, Copy, GraduationCap, Pencil, PlusCircle } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '@/features/app/appOutletContext';
import { useClass, type Class } from '@/lib/classContext';
import type { ClassLifecycleStatus } from '@/lib/classPreferences';
import { useAuth } from '@/lib/auth';
import CreateClassModal from '@features/app/components/Classes/CreateClassModal';
import ClassSettingsModal from '@features/app/components/Classes/ClassSettingsModal';
import { pickClassBannerPreset, presetToCssBackground } from '@/lib/classBannerGradients';
import './MyClasses.scss';

type CourseFilter = 'all' | 'active' | 'complete';

function classMatchesFilter(
    classItem: Class,
    filter: CourseFilter,
    getClassStatus: (classItem: Class) => ClassLifecycleStatus,
): boolean {
    if (filter === 'all') return true;
    const isComplete = getClassStatus(classItem) === 'complete';
    if (filter === 'complete') return isComplete;
    return !isComplete;
}

const FILTER_LABELS: Record<CourseFilter, string> = {
    all: 'All',
    active: 'Active',
    complete: 'Completed',
};

function classHeroStyle(cls: Class): React.CSSProperties {
    if (cls.image_url) {
        return {
            backgroundImage: `url(${cls.image_url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
        };
    }
    return { background: presetToCssBackground(pickClassBannerPreset(cls.id)) };
}

function formatEnrolledLabel(count: number | undefined): string {
    if (count == null) return '— enrolled';
    return `${count} enrolled`;
}

function ClassStatusTag({ status }: { status: ClassLifecycleStatus }) {
    return (
        <span className={`my-classes-card-status-tag my-classes-card-status-tag--${status}`}>
            {status === 'complete' ? 'Completed' : 'Active'}
        </span>
    );
}

const MyClasses: React.FC = () => {
    const {
        visibleClasses,
        loading,
        successMessage,
        setSuccessMessage,
        setSelectedClass,
        getClassStatus,
        refreshClasses,
    } = useClass();
    const { role } = useAuth();
    const navigate = useNavigate();
    const { openJoinClassModal } = useOutletContext<AppOutletContext>();
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [courseFilter, setCourseFilter] = useState<CourseFilter>('all');
    const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
    const [settingsClass, setSettingsClass] = useState<Class | null>(null);

    const isInstructor = role === 'instructor';

    const filteredClasses = useMemo(
        () => visibleClasses.filter((c) => classMatchesFilter(c, courseFilter, getClassStatus)),
        [visibleClasses, courseFilter, getClassStatus],
    );

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => {
                setSuccessMessage(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, setSuccessMessage]);

    // Keep enrollment counts fresh while this page is open.
    useEffect(() => {
        const refresh = () => {
            void refreshClasses(false);
        };
        const interval = window.setInterval(refresh, 30_000);
        const onVisibility = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [refreshClasses]);

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

    const handleOpenSettings = (cls: Class) => {
        setSettingsClass(cls);
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

            <div className="my-classes-toolbar">
                <div className="my-classes-toolbar__filters" role="tablist" aria-label="Filter courses">
                    {(Object.keys(FILTER_LABELS) as CourseFilter[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={courseFilter === key}
                            className={`create-class-modal__term-button my-classes-toolbar__filter-btn${
                                courseFilter === key ? ' active' : ''
                            }`}
                            onClick={() => setCourseFilter(key)}
                        >
                            {FILTER_LABELS[key]}
                        </button>
                    ))}
                </div>
                {isInstructor ? (
                    <button
                        type="button"
                        className="add-assignment-btn projects__add-project-btn my-classes-toolbar__create-btn"
                        onClick={() => setIsCreateClassOpen(true)}
                    >
                        <PlusCircle size={16} aria-hidden />
                        Create Class
                    </button>
                ) : (
                    <button
                        type="button"
                        className="add-assignment-btn projects__add-project-btn my-classes-toolbar__create-btn"
                        onClick={() => openJoinClassModal()}
                    >
                        <GraduationCap size={16} aria-hidden />
                        Join Class
                    </button>
                )}
            </div>

            <div className="my-classes-list-scroll">
                <div className="my-classes-list">
                    {visibleClasses.length === 0 ? (
                        <div className="my-classes-empty">
                            <p>You are not in any classes yet.</p>
                            {isInstructor ? (
                                <p>Use &quot;Create Class&quot; above or in the sidebar to add one.</p>
                            ) : (
                                <p>Use &quot;Join Class&quot; above or in the sidebar to join with a course code.</p>
                            )}
                        </div>
                    ) : filteredClasses.length === 0 ? (
                        <div className="my-classes-empty">
                            <p>No {FILTER_LABELS[courseFilter].toLowerCase()} courses match this filter.</p>
                            {isInstructor ? (
                                <p>Try another filter or create a new class.</p>
                            ) : (
                                <p>Try another filter or join a class.</p>
                            )}
                        </div>
                    ) : (
                        filteredClasses.map((cls) =>
                            isInstructor ? (
                                <div key={cls.id} className="my-classes-card my-classes-card--instructor">
                                <div
                                    className="my-classes-card-hero my-classes-card-hero--instructor"
                                    style={classHeroStyle(cls)}
                                >
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
                                            handleOpenSettings(cls);
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
                                        <ClassStatusTag status={getClassStatus(cls)} />
                                        <div className="my-classes-card-row">
                                            <div className="my-classes-card-enrollment">
                                                {formatEnrolledLabel(cls.enrolled_count)}
                                            </div>
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
                                    <div
                                        className="my-classes-card-hero my-classes-card-hero--student"
                                        style={classHeroStyle(cls)}
                                    />
                                    <div className="my-classes-card-body my-classes-card-body--student">
                                        <div className="my-classes-card-title">{cls.name}</div>
                                        {cls.description && (
                                            <div className="my-classes-card-subtitle">{cls.description}</div>
                                        )}
                                        <ClassStatusTag status={getClassStatus(cls)} />
                                        <div className="my-classes-card-row">
                                            <div className="my-classes-card-enrollment">
                                                {formatEnrolledLabel(cls.enrolled_count)}
                                            </div>
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

            {isInstructor && (
                <>
                    <CreateClassModal isOpen={isCreateClassOpen} onClose={() => setIsCreateClassOpen(false)} />
                    <ClassSettingsModal
                        isOpen={settingsClass !== null}
                        classItem={settingsClass}
                        onClose={() => setSettingsClass(null)}
                    />
                </>
            )}
        </div>
    );
};

export default MyClasses;
