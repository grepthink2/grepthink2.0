"""
Class management business logic
"""
import csv
import datetime
import io
import logging
from typing import Optional
from uuid import UUID
from fastapi import HTTPException
from app.database.client import query_pool, service_client, supabase
from app.utils.generators import generate_course_code

logger = logging.getLogger(__name__)

_ROSTER_INSERT_BATCH = 200


# Terms that run a full semester (8 TSR weeks); summer runs 3 weeks.
_FULL_TERM_NAMES = {"fall", "winter", "spring"}
_SUMMER_TSR_COUNT = 3
_FULL_TSR_COUNT = 8


def normalize_roster_status(raw: str) -> str:
    """Map a UCSC roster Status cell to our classStatus enum value."""
    key = raw.strip().lower()
    if key in ('enrolled', 'e'):
        return 'enrolled'
    if key in ('waitlisted', 'wait list', 'waitlist', 'waiting'):
        return 'waitlisted'
    if key in ('dropped', 'drop'):
        return 'dropped'
    raise ValueError(f"Unknown roster status: {raw!r}")


def _roster_entry_name(entry: dict | None) -> str | None:
    """Build a display name from roster entry first/last name columns."""
    if not entry:
        return None
    first = (entry.get('first_name') or '').strip()
    last = (entry.get('last_name') or '').strip()
    full = f"{first} {last}".strip()
    return full or None


def _resolve_roster_export_names(
    profile: dict | None,
    roster_entry: dict | None,
) -> tuple[str, str]:
    """First/last for CSV export: roster CSV names, then profile, then empty."""
    if roster_entry:
        first = (roster_entry.get('first_name') or '').strip()
        last = (roster_entry.get('last_name') or '').strip()
        if first or last:
            return first, last
    if profile:
        first = (profile.get('first_name') or '').strip()
        last = (profile.get('last_name') or '').strip()
        if first or last:
            return first, last
    return '', ''


def _format_project_export(project_names: list[str]) -> str:
    return ', '.join(project_names) if project_names else ''


def _resolve_roster_display_name(
    profile: dict | None,
    roster_entry: dict | None,
    email: str,
) -> str:
    """
    Display name for a roster row.

    Prefer the matched profile name; if empty, use the roster CSV name;
    otherwise derive from email.
    """
    if profile:
        first = (profile.get('first_name') or '').strip()
        last = (profile.get('last_name') or '').strip()
        full = f"{first} {last}".strip()
        if full:
            return full

    roster_name = _roster_entry_name(roster_entry)
    if roster_name:
        return roster_name

    local = email.split('@')[0]
    if not local:
        return email
    return local.replace('.', ' ').replace('_', ' ').title()


def _find_student_profile_by_email(client, email: str) -> dict | None:
    """Look up a student profile by UCSC edu_email first, then primary email."""
    normalized = email.strip().lower()
    edu_match = (
        client.table('profiles')
        .select('id, role, email, edu_email, first_name, last_name')
        .eq('edu_email', normalized)
        .execute()
    )
    if edu_match.data:
        return edu_match.data[0]

    email_match = (
        client.table('profiles')
        .select('id, role, email, edu_email, first_name, last_name')
        .eq('email', normalized)
        .execute()
    )
    if email_match.data:
        return email_match.data[0]
    return None


def _build_profile_email_map(profiles: list[dict]) -> dict[str, dict]:
    """Map lowercase roster email → profile row (edu_email takes precedence)."""
    email_map: dict[str, dict] = {}
    for profile in profiles:
        primary = (profile.get('email') or '').strip().lower()
        edu = (profile.get('edu_email') or '').strip().lower()
        if edu:
            email_map[edu] = profile
        if primary and primary not in email_map:
            email_map[primary] = profile
    return email_map


def _verify_roster_access(client, class_id: str, user_id: str, role: str) -> dict:
    """Ensure the user may view roster data for this class."""
    class_result = (
        client.table('classes')
        .select('id, created_by')
        .eq('id', class_id)
        .execute()
    )
    if not class_result.data:
        raise HTTPException(status_code=404, detail="Class not found")

    class_row = class_result.data[0]
    if role == 'instructor' and class_row.get('created_by') == user_id:
        return class_row

    enrollment = (
        client.table('class_enrollments')
        .select('id')
        .eq('class_id', class_id)
        .eq('user_id', user_id)
        .execute()
    )
    if enrollment.data:
        return class_row

    raise HTTPException(status_code=403, detail="You do not have access to this class roster")


def _parse_roster_csv(csv_text: str) -> list[dict]:
    """Parse UCSC roster CSV; returns deduped rows (last row wins per email)."""
    if csv_text.startswith('\ufeff'):
        csv_text = csv_text[1:]

    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    field_map = {h.strip().lower(): h for h in reader.fieldnames if h}
    email_col = field_map.get('email address') or field_map.get('email')
    status_col = field_map.get('status')
    first_name_col = field_map.get('first name')
    last_name_col = field_map.get('last name')
    if not email_col or not status_col:
        raise HTTPException(
            status_code=400,
            detail="CSV must include 'Email Address' and 'Status' columns",
        )

    deduped: dict[str, dict] = {}
    for row_num, row in enumerate(reader, start=2):
        email_raw = (row.get(email_col) or '').strip()
        status_raw = (row.get(status_col) or '').strip()
        if not email_raw:
            continue
        email = email_raw.lower()
        try:
            status = normalize_roster_status(status_raw)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Row {row_num}: {exc}",
            ) from exc
        first_name = (row.get(first_name_col) or '').strip() if first_name_col else ''
        last_name = (row.get(last_name_col) or '').strip() if last_name_col else ''
        deduped[email] = {
            'email': email,
            'status': status,
            'first_name': first_name,
            'last_name': last_name,
        }

    if not deduped:
        raise HTTPException(status_code=400, detail="CSV contains no student rows")

    return list(deduped.values())


def _generate_tsr_assignments(client, class_id: str, term: str, start_date: datetime.date) -> None:
    """
    Auto-create TSR assignments for a new class.

    Assignments open after the first 2 weeks of class (start_date + 14 days)
    and are each one week long, one per sprint week.

    Fall / Winter / Spring  →  8 TSR assignments (weeks 3–10)
    Summer                  →  3 TSR assignments (weeks 3–5)
    """
    term_lower = (term or "").strip().lower()
    count = _FULL_TSR_COUNT if term_lower in _FULL_TERM_NAMES else _SUMMER_TSR_COUNT

    first_open = start_date + datetime.timedelta(days=14)

    assignments = []
    for week in range(1, count + 1):
        open_date = first_open + datetime.timedelta(weeks=week - 1)
        close_date = open_date + datetime.timedelta(days=6)
        assignments.append({
            "Title": f"TSR Week {week + 2}",
            "open_date": open_date.isoformat(),
            "close_date": close_date.isoformat(),
            "status": "publish",
            "class_id": class_id,
            "assignment_type": "tsr",
        })

    try:
        client.table('assignments').insert(assignments).execute()
        logger.info(
            "Auto-created %d TSR assignments for class %s (term=%r)",
            len(assignments), class_id, term,
        )
    except Exception:
        # WARN: If TSR auto-creation fails, the class still exists but has no
        # TSR schedule. Tracked as a silent-failure risk.
        logger.warning(
            "Failed to auto-create TSR assignments for class %s (term=%r) — "
            "class was created but TSR schedule is missing",
            class_id, term, exc_info=True,
        )


def create_class(
    name: str,
    description: Optional[str],
    term: str,
    start_date: datetime.date,
    user_id: str,
) -> dict:
    """
    Create a new class with a unique course code and auto-generate TSR assignments.

    After the class is created, TSR assignments are automatically generated
    starting after the first 2 weeks of class:
      - Fall / Winter / Spring  →  8 weekly TSR assignments
      - Summer                  →  3 weekly TSR assignments
    """
    try:
        client = service_client if service_client else supabase

        year = start_date.year

        # Generate unique course code
        course_code = None
        for _ in range(5):
            candidate = generate_course_code()
            existing = client.table('classes').select('id').ilike('course_code', candidate).execute()
            if not existing.data:
                course_code = candidate.upper()
                break

        if not course_code:
            raise HTTPException(status_code=500, detail="Failed to generate unique course code")

        class_data: dict = {
            "name": name,
            "created_by": user_id,
            "course_code": course_code,
            "year": year,
            "term": term,
            "start_date": start_date.isoformat(),
        }
        if description is not None:
            class_data["description"] = description

        result = client.table('classes').insert(class_data).execute()
        new_class = result.data[0]

        logger.info(
            "Class created | class_id=%s name=%r course_code=%s term=%r created_by=%s",
            new_class.get('id'), name, course_code, term, user_id,
        )

        # Auto-generate TSR assignments for this class
        _generate_tsr_assignments(client, new_class['id'], term, start_date)

        return new_class
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error creating class | name=%r user_id=%s", name, user_id)
        raise HTTPException(status_code=500, detail="Failed to create class")


def get_classes_for_user(user_id: str, role: str) -> list:
    """
    Get all classes for a user based on their role
    
    Args:
        user_id: User's unique identifier
        role: User's role (instructor or student)
        
    Returns:
        List of class dictionaries
        
    Raises:
        HTTPException: If database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        if role == "instructor":
            # Instructors see classes they created
            result = client.table('classes').select('*').eq('created_by', user_id).execute()
            return result.data
        else:
            # Students: fetch enrollments with joined class + instructor info
            enrollments = client.table('class_enrollments').select(
                'class_id, classes ( id, name, description, created_by, created_at, course_code )'
            ).eq('user_id', user_id).execute()

            if not enrollments.data:
                return []

            classes = []
            instructor_ids = []
            for row in enrollments.data:
                cls = row.get('classes')
                if not cls:
                    continue
                if cls.get('created_by'):
                    instructor_ids.append(cls['created_by'])
                classes.append(cls)

            # Fetch instructor emails
            instructor_emails = {}
            if instructor_ids:
                instructors = client.table('profiles').select('id, email').in_('id', instructor_ids).execute()
                for t in instructors.data or []:
                    instructor_emails[t['id']] = t.get('email')

            # Attach instructor email to each class
            for cls in classes:
                cls['instructor_email'] = instructor_emails.get(cls.get('created_by'))

            return classes
    except Exception:
        logger.exception("Error fetching classes | user_id=%s role=%s", user_id, role)
        raise HTTPException(status_code=500, detail="Failed to fetch classes")


def get_class_by_id(class_id: UUID) -> dict:
    """
    Get a specific class by ID
    
    Args:
        class_id: Class unique identifier
        
    Returns:
        Class dictionary
        
    Raises:
        HTTPException: If class not found or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        result = client.table('classes').select('*').eq('id', str(class_id)).execute()
        
        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found")
        
        return result.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching class | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch class")


def join_class_by_code(course_code: str, user_id: str) -> dict:
    """
    Enroll a student in a class using a course code
    
    Args:
        course_code: Course code to join
        user_id: Student's unique identifier
        
    Returns:
        Dictionary with message and class data
        
    Raises:
        HTTPException: If course code is invalid or database error occurs
    """
    try:
        client = service_client if service_client else supabase

        # Find class by course code
        course_code = course_code.strip().upper()
        class_result = client.table('classes').select('*').ilike('course_code', course_code).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Invalid course code")

        class_row = class_result.data[0]

        # Check if already enrolled
        existing = client.table('class_enrollments').select('id').eq('class_id', class_row['id']).eq('user_id', user_id).execute()
        if existing.data and len(existing.data) > 0:
            logger.debug(
                "join_class_by_code: user already enrolled | user_id=%s class_id=%s",
                user_id, class_row['id'],
            )
            return {"message": "Already enrolled", "class": class_row}

        # Create enrollment
        enrollment_data = {
            "class_id": class_row['id'],
            "user_id": user_id
        }
        client.table('class_enrollments').insert(enrollment_data).execute()

        logger.info(
            "Student joined class | user_id=%s class_id=%s course_code=%s",
            user_id, class_row['id'], course_code,
        )
        return {"message": "Joined class successfully", "class": class_row}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error joining class | course_code=%s user_id=%s", course_code, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to join class")


def invite_student_to_class(class_id: UUID, student_email: str, instructor_id: str) -> dict:
    """
    Invite a student to a class
    
    Args:
        class_id: Class unique identifier
        student_email: Email of the student to invite
        instructor_id: ID of the instructor making the invitation
        
    Returns:
        Dictionary with success message
        
    Raises:
        HTTPException: If class not found, student not found, or database error occurs
    """
    try:
        client = service_client if service_client else supabase
        
        # Verify the class exists and belongs to this instructor
        class_result = client.table('classes').select('*').eq('id', str(class_id)).eq('created_by', instructor_id).execute()
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Class not found or you don't have permission")
        
        # Find the student by email (edu_email or primary email)
        student = _find_student_profile_by_email(client, student_email)
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        
        # Verify the user is actually a student
        if student['role'] != 'student':
            raise HTTPException(status_code=400, detail="User is not a student")
        
        # Check if already enrolled
        existing = client.table('class_enrollments').select('*').eq('class_id', str(class_id)).eq('user_id', student['id']).execute()
        if existing.data and len(existing.data) > 0:
            return {"message": "Student already enrolled in this class"}
        
        # Create enrollment
        enrollment_data = {
            "class_id": str(class_id),
            "user_id": student['id']
        }
        client.table('class_enrollments').insert(enrollment_data).execute()
        
        logger.info(
            "Student invited to class | class_id=%s student_email=%s invited_by=%s",
            class_id, student_email, instructor_id,
        )
        return {
            "message": "Student invited successfully",
            "student_email": student_email
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error inviting student | class_id=%s email=%s", class_id, student_email
        )
        raise HTTPException(status_code=500, detail="Failed to invite student")


def get_class_students(class_id: UUID) -> list:
    """
    Get all students enrolled in a class, enriched with their project affiliation.

    Returns a list of dicts with: id, email, role, first_name, last_name,
    project_id, project_name.
    """
    try:
        client = service_client if service_client else supabase

        class_result = client.table('classes').select('id').eq('id', str(class_id)).execute()
        if not class_result.data:
            raise HTTPException(status_code=404, detail="Class not found")

        enrollments = (
            client.table('class_enrollments')
            .select('user_id')
            .eq('class_id', str(class_id))
            .execute()
        )
        if not enrollments.data:
            return []

        user_ids = [e['user_id'] for e in enrollments.data]

        profiles_res = (
            client.table('profiles')
            .select('id, email, role, first_name, last_name')
            .in_('id', user_ids)
            .execute()
        )
        profiles = profiles_res.data or []

        # Fetch all projects in this class for the affiliation lookup.
        projects_res = (
            client.table('projects')
            .select('id, name')
            .eq('class_id', str(class_id))
            .execute()
        )
        projects = projects_res.data or []
        project_ids = [p['id'] for p in projects]
        project_name_map = {p['id']: p['name'] for p in projects}

        membership_map: dict[str, str] = {}
        if project_ids and user_ids:
            members_res = (
                client.table('project_members')
                .select('user_id, project_id')
                .in_('user_id', user_ids)
                .in_('project_id', project_ids)
                .execute()
            )
            for m in (members_res.data or []):
                membership_map[m['user_id']] = m['project_id']

        result = []
        for s in profiles:
            pid = membership_map.get(s['id'])
            result.append({
                'id': s['id'],
                'email': s.get('email'),
                'role': s.get('role', 'student'),
                'first_name': s.get('first_name'),
                'last_name': s.get('last_name'),
                'project_id': pid,
                'project_name': project_name_map.get(pid) if pid else None,
            })

        logger.debug("get_class_students: class=%s count=%d", class_id, len(result))
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching students | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch students")


def get_class_roster(class_id: UUID, user_id: str, role: str) -> dict:
    """
    Return the merged class roster for the UI.

    Combines uploaded roster_entries with enrolled GrepThink students who are
    not on the official roster (classStatus = not_on_roster).
    """
    try:
        client = service_client if service_client else supabase
        cid = str(class_id)

        _verify_roster_access(client, cid, user_id, role)

        roster_res = (
            client.table('roster_entries')
            .select('id, email, status, matched_profile_id, uploaded_at, first_name, last_name')
            .eq('course_id', cid)
            .execute()
        )
        roster_rows = roster_res.data or []
        roster_emails = {(r.get('email') or '').strip().lower() for r in roster_rows}

        enrollments_res = (
            client.table('class_enrollments')
            .select('user_id')
            .eq('class_id', cid)
            .execute()
        )
        enrolled_ids = [e['user_id'] for e in (enrollments_res.data or [])]

        profiles: list[dict] = []
        if enrolled_ids:
            profiles_res = (
                client.table('profiles')
                .select('id, email, edu_email, first_name, last_name, role')
                .in_('id', enrolled_ids)
                .execute()
            )
            profiles = profiles_res.data or []

        profile_by_id = {p['id']: p for p in profiles}
        profile_by_email = _build_profile_email_map(profiles)
        enrolled_id_set = set(enrolled_ids)

        projects_res = (
            client.table('projects')
            .select('id, name')
            .eq('class_id', cid)
            .execute()
        )
        projects = projects_res.data or []
        project_ids = [p['id'] for p in projects]
        project_name_map = {p['id']: p['name'] for p in projects}

        projects_by_user: dict[str, list[str]] = {}
        if project_ids and enrolled_ids:
            members_res = (
                client.table('project_members')
                .select('user_id, project_id')
                .in_('user_id', enrolled_ids)
                .in_('project_id', project_ids)
                .execute()
            )
            for m in (members_res.data or []):
                uid = m['user_id']
                pname = project_name_map.get(m['project_id'])
                if pname:
                    projects_by_user.setdefault(uid, []).append(pname)

        students: list[dict] = []

        for entry in roster_rows:
            email = (entry.get('email') or '').strip().lower()
            profile = profile_by_email.get(email)
            if not profile and entry.get('matched_profile_id'):
                profile = profile_by_id.get(entry['matched_profile_id'])

            profile_id = profile['id'] if profile else None
            is_registered = bool(profile_id and profile_id in enrolled_id_set)
            project_names = projects_by_user.get(profile_id, []) if profile_id else []
            first_name, last_name = _resolve_roster_export_names(profile, entry)
            grepthink_email = (profile.get('email') or '').strip() if profile and is_registered else ''

            students.append({
                'id': profile_id or entry['id'],
                'name': _resolve_roster_display_name(profile, entry, email),
                'email': email,
                'first_name': first_name,
                'last_name': last_name,
                'roster_email': email,
                'grepthink_email': grepthink_email,
                'project': _format_project_export(project_names),
                'class_status': entry.get('status') or 'enrolled',
                'grepthink_status': 'registered' if is_registered else 'not_registered',
                'projects': project_names,
            })

        for profile in profiles:
            edu = (profile.get('edu_email') or '').strip().lower()
            primary = (profile.get('email') or '').strip().lower()
            roster_email = edu or primary
            if not roster_email:
                continue
            if roster_email in roster_emails or primary in roster_emails or edu in roster_emails:
                continue

            uid = profile['id']
            project_names = projects_by_user.get(uid, [])
            first_name, last_name = _resolve_roster_export_names(profile, None)
            students.append({
                'id': uid,
                'name': _resolve_roster_display_name(profile, None, roster_email),
                'email': roster_email,
                'first_name': first_name,
                'last_name': last_name,
                'roster_email': '',
                'grepthink_email': (profile.get('email') or '').strip(),
                'project': _format_project_export(project_names),
                'class_status': 'not_on_roster',
                'grepthink_status': 'registered',
                'projects': project_names,
            })

        uploaded_at = None
        if roster_rows:
            timestamps = [r.get('uploaded_at') for r in roster_rows if r.get('uploaded_at')]
            if timestamps:
                uploaded_at = max(timestamps)

        students.sort(key=lambda s: (s['name'].lower(), s['email']))

        logger.debug("get_class_roster: class=%s count=%d", class_id, len(students))
        return {'students': students, 'uploaded_at': uploaded_at}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching roster | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch roster")


def upload_class_roster(class_id: UUID, csv_text: str, instructor_id: str) -> dict:
    """
    Replace all roster_entries for a class from a UCSC roster CSV.

    Deletes existing rows for course_id, then bulk-inserts parsed entries.
    """
    try:
        client = service_client if service_client else supabase
        cid = str(class_id)

        class_result = (
            client.table('classes')
            .select('id')
            .eq('id', cid)
            .eq('created_by', instructor_id)
            .execute()
        )
        if not class_result.data:
            raise HTTPException(
                status_code=404,
                detail="Class not found or you do not have permission",
            )

        parsed_rows = _parse_roster_csv(csv_text)
        emails = [r['email'] for r in parsed_rows]

        profile_map: dict[str, str] = {}
        for i in range(0, len(emails), _ROSTER_INSERT_BATCH):
            batch = emails[i:i + _ROSTER_INSERT_BATCH]
            profiles_res = (
                client.table('profiles')
                .select('id, email, edu_email')
                .in_('edu_email', batch)
                .execute()
            )
            for p in (profiles_res.data or []):
                edu = (p.get('edu_email') or '').strip().lower()
                if edu:
                    profile_map[edu] = p['id']

            remaining = [e for e in batch if e not in profile_map]
            if remaining:
                email_res = (
                    client.table('profiles')
                    .select('id, email, edu_email')
                    .in_('email', remaining)
                    .execute()
                )
                for p in (email_res.data or []):
                    primary = (p.get('email') or '').strip().lower()
                    if primary and primary not in profile_map:
                        profile_map[primary] = p['id']

        client.table('roster_entries').delete().eq('course_id', cid).execute()

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        insert_rows = []
        matched_count = 0
        for row in parsed_rows:
            email = row['email']
            matched_id = profile_map.get(email)
            if matched_id:
                matched_count += 1
            insert_rows.append({
                'course_id': cid,
                'email': email,
                'status': row['status'],
                'first_name': row.get('first_name') or None,
                'last_name': row.get('last_name') or None,
                'matched_profile_id': matched_id,
                'uploaded_at': now,
            })

        for i in range(0, len(insert_rows), _ROSTER_INSERT_BATCH):
            client.table('roster_entries').insert(
                insert_rows[i:i + _ROSTER_INSERT_BATCH]
            ).execute()

        logger.info(
            "Roster uploaded | class_id=%s rows=%d matched=%d uploaded_by=%s",
            class_id, len(insert_rows), matched_count, instructor_id,
        )
        return {
            'message': 'Roster uploaded successfully',
            'inserted_count': len(insert_rows),
            'matched_count': matched_count,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error uploading roster | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to upload roster")


def remove_student_from_class(class_id: UUID, student_id: str, instructor_id: str) -> dict:
    """
    Remove a student's enrollment from a class (instructor only).

    Cleans up all class-related state for the student:
    - Removes from every project in the class (project_members) and
      decrements each affected project's num_members counter.
    - Cancels all pending project_join_requests for projects in this class.
    - Removes the class_enrollments row.
    """
    try:
        client = service_client if service_client else supabase

        class_result = (
            client.table('classes').select('id')
            .eq('id', str(class_id)).eq('created_by', instructor_id)
            .execute()
        )
        if not class_result.data:
            raise HTTPException(
                status_code=404,
                detail="Class not found or you do not have permission",
            )

        projects_res = (
            client.table('projects').select('id')
            .eq('class_id', str(class_id))
            .execute()
        )
        project_ids = [p['id'] for p in (projects_res.data or [])]

        if project_ids:
            # Find which projects the student is actually a member of so we
            # can decrement their num_members counters accurately.
            existing_memberships = (
                client.table('project_members').select('project_id')
                .eq('user_id', student_id)
                .in_('project_id', project_ids)
                .execute()
            )
            affected_project_ids = [
                m['project_id'] for m in (existing_memberships.data or [])
            ]

            # Remove project memberships.
            client.table('project_members').delete().eq(
                'user_id', student_id
            ).in_('project_id', project_ids).execute()

            # Decrement num_members for each affected project.
            for pid in affected_project_ids:
                proj = (
                    client.table('projects').select('num_members')
                    .eq('id', pid).execute()
                )
                if proj.data:
                    current = proj.data[0].get('num_members') or 0
                    client.table('projects').update(
                        {'num_members': max(0, int(current) - 1)}
                    ).eq('id', pid).execute()

            # Cancel all pending join requests for projects in this class.
            client.table('project_join_requests').delete().eq(
                'user_id', student_id
            ).in_('project_id', project_ids).eq(
                'request_status', 'pending'
            ).execute()

        # Remove class enrollment.
        client.table('class_enrollments').delete().eq(
            'class_id', str(class_id)
        ).eq('user_id', student_id).execute()

        logger.info(
            "Student removed from class | class_id=%s student_id=%s removed_by=%s",
            class_id, student_id, instructor_id,
        )
        return {"message": "Student removed successfully", "student_id": student_id}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error removing student | class_id=%s student_id=%s", class_id, student_id
        )
        raise HTTPException(status_code=500, detail="Failed to remove student")


def bulk_invite_students(class_id: UUID, emails: list[str], instructor_id: str) -> dict:
    """
    Enroll a batch of students by email address (instructor only).

    For each email the possible statuses are:
    - ``enrolled``       – new enrollment created.
    - ``already_enrolled`` – student was already in the class.
    - ``not_found``      – no profile exists with this email.
    - ``not_a_student``  – profile exists but the role is not 'student'.
    - ``error``          – unexpected DB error for this email.
    """
    try:
        client = service_client if service_client else supabase

        class_result = (
            client.table('classes').select('id')
            .eq('id', str(class_id)).eq('created_by', instructor_id)
            .execute()
        )
        if not class_result.data:
            raise HTTPException(
                status_code=404,
                detail="Class not found or you do not have permission",
            )

        # Normalise and deduplicate the submitted list.
        clean_emails = list({e.strip().lower() for e in emails if e.strip()})

        results = []
        for email in clean_emails:
            try:
                profile = _find_student_profile_by_email(client, email)
                if not profile:
                    results.append({'email': email, 'status': 'not_found'})
                    continue

                if profile.get('role') != 'student':
                    results.append({'email': email, 'status': 'not_a_student'})
                    continue

                existing = (
                    client.table('class_enrollments').select('id')
                    .eq('class_id', str(class_id))
                    .eq('user_id', profile['id'])
                    .execute()
                )
                if existing.data:
                    results.append({'email': email, 'status': 'already_enrolled'})
                    continue

                client.table('class_enrollments').insert({
                    'class_id': str(class_id),
                    'user_id': profile['id'],
                }).execute()
                results.append({'email': email, 'status': 'enrolled'})

            except Exception as e:
                logger.warning(
                    "bulk_invite: error for email=%s class=%s err=%s",
                    email, class_id, e,
                )
                results.append({'email': email, 'status': 'error'})

        enrolled_count = sum(1 for r in results if r['status'] == 'enrolled')
        logger.info(
            "bulk_invite_students: class=%s enrolled=%d total=%d",
            class_id, enrolled_count, len(results),
        )
        return {'results': results, 'enrolled_count': enrolled_count}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error in bulk_invite_students | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to bulk invite students")

def get_class_projects(class_id: UUID, user_id: str, role: str) -> list:
    """
    Get all projects for a class.

    Access rules:
    - Instructors who own the class see all projects.
    - Students enrolled in the class see all projects.

    Each project returns:
    - name, team_size, sentiment
    - product_owner_name, product_owner_email
    - scrum_master_name, scrum_master_email (None if no scrum master assigned)

    Performance: this endpoint is hit by the My Projects, Browse Projects,
    and My Project pages on every navigation. The independent reads
    (class metadata, enrollment, projects list) are issued in parallel via
    ``query_pool`` so the user only waits for the *slowest* of the three
    network round-trips instead of their sum. ``sentiment`` is always
    selected (it's a small column and the frontend ignores it for non-
    instructors anyway), which removes a sequential dependency on knowing
    the role before issuing the projects query.
    """
    try:
        client = service_client if service_client else supabase
        cid = str(class_id)

        # Stage 1: fan out the three independent reads.
        class_future = query_pool.submit(
            lambda: client.table('classes')
            .select('id, created_by')
            .eq('id', cid)
            .execute()
        )
        enrollment_future = query_pool.submit(
            lambda: client.table('class_enrollments')
            .select('id')
            .eq('class_id', cid)
            .eq('user_id', user_id)
            .execute()
        )
        projects_future = query_pool.submit(
            lambda: client.table('projects')
            .select('id, name, team_size, sentiment')
            .eq('class_id', cid)
            .order('created_at', desc=True)
            .execute()
        )

        class_result = class_future.result()
        if not class_result.data:
            raise HTTPException(status_code=404, detail='Class not found')

        class_row = class_result.data[0]
        has_access = (
            role == 'instructor' and class_row.get('created_by') == user_id
        )
        if not has_access:
            enrollment_result = enrollment_future.result()
            has_access = bool(enrollment_result.data)

        if not has_access:
            raise HTTPException(
                status_code=403,
                detail='You do not have access to this class projects list',
            )

        projects = projects_future.result().data or []
        if not projects:
            return []

        project_ids = [p['id'] for p in projects]

        # Stage 2: fetch ALL project_members for these projects in one query.
        # Used for both member_count and product-owner / scrum-master hydration.
        all_memberships_result = (
            client.table('project_members')
            .select('project_id, user_id, role')
            .in_('project_id', project_ids)
            .execute()
        )
        all_memberships = all_memberships_result.data or []

        # Count all members per project.
        member_count_map: dict[str, int] = {}
        for m in all_memberships:
            pid = m['project_id']
            member_count_map[pid] = member_count_map.get(pid, 0) + 1

        # Extract only owner/scrum-master user ids for profile hydration.
        key_roles = {'product owner', 'owner', 'scrum master'}
        key_memberships = [m for m in all_memberships if m.get('role') in key_roles]

        # Stage 3: profile hydration for owners / scrum masters only.
        member_user_ids = list({
            m['user_id'] for m in key_memberships if m.get('user_id')
        })
        profile_map: dict[str, dict] = {}
        if member_user_ids:
            profiles_result = (
                client.table('profiles')
                .select('id, email, first_name, last_name')
                .in_('id', member_user_ids)
                .execute()
            )
            for p in profiles_result.data or []:
                profile_map[p['id']] = p

        # Build a lookup: project_id -> {role -> profile}
        project_member_map: dict[str, dict] = {}
        for m in key_memberships:
            pid = m['project_id']
            if pid not in project_member_map:
                project_member_map[pid] = {}
            project_member_map[pid][m['role']] = profile_map.get(m['user_id'], {})

        def _name(profile: dict) -> str | None:
            if not profile:
                return None
            first = profile.get('first_name') or ''
            last = profile.get('last_name') or ''
            full = f"{first} {last}".strip()
            return full or profile.get('email')

        results = []
        for project in projects:
            pid = project['id']
            members = project_member_map.get(pid, {})

            owner_profile = members.get('product owner') or members.get('owner') or {}
            scrum_profile = members.get('scrum master') or {}

            results.append({
                'id': pid,
                'name': project.get('name'),
                'team_size': project.get('team_size'),
                'member_count': member_count_map.get(pid, 0),
                'sentiment': project.get('sentiment') if role == 'instructor' else None,
                'product_owner_name': _name(owner_profile),
                'product_owner_email': owner_profile.get('email'),
                'scrum_master_name': _name(scrum_profile) if scrum_profile else None,
                'scrum_master_email': scrum_profile.get('email') if scrum_profile else None,
            })

        return results
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching class projects | class_id=%s user_id=%s", class_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


def get_class_turn_in_stats(class_id: UUID, user_id: str) -> dict:
    """
    Turn-in stats for the class's current TSR assignment (instructor only).

    A team is fully submitted when every project member has at least one TSR
    row for the assignment (one evaluator_id per member). Partial means some
    but not all members have submitted.
    """
    try:
        client = service_client if service_client else supabase
        cid = str(class_id)
        today = datetime.date.today()

        class_check = (
            client.table('classes')
            .select('id')
            .eq('id', cid)
            .eq('created_by', user_id)
            .execute()
        )
        if not class_check.data:
            raise HTTPException(
                status_code=403,
                detail="Class not found or you do not have permission",
            )

        assignments_result = (
            client.table('assignments')
            .select('id, Title, open_date, close_date, status, assignment_type')
            .eq('class_id', cid)
            .eq('status', 'publish')
            .order('close_date')
            .execute()
        )
        tsr_assignments = [
            a for a in (assignments_result.data or [])
            if a.get('assignment_type') == 'tsr'
        ]

        current: dict | None = None
        for assignment in tsr_assignments:
            open_d = datetime.date.fromisoformat(assignment['open_date'])
            close_d = datetime.date.fromisoformat(assignment['close_date'])
            if open_d <= today <= close_d:
                current = assignment
                break

        if not current and tsr_assignments:
            open_future = [
                a for a in tsr_assignments
                if datetime.date.fromisoformat(a['close_date']) >= today
            ]
            if open_future:
                current = min(
                    open_future,
                    key=lambda a: datetime.date.fromisoformat(a['close_date']),
                )
            else:
                current = max(
                    tsr_assignments,
                    key=lambda a: datetime.date.fromisoformat(a['close_date']),
                )

        empty = {
            'rate': 0,
            'teamsSubmitted': {'count': 0, 'total': 0},
            'partialSubmissions': {'count': 0, 'total': 0},
            'currentAssignment': None,
            'closeDate': None,
        }
        if not current:
            return empty

        assignment_id = current['id']

        projects_result = (
            client.table('projects')
            .select('id')
            .eq('class_id', cid)
            .execute()
        )
        project_ids = [p['id'] for p in (projects_result.data or [])]
        if not project_ids:
            return {
                **empty,
                'currentAssignment': current.get('Title'),
                'closeDate': current.get('close_date'),
            }

        memberships_result = (
            client.table('project_members')
            .select('project_id, user_id')
            .in_('project_id', project_ids)
            .execute()
        )
        team_sizes: dict[str, int] = {}
        for row in memberships_result.data or []:
            pid = row['project_id']
            team_sizes[pid] = team_sizes.get(pid, 0) + 1

        teams = {pid: size for pid, size in team_sizes.items() if size > 0}
        total_teams = len(teams)

        tsr_result = (
            client.table('TSRs')
            .select('project_id, evaluator_id')
            .eq('assignment_id', assignment_id)
            .in_('project_id', list(teams.keys()) if teams else project_ids)
            .execute()
        )
        evaluators_by_project: dict[str, set[str]] = {}
        for row in tsr_result.data or []:
            pid = row.get('project_id')
            eid = row.get('evaluator_id')
            if not pid or not eid:
                continue
            evaluators_by_project.setdefault(pid, set()).add(eid)

        full_count = 0
        partial_count = 0
        for pid, team_size in teams.items():
            submitted = len(evaluators_by_project.get(pid, set()))
            if submitted >= team_size:
                full_count += 1
            elif submitted > 0:
                partial_count += 1

        rate = round((full_count / total_teams) * 100) if total_teams else 0

        return {
            'rate': rate,
            'teamsSubmitted': {'count': full_count, 'total': total_teams},
            'partialSubmissions': {'count': partial_count, 'total': total_teams},
            'currentAssignment': current.get('Title'),
            'closeDate': current.get('close_date'),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching turn-in stats | class_id=%s user_id=%s",
            class_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch turn-in stats")
