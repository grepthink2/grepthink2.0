import React, { useState, useEffect, useMemo, type KeyboardEvent } from 'react';
import { ArrowRight, Check, Copy, GraduationCap, LogOut, Pencil, PlusCircle } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { AppOutletContext } from '@/features/app/appOutletContext';
import { useClass, type Class, type ClassRole } from '@/lib/classContext';
import { distinctSchools, roleInView } from '@/lib/classMembership';
import type { ClassLifecycleStatus } from '@/lib/classPreferences';
import { useAuth } from '@/lib/auth';
import { usePreview } from '@/lib/previewContext';
import { api } from '@/lib/api';
import { lazyModal } from '@/lib/lazyModal';
import { CLASS_ROLE_LABELS, classLandingPath } from '@features/app/config/routePermissions';
import ClassSettingsModal from '@features/app/components/Classes/ClassSettingsModal';
import ConfirmModal from '@features/app/components/Overlays/ConfirmModal';
import { pickClassBannerPreset, presetToCssBackground } from '@/lib/classBannerGradients';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './MyClasses.scss';

// Loads on first open; the form pulls in the date picker.
const CreateClassModal = lazyModal(
  () => import('@features/app/components/Classes/CreateClassModal'),
  (p) => p.isOpen,
);

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

/** The class's status, and your role in it when given (your classes mix roles). */
function ClassTags({ status, role }: { status: ClassLifecycleStatus; role: ClassRole | null }) {
    return (
        <span className="my-classes-card-tags">
            <ClassStatusTag status={status} />
            {role && <span className="my-classes-card-role-tag">{CLASS_ROLE_LABELS[role]}</span>}
        </span>
    );
}

interface SchoolSection {
    key: string;
    name: string;
    classes: Class[];
}

/** `classes` by school, schools by name, then the classes with no school as "Other classes". */
function groupBySchool(classes: Class[]): SchoolSection[] {
    const sections: SchoolSection[] = distinctSchools(classes).map((school) => ({
        key: school.id,
        name: school.name,
        classes: classes.filter((c) => c.institution?.id === school.id),
    }));
    const withoutSchool = classes.filter((c) => !c.institution);
    if (withoutSchool.length > 0) {
        sections.push({ key: 'no-school', name: 'Other classes', classes: withoutSchool });
    }
    return sections;
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
        previewClassId,
    } = useClass();
    const { canCreateClasses: accountCanCreateClasses } = useAuth();
    const { isPreviewing } = usePreview();
    // "View class as student" shows what a student account can do, as the sidebar does.
    const canCreateClasses = accountCanCreateClasses && !isPreviewing;
    const navigate = useNavigate();
    const { openJoinClassModal } = useOutletContext<AppOutletContext>();
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [courseFilter, setCourseFilter] = useState<CourseFilter>('all');
    const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
    const [settingsClass, setSettingsClass] = useState<Class | null>(null);
    const [leavingClass, setLeavingClass] = useState<Class | null>(null);

    const filteredClasses = useMemo(
        () => visibleClasses.filter((c) => classMatchesFilter(c, courseFilter, getClassStatus)),
        [visibleClasses, courseFilter, getClassStatus],
    );
    // Every card follows the role the UI shows: the class "View class as student" previews is a
    // student's, as it is everywhere else while the preview lasts.
    const roleOf = (cls: Class): ClassRole => roleInView(cls, previewClassId);
    // Label each card with your role only when your classes mix roles.
    const mixedRoles = new Set(visibleClasses.map(roleOf)).size > 1;
    // A section per school when your classes span two or more schools.
    const schoolSections = useMemo(
        () => (distinctSchools(visibleClasses).length > 1 ? groupBySchool(filteredClasses) : null),
        [visibleClasses, filteredClasses],
    );

    useEffect(() => {
        if (successMessage) {
            const timer = setTimeout(() => {
                setSuccessMessage(null);
            }, 4000);
            return () => clearTimeout(timer);
        }
    }, [successMessage, setSuccessMessage]);

    // Keep enrollment counts fresh while this page is open. (The class list also refreshes itself
    // when the tab regains focus.)
    useEffect(() => {
        const interval = window.setInterval(() => {
            void refreshClasses(false);
        }, 30_000);
        return () => window.clearInterval(interval);
    }, [refreshClasses]);

    const handleCopyCode = (_e: React.MouseEvent, cls: Class) => {
        if (!cls.course_code) return;
        navigator.clipboard.writeText(cls.course_code);
        setCopiedId(cls.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // A card opens its class on the page for your role in it.
    const handleCardActivate = (cls: Class) => {
        setSelectedClass(cls);
        navigate(classLandingPath(roleOf(cls)));
    };

    const handleCardKeyDown = (e: KeyboardEvent<HTMLDivElement>, cls: Class) => {
        // Ignore keys originating from inner controls (e.g. the leave button).
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardActivate(cls);
        }
    };

    const handleOpenSettings = (cls: Class) => {
        setSettingsClass(cls);
    };

    const handleConfirmLeave = async () => {
        if (!leavingClass) return;
        const cls = leavingClass;
        setLeavingClass(null);
        try {
            await api.leaveClass(cls.id);
            await refreshClasses(false);
            setSuccessMessage(`You have left ${cls.name}.`);
        } catch (error) {
            console.error('Failed to leave class:', error);
            setSuccessMessage(`Could not leave ${cls.name}. Please try again.`);
        }
    };

    // Each card follows your role in its class: the owner card (code and settings) for a class you
    // teach, the learner card (Leave) for one you TA or take.
    const renderCard = (cls: Class) => {
        const role = roleOf(cls);
        const tags = <ClassTags status={getClassStatus(cls)} role={mixedRoles ? role : null} />;
        if (role === 'instructor') {
            return (
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
                            onClick={() => handleCardActivate(cls)}
                        >
                            <div className="my-classes-card-title">{cls.name}</div>
                            {cls.description && (
                                <div className="my-classes-card-subtitle">{cls.description}</div>
                            )}
                            {tags}
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
            );
        }
        return (
            <div
                key={cls.id}
                className="my-classes-card my-classes-card--student"
                role="button"
                tabIndex={0}
                aria-label={`Open ${cls.name} and go to ${role === 'ta' ? 'TA Meetings' : 'My Project'}`}
                onClick={() => handleCardActivate(cls)}
                onKeyDown={(e) => handleCardKeyDown(e, cls)}
            >
                <div
                    className="my-classes-card-hero my-classes-card-hero--student"
                    style={classHeroStyle(cls)}
                >
                    <button
                        type="button"
                        className="my-classes-card-hero-leave"
                        onClick={(e) => {
                            e.stopPropagation();
                            setLeavingClass(cls);
                        }}
                        aria-label={`Leave ${cls.name}`}
                        data-tooltip="Leave Class"
                    >
                        <LogOut size={18} strokeWidth={2} />
                    </button>
                </div>
                <div className="my-classes-card-body my-classes-card-body--student">
                    <div className="my-classes-card-title">{cls.name}</div>
                    {cls.description && (
                        <div className="my-classes-card-subtitle">{cls.description}</div>
                    )}
                    {tags}
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
        );
    };

    if (loading) {
        return (
            <div className="my-classes-list" aria-busy="true">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="my-classes-card">
                        <Skeleton height={120} radius={0} />
                        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Skeleton width="70%" height={15} />
                            <Skeleton width="45%" height={12} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const joinClassButton = (className: string) => (
        <button type="button" className={className} onClick={() => openJoinClassModal()}>
            <GraduationCap size={16} aria-hidden />
            Join Class
        </button>
    );

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
                {canCreateClasses ? (
                    <div className="my-classes-toolbar__actions">
                        {joinClassButton('add-assignment-btn my-classes-toolbar__join-btn')}
                        <button
                            type="button"
                            className="add-assignment-btn projects__add-project-btn my-classes-toolbar__create-btn"
                            onClick={() => setIsCreateClassOpen(true)}
                        >
                            <PlusCircle size={16} aria-hidden />
                            Create Class
                        </button>
                    </div>
                ) : (
                    joinClassButton('add-assignment-btn projects__add-project-btn my-classes-toolbar__create-btn')
                )}
            </div>

            <div className="my-classes-list-scroll">
                {schoolSections && filteredClasses.length > 0 ? (
                    schoolSections.map((section) => (
                        <section key={section.key} className="my-classes-school">
                            <h2 className="my-classes-school__heading">{section.name}</h2>
                            <div className="my-classes-list">{section.classes.map(renderCard)}</div>
                        </section>
                    ))
                ) : (
                    <div className="my-classes-list">
                        {visibleClasses.length === 0 ? (
                            <div className="my-classes-empty">
                                <p>You are not in any classes yet.</p>
                                {canCreateClasses ? (
                                    <p>Use &quot;Create Class&quot; above or in the sidebar to add one.</p>
                                ) : (
                                    <p>Use &quot;Join Class&quot; above or in the sidebar to join with a course code.</p>
                                )}
                            </div>
                        ) : filteredClasses.length === 0 ? (
                            <div className="my-classes-empty">
                                <p>No {FILTER_LABELS[courseFilter].toLowerCase()} courses match this filter.</p>
                                {canCreateClasses ? (
                                    <p>Try another filter or create a new class.</p>
                                ) : (
                                    <p>Try another filter or join a class.</p>
                                )}
                            </div>
                        ) : (
                            filteredClasses.map(renderCard)
                        )}
                    </div>
                )}
            </div>

            {canCreateClasses && (
                <CreateClassModal isOpen={isCreateClassOpen} onClose={() => setIsCreateClassOpen(false)} />
            )}
            {/* Each opens only from its own kind of card. */}
            <ClassSettingsModal
                isOpen={settingsClass !== null}
                classItem={settingsClass}
                onClose={() => setSettingsClass(null)}
            />
            <ConfirmModal
                isOpen={leavingClass !== null}
                onClose={() => setLeavingClass(null)}
                onConfirm={() => void handleConfirmLeave()}
                title={leavingClass ? `Leave ${leavingClass.name}?` : 'Leave class?'}
                message="You'll be removed from this class, along with any project you're assigned to in it and any pending project requests. You can rejoin later with the course code."
                confirmText="Leave class"
                cancelText="Cancel"
            />
        </div>
    );
};

export default MyClasses;
