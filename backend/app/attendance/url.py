"""
TA Management routes — class-TA designation, project-TA assignment,
meeting/Zoom metadata, weekly schedule, and attendance.

The prefix is ``/api`` because routes span both class-scoped and
project-scoped paths.
"""
from fastapi import APIRouter

from app.attendance import views

router = APIRouter(prefix="/api", tags=["ta-management"])

# Class TA designation
router.get('/classes/{class_id}/tas')(views.list_class_tas)
router.post('/classes/{class_id}/tas')(views.set_class_ta)

# Project TA assignment + meeting/Zoom metadata
router.post('/projects/{project_id}/assign-ta')(views.assign_project_ta)
router.patch('/projects/{project_id}/meeting')(views.update_project_meeting)

# Class-level meeting cadence (frequency + duration)
router.patch('/classes/{class_id}/meeting-cadence')(views.set_meeting_cadence)

# Weekly schedule (instructor: all; TA: mine; student: my-team)
router.get('/classes/{class_id}/ta-schedule')(views.get_ta_schedule)
router.get('/classes/{class_id}/ta-schedule/mine')(views.get_my_assigned_teams)
router.get('/classes/{class_id}/ta-schedule/my-team')(views.get_my_team_schedule)

# Attendance
router.get('/projects/{project_id}/attendance')(views.get_team_attendance)
router.put('/projects/{project_id}/attendance')(views.upsert_attendance)
router.post('/projects/{project_id}/attendance/mark-all-present')(views.mark_all_present)
