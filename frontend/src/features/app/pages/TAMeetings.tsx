import React from 'react';
import { useClass } from '@/lib/classContext';
import { useEnrollmentRole } from '@/lib/enrollmentRole';
import TAScheduleView from '@features/app/components/TAManagement/TAScheduleView';

/**
 * TA meeting schedule + attendance. One route (`/app/ta-meetings`) serving all
 * roles; the user's class-level role (resolved from the enrollment-role
 * endpoint, the same source the sidebar uses) decides the view:
 *
 * - Instructor: every team in the class, editable, can designate/assign TAs.
 * - Class TA: the teams assigned to them — editable Zoom + attendance.
 * - Regular student: their own team's slot read-only, with their own status.
 */
const TAMeetings: React.FC = () => {
  const { selectedClass } = useClass();
  // `undefined` = still resolving; `null` = no class / not enrolled.
  const role = useEnrollmentRole(selectedClass?.id);

  if (role === undefined) return null; // resolving role — avoid a wrong-scope flash

  if (role === 'instructor') {
    return (
      <TAScheduleView
        title="TA Meetings"
        scope="all"
        editable
        assignable
        emptyMessage="No project teams in this class yet. Create or assign teams to schedule their TA meetings."
      />
    );
  }

  if (role === 'ta') {
    return (
      <TAScheduleView
        title="TA Meetings"
        scope="mine"
        editable
        assignable={false}
        emptyMessage="You aren't assigned to any teams in this class yet."
      />
    );
  }

  return (
    <TAScheduleView
      title="TA Meetings"
      scope="my-team"
      editable={false}
      assignable={false}
      readOnlyOwn
      emptyMessage="You're not on a team in this class yet. Once you join a project, your TA meeting will appear here."
    />
  );
};

export default TAMeetings;
