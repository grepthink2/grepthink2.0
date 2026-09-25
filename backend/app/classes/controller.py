"""
Class management business logic
"""

import csv
import datetime
import io
import logging
from uuid import UUID

from fastapi import HTTPException

from app.classes.invite_email import send_class_invite_email, send_class_invite_email_or_raise
from app.core import authz
from app.core.db import fan_out, get_client, retry_on_disconnect
from app.institutions.controller import (
    institution_summaries,
    is_known_institution,
    load_institutions,
)
from app.utils.class_banner import upload_class_banner
from app.utils.generators import generate_course_code, normalize_course_code
from app.utils.profiles import profile_display_name

logger = logging.getLogger(__name__)

_ROSTER_INSERT_BATCH = 200


# Default TSR counts per term. Instructors may override at class creation.
_FULL_TERM_NAMES = {"fall", "winter", "spring"}
_SUMMER_TSR_COUNT = 3
_FULL_TSR_COUNT = 5


def normalize_roster_status(raw: str) -> str:
    """Map a UCSC roster Status cell to our classStatus enum value."""
    key = raw.strip().lower()
    if key in ("enrolled", "e"):
        return "enrolled"
    if key in ("waitlisted", "wait list", "waitlist", "waiting"):
        return "waitlisted"
    if key in ("dropped", "drop"):
        return "dropped"
    raise ValueError(f"Unknown roster status: {raw!r}")


def _roster_entry_name(entry: dict | None) -> str | None:
    """Build a display name from roster entry first/last name columns."""
    if not entry:
        return None
    first = (entry.get("first_name") or "").strip()
    last = (entry.get("last_name") or "").strip()
    full = f"{first} {last}".strip()
    return full or None


def _resolve_roster_export_names(
    profile: dict | None,
    roster_entry: dict | None,
) -> tuple[str, str]:
    """First/last for CSV export: roster CSV names, then profile, then empty."""
    if roster_entry:
        first = (roster_entry.get("first_name") or "").strip()
        last = (roster_entry.get("last_name") or "").strip()
        if first or last:
            return first, last
    if profile:
        first = (profile.get("first_name") or "").strip()
        last = (profile.get("last_name") or "").strip()
        if first or last:
            return first, last
    return "", ""


def _format_project_export(project_names: list[str]) -> str:
    return ", ".join(project_names) if project_names else ""


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
        first = (profile.get("first_name") or "").strip()
        last = (profile.get("last_name") or "").strip()
        full = f"{first} {last}".strip()
        if full:
            return full

    roster_name = _roster_entry_name(roster_entry)
    if roster_name:
        return roster_name

    local = email.split("@")[0]
    if not local:
        return email
    return local.replace(".", " ").replace("_", " ").title()


#: Addresses or ids per ``in.(...)`` filter. Keeps every lookup URL short even when
#: an instructor invites a whole roster at once.
_LOOKUP_BATCH = 100
_PROFILE_LOOKUP_COLUMNS = "id, email, edu_email, first_name, last_name"


def _postgrest_value(value: str) -> str:
    """Quote a value for a PostgREST ``or=(...)`` expression when it contains a
    reserved character (the rule postgrest-py applies to ``.in_()`` values),
    escaping quotes and backslashes inside."""
    if any(ch in value for ch in ',:()"\\'):
        escaped = value.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return value


def _find_student_profiles_by_email(client, emails) -> dict[str, dict]:
    """Map each address to its profile, preferring an ``edu_email`` match over ``email``.

    Matching is exact, like the per-address ``.eq`` lookups this replaced: callers
    pass stripped, lower-cased addresses, and a stored address with capitals does
    not match. Addresses without a profile are left out. One round trip per
    ``_LOOKUP_BATCH`` addresses.
    """
    wanted = list(dict.fromkeys(e for e in emails if e))
    by_edu: dict[str, dict] = {}
    by_email: dict[str, dict] = {}
    for start in range(0, len(wanted), _LOOKUP_BATCH):
        values = ",".join(_postgrest_value(e) for e in wanted[start : start + _LOOKUP_BATCH])
        rows = (
            client.table("profiles")
            .select(_PROFILE_LOOKUP_COLUMNS)
            .or_(f"edu_email.in.({values}),email.in.({values})")
            .execute()
        ).data or []
        for profile in rows:
            if profile.get("edu_email"):
                by_edu.setdefault(profile["edu_email"], profile)
            if profile.get("email"):
                by_email.setdefault(profile["email"], profile)
    found = {}
    for address in wanted:
        profile = by_edu.get(address) or by_email.get(address)
        if profile:
            found[address] = profile
    return found


def _find_student_profile_by_email(client, email: str) -> dict | None:
    """Look up a student profile by school email (edu_email) first, then primary email (one read)."""
    normalized = email.strip().lower()
    return _find_student_profiles_by_email(client, [normalized]).get(normalized)


def _require_owner(client, user_id: str, class_id, *, columns: str = authz.CLASS_COLUMNS) -> dict:
    """Return the class row when ``user_id`` created the class.

    One round trip. 404 when the class does not exist, 403 when someone else
    created it.
    """
    return authz.require_class_instructor(client, user_id, class_id, columns=columns)


#: The class row plus its instructor's profile for invite emails, in one read. The
#: foreign-key hint names the relationship so the embed cannot become ambiguous.
_INVITE_CLASS_COLUMNS = (
    "id, name, course_code, created_by, "
    "instructor:profiles!classes_created_by_fkey(id, email, first_name, last_name)"
)


def _invite_email_context(class_row: dict) -> dict:
    """Shared invite-email fields from a class row read with ``_INVITE_CLASS_COLUMNS``."""
    return {
        "class_name": class_row.get("name") or "your class",
        "course_code": class_row.get("course_code") or "",
        "instructor_name": profile_display_name(class_row.get("instructor") or {}),
    }


def _enrolled_user_ids(client, class_id: str, user_ids: list[str]) -> set[str]:
    """The ids in ``user_ids`` that already have an enrollment row (student or TA)."""
    enrolled: set[str] = set()
    for start in range(0, len(user_ids), _LOOKUP_BATCH):
        rows = (
            client.table("class_enrollments")
            .select("user_id")
            .eq("class_id", class_id)
            .in_("user_id", user_ids[start : start + _LOOKUP_BATCH])
            .execute()
        ).data or []
        enrolled.update(str(row["user_id"]) for row in rows)
    return enrolled


def _enroll_students(client, class_id: str, user_ids) -> set[str]:
    """Enroll ``user_ids`` in the class; return the ids this call enrolled.

    One upsert on class_enrollments_class_id_user_id_key (class_id, user_id) that
    ignores existing rows. PostgREST returns only the rows it inserted, so an id
    missing from the result already had an enrollment (as a student or a TA) and
    that row is left as it was. A concurrent enrollment is therefore not an error.
    """
    ids = list(dict.fromkeys(str(uid) for uid in user_ids))
    if not ids:
        return set()
    res = (
        client.table("class_enrollments")
        .upsert(
            [{"class_id": class_id, "user_id": uid} for uid in ids],
            on_conflict="class_id,user_id",
            ignore_duplicates=True,
        )
        .execute()
    )
    return {str(row["user_id"]) for row in (res.data or [])}


def _build_profile_email_map(profiles: list[dict]) -> dict[str, dict]:
    """Map lowercase roster email → profile row (edu_email takes precedence)."""
    email_map: dict[str, dict] = {}
    for profile in profiles:
        primary = (profile.get("email") or "").strip().lower()
        edu = (profile.get("edu_email") or "").strip().lower()
        if edu:
            email_map[edu] = profile
        if primary and primary not in email_map:
            email_map[primary] = profile
    return email_map


def _parse_roster_csv(csv_text: str) -> list[dict]:
    """Parse UCSC roster CSV; returns deduped rows (last row wins per email)."""
    if csv_text.startswith("\ufeff"):
        csv_text = csv_text[1:]

    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    field_map = {h.strip().lower(): h for h in reader.fieldnames if h}
    email_col = field_map.get("email address") or field_map.get("email")
    status_col = field_map.get("status")
    first_name_col = field_map.get("first name")
    last_name_col = field_map.get("last name")
    if not email_col or not status_col:
        raise HTTPException(
            status_code=400,
            detail="CSV must include 'Email Address' and 'Status' columns",
        )

    deduped: dict[str, dict] = {}
    for row_num, row in enumerate(reader, start=2):
        email_raw = (row.get(email_col) or "").strip()
        status_raw = (row.get(status_col) or "").strip()
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
        first_name = (row.get(first_name_col) or "").strip() if first_name_col else ""
        last_name = (row.get(last_name_col) or "").strip() if last_name_col else ""
        deduped[email] = {
            "email": email,
            "status": status,
            "first_name": first_name,
            "last_name": last_name,
        }

    if not deduped:
        raise HTTPException(status_code=400, detail="CSV contains no student rows")

    return list(deduped.values())


def _generate_tsr_assignments(
    client,
    class_id: str,
    term: str,
    start_date: datetime.date,
    tsr_count: int | None = None,
) -> None:
    """
    Auto-create TSR assignments for a new class.

    Assignments open after the first 2 weeks of class (start_date + 14 days)
    and are each one week long, one per sprint week.

    Default counts (overridable via tsr_count):
      Fall / Winter / Spring  →  5 TSR assignments
      Summer                  →  3 TSR assignments
    """
    term_lower = (term or "").strip().lower()
    default_count = _FULL_TSR_COUNT if term_lower in _FULL_TERM_NAMES else _SUMMER_TSR_COUNT
    count = tsr_count if tsr_count is not None else default_count
    count = max(1, min(count, 20))  # safety clamp

    first_open = start_date + datetime.timedelta(days=14)

    assignments = []
    for week in range(1, count + 1):
        anchor = first_open + datetime.timedelta(weeks=week - 1)
        # Snap to the Sunday that starts the anchor's week (US convention: week starts Sunday)
        days_since_sunday = (anchor.weekday() + 1) % 7
        open_date = anchor - datetime.timedelta(days=days_since_sunday)
        close_date = open_date + datetime.timedelta(days=3)  # Wednesday
        assignments.append(
            {
                "Title": f"TSR {week}",
                "open_date": open_date.isoformat(),
                "close_date": close_date.isoformat(),
                "status": "publish",
                "class_id": class_id,
                "assignment_type": "tsr",
            }
        )

    try:
        client.table("assignments").insert(assignments).execute()
        logger.info(
            "Auto-created %d TSR assignments for class %s (term=%r)",
            len(assignments),
            class_id,
            term,
        )
    except Exception:
        # WARN: If TSR auto-creation fails, the class still exists but has no
        # TSR schedule. Tracked as a silent-failure risk.
        logger.warning(
            "Failed to auto-create TSR assignments for class %s (term=%r) — "
            "class was created but TSR schedule is missing",
            class_id,
            term,
            exc_info=True,
        )


_COURSE_CODE_ATTEMPTS = 5


def _pick_course_code(client) -> str | None:
    """A freshly generated course code that no class uses yet, or ``None``.

    Generates ``_COURSE_CODE_ATTEMPTS`` candidates and probes them in one read
    (it used to be one read per attempt). The probe stays case-insensitive: a code
    stored in lower case still blocks the same letters in upper case.
    """
    candidates = list(
        dict.fromkeys(generate_course_code().upper() for _ in range(_COURSE_CODE_ATTEMPTS))
    )
    probe = ",".join(f"course_code.ilike.{_postgrest_value(code)}" for code in candidates)
    rows = client.table("classes").select("course_code").or_(probe).execute().data or []
    taken = {(row.get("course_code") or "").upper() for row in rows}
    return next((code for code in candidates if code not in taken), None)


def create_class(
    name: str,
    description: str | None,
    term: str,
    start_date: datetime.date,
    user_id: str,
    tsr_count: int | None = None,
    institution_id: UUID | str | None = None,
) -> dict:
    """
    Create a new class with a unique course code and auto-generate TSR assignments.

    After the class is created, TSR assignments are automatically generated
    starting after the first 2 weeks of class. tsr_count overrides the
    term-based default (5 for Fall/Winter/Spring, 3 for Summer). ``institution_id`` must name
    an existing institution (400 otherwise); omitted, the class has none.
    """
    try:
        if institution_id is not None and not is_known_institution(institution_id):
            raise HTTPException(status_code=400, detail="Unknown institution")

        client = get_client()

        year = start_date.year

        course_code = _pick_course_code(client)

        if not course_code:
            raise HTTPException(status_code=500, detail="Failed to generate unique course code")

        class_data: dict = {
            "name": name,
            "created_by": user_id,
            "course_code": course_code,
            "year": year,
            "term": term,
            "start_date": start_date.isoformat(),
            "status": "active",
        }
        if description is not None:
            class_data["description"] = description
        if institution_id is not None:
            class_data["institution_id"] = str(institution_id)

        result = client.table("classes").insert(class_data).execute()
        new_class = result.data[0]
        class_id = new_class["id"]

        image_url = upload_class_banner(client, str(class_id))
        if image_url:
            update_result = (
                client.table("classes")
                .update({"image_url": image_url})
                .eq("id", class_id)
                .execute()
            )
            if update_result.data:
                new_class = update_result.data[0]

        logger.info(
            "Class created | class_id=%s name=%r course_code=%s term=%r created_by=%s",
            class_id,
            name,
            course_code,
            term,
            user_id,
        )

        # Auto-generate TSR assignments for this class
        _generate_tsr_assignments(client, class_id, term, start_date, tsr_count)

        return new_class
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error creating class | name=%r user_id=%s", name, user_id)
        raise HTTPException(status_code=500, detail="Failed to create class")


def _enrollment_counts_by_class(client, class_ids: list) -> dict[str, int]:
    """Count enrolled students per class_id (empty list → empty dict).

    TAs (``enrollment_role == 'ta'``) are overseers, not part of the student
    population, so they're excluded from the count surfaced as ``enrolled_count``.
    """
    if not class_ids:
        return {}
    enrollments = (
        client.table("class_enrollments")
        .select("class_id, enrollment_role")
        .in_("class_id", class_ids)
        .execute()
    )
    counts: dict[str, int] = {}
    for row in enrollments.data or []:
        if (row.get("enrollment_role") or "student") == "ta":
            continue
        cid = row["class_id"]
        counts[cid] = counts.get(cid, 0) + 1
    return counts


def _attach_enrolled_counts(classes: list[dict], count_by_class: dict[str, int]) -> None:
    for cls in classes:
        cls["enrolled_count"] = count_by_class.get(cls["id"], 0)


#: The class columns an enrolled student or TA may see (no review Zoom room, no settings).
_ENROLLED_CLASS_COLUMNS = (
    "id, name, description, created_by, created_at, course_code, status, term, start_date, "
    "year, image_url"
)


def get_classes_for_user(user_id: str) -> list:
    """Every class the user created or is enrolled in, each with ``my_role``.

    ``my_role`` is ``'instructor'`` for a class the user created, else the enrollment role
    (``'ta'``, or ``'student'`` for anything else). A class the user both created and is
    enrolled in is listed once, as taught. Created classes come first with the full row;
    enrolled ones carry the columns students may see plus ``teacher_email``. Every class carries
    ``enrolled_count`` (students, not TAs) and ``institution`` (``{id, name, slug}`` or ``None``).

    Round trips: the created and the enrolled classes in one concurrent wave, then the
    enrollment counts. Institutions come from their in-process cache; before the institutions
    migration is applied (``load_institutions() is None``) ``institution_id`` is not selected.
    """
    try:
        client = get_client()
        institutions = load_institutions()
        enrolled_columns = _ENROLLED_CLASS_COLUMNS
        if institutions is not None:
            enrolled_columns += ", institution_id"
        reads = fan_out(
            {
                "owned": lambda: (
                    (client.table("classes").select("*").eq("created_by", user_id).execute()).data
                    or []
                ),
                "enrolled": lambda: (
                    (
                        client.table("class_enrollments")
                        .select(
                            f"enrollment_role, classes({enrolled_columns}, "
                            "instructor:profiles!classes_created_by_fkey(email))"
                        )
                        .eq("user_id", user_id)
                        .execute()
                    ).data
                    or []
                ),
            }
        )

        classes: list[dict] = []
        seen: set[str] = set()
        for cls in reads["owned"]:
            cls["my_role"] = authz.ROLE_INSTRUCTOR
            classes.append(cls)
            seen.add(str(cls["id"]))
        for row in reads["enrolled"]:
            cls = row.get("classes")
            if not cls or str(cls["id"]) in seen:
                continue
            instructor = cls.pop("instructor", None) or {}
            cls["teacher_email"] = instructor.get("email")
            cls["my_role"] = (
                authz.ROLE_TA if row.get("enrollment_role") == authz.ROLE_TA else authz.ROLE_STUDENT
            )
            classes.append(cls)
            seen.add(str(cls["id"]))
        if not classes:
            return []

        summaries = institution_summaries(institutions)
        for cls in classes:
            institution_id = cls.get("institution_id")
            cls["institution"] = summaries.get(str(institution_id)) if institution_id else None

        _attach_enrolled_counts(
            classes, _enrollment_counts_by_class(client, [c["id"] for c in classes])
        )
        return classes
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching classes | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to fetch classes")


def update_class_status(class_id: UUID, status: str, instructor_id: str) -> dict:
    """
    Update a class lifecycle status. Only the class instructor may change status.
    """
    if status not in {"active", "complete"}:
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'complete'")

    try:
        client = get_client()
        cid = str(class_id)

        _require_owner(client, instructor_id, cid)

        update_result = client.table("classes").update({"status": status}).eq("id", cid).execute()
        if not update_result.data:
            raise HTTPException(status_code=500, detail="Failed to update class status")

        updated = update_result.data[0]
        logger.info(
            "Class status updated | class_id=%s status=%s updated_by=%s",
            class_id,
            status,
            instructor_id,
        )
        return updated
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error updating class status | class_id=%s status=%s",
            class_id,
            status,
        )
        raise HTTPException(status_code=500, detail="Failed to update class status")


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
        client = get_client()
        result = client.table("classes").select("*").eq("id", str(class_id)).execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)

        return result.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching class | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch class")


def join_class_by_code(course_code: str, user_id: str) -> dict:
    """
    Enroll the caller in a class using its course code (anyone but its instructor)

    Args:
        course_code: Course code to join
        user_id: the caller's user id

    Returns:
        Dictionary with message and class data

    Raises:
        HTTPException: If course code is invalid or database error occurs
    """
    try:
        # Exact match on a validated code. This used to be an ``ilike``, which made ``%``
        # (or ``Q%``) a valid "code" that joined whichever class PostgREST listed first.
        code = normalize_course_code(course_code)
        if code is None:
            raise HTTPException(status_code=404, detail="Invalid course code")
        course_code = code

        client = get_client()
        # The columns an enrolled student or TA may see: the instructor-only ones
        # (review_zoom_url, review_period_open, can_students_make_project, ...) never reach the
        # joiner, on this call or by re-posting the same code once already enrolled.
        class_result = (
            client.table("classes")
            .select(_ENROLLED_CLASS_COLUMNS)
            .eq("course_code", course_code)
            .execute()
        )
        if not class_result.data or len(class_result.data) == 0:
            raise HTTPException(status_code=404, detail="Invalid course code")

        class_row = class_result.data[0]

        if str(class_row.get("created_by")) == str(user_id):
            raise HTTPException(status_code=409, detail="You are the instructor of this class")

        # Check if already enrolled
        existing = (
            client.table("class_enrollments")
            .select("id")
            .eq("class_id", class_row["id"])
            .eq("user_id", user_id)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            logger.debug(
                "join_class_by_code: user already enrolled | user_id=%s class_id=%s",
                user_id,
                class_row["id"],
            )
            return {"message": "Already enrolled", "class": class_row}

        # Create enrollment
        enrollment_data = {"class_id": class_row["id"], "user_id": user_id}
        client.table("class_enrollments").insert(enrollment_data).execute()

        logger.info(
            "User joined class | user_id=%s class_id=%s course_code=%s",
            user_id,
            class_row["id"],
            course_code,
        )
        return {"message": "Joined class successfully", "class": class_row}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error joining class | course_code=%s user_id=%s", course_code, user_id)
        raise HTTPException(status_code=500, detail="Failed to join class")


def invite_student_to_class(class_id: UUID, student_email: str, instructor_id: str) -> dict:
    """
    Invite a student to a class by email.

    If the student already has a GrepThink account, enroll them and send a
    notification email. If they are on the roster but not registered yet, send
    a signup invitation with the class access code instead of returning 404.
    Any account can be enrolled, whatever its role (an account that teaches
    elsewhere can be enrolled here, and made a TA later), except the class
    instructor's own: 409, the answer ``join_class_by_code`` gives them too. That
    includes an account that has not picked a role yet, which joining by code
    refuses: here the instructor named the address, and the app sends such a user
    to /select before they can use anything.

    Round trips: the class with its instructor's profile, the profile lookup, and
    one enrollment upsert (was 6).
    """
    try:
        client = get_client()
        cid = str(class_id)
        normalized_email = student_email.strip().lower()

        class_row = _require_owner(client, instructor_id, cid, columns=_INVITE_CLASS_COLUMNS)
        email_ctx = _invite_email_context(class_row)

        student = _find_student_profile_by_email(client, normalized_email)
        if not student:
            send_class_invite_email_or_raise(
                to=normalized_email,
                registered=False,
                **email_ctx,
            )
            logger.info(
                "Signup invite email sent | class_id=%s student_email=%s invited_by=%s",
                class_id,
                normalized_email,
                instructor_id,
            )
            return {
                "message": "Invitation email sent",
                "student_email": normalized_email,
            }

        if str(student["id"]) == str(class_row.get("created_by")):
            raise HTTPException(status_code=409, detail="You are the instructor of this class")

        already_enrolled = str(student["id"]) not in _enroll_students(client, cid, [student["id"]])

        delivery_email = (student.get("email") or normalized_email).strip().lower()
        try:
            send_class_invite_email(
                to=delivery_email,
                registered=True,
                **email_ctx,
            )
        except Exception:
            logger.exception(
                "Enrollment succeeded but invite email failed | class_id=%s email=%s",
                class_id,
                delivery_email,
            )
            if not already_enrolled:
                return {
                    "message": "Student enrolled, but the notification email could not be sent",
                    "student_email": normalized_email,
                }
            raise HTTPException(status_code=502, detail="Failed to send invitation email")

        logger.info(
            "Student invited to class | class_id=%s student_email=%s invited_by=%s enrolled=%s",
            class_id,
            normalized_email,
            instructor_id,
            not already_enrolled,
        )
        if already_enrolled:
            return {
                "message": "Student already enrolled; invitation email resent",
                "student_email": normalized_email,
            }
        return {"message": "Student invited successfully", "student_email": normalized_email}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error inviting student | class_id=%s email=%s", class_id, student_email)
        raise HTTPException(status_code=500, detail="Failed to invite student")


# -------------------------------------------------------------- class reads
#
# Students, roster, projects and the projects overview are readable by the class
# instructor and by enrolled students / TAs. Each runs the access check alongside
# its data reads in one ``fan_out`` wave; profiles and project members arrive
# embedded in the enrollment and project rows.

_STUDENT_PROFILE_COLUMNS = "id, email, role, first_name, last_name"
_ROSTER_PROFILE_COLUMNS = "id, email, edu_email, first_name, last_name, role"
_ROSTER_ENTRY_COLUMNS = (
    "id, email, status, matched_profile_id, uploaded_at, first_name, last_name, is_manual"
)


def _require_member(client, user_id: str, class_id: str) -> dict:
    """Pass the class instructor and enrolled students / TAs.

    404 for a missing class, 403 for anyone else. One read for the instructor,
    two for everyone else.
    """
    return authz.require_class_access(client, user_id, class_id)


def _enrollments_with_profiles(
    client, class_id: str, profile_columns: str, columns: str = "user_id, enrollment_role"
) -> list[dict]:
    """The class's enrollment rows, each with the user's profile under ``profile``.

    One round trip. ``class_enrollments_user_id_fkey`` is the only foreign key from
    class_enrollments to profiles; naming it keeps the embed unambiguous.
    """
    return (
        client.table("class_enrollments")
        .select(f"{columns}, profile:profiles!class_enrollments_user_id_fkey({profile_columns})")
        .eq("class_id", class_id)
        .execute()
    ).data or []


def _projects_with_member_ids(client, class_id: str) -> list[dict]:
    """``id, name`` of every project in the class with ``project_members(user_id)``."""
    return (
        client.table("projects")
        .select("id, name, project_members(user_id)")
        .eq("class_id", class_id)
        .execute()
    ).data or []


def _enrolled_profiles(enrollments: list[dict]) -> list[dict]:
    return [e["profile"] for e in enrollments if e.get("profile")]


def _student_rows(enrollments: list[dict], projects: list[dict]) -> list[dict]:
    """One ``get_class_students`` row per enrolled user that has a profile."""
    project_names = {p["id"]: p.get("name") for p in projects}
    project_by_user = {
        m["user_id"]: p["id"]
        for p in projects
        for m in (p.get("project_members") or [])
        if m.get("user_id")
    }
    rows = []
    for enrollment in enrollments:
        profile = enrollment.get("profile")
        if not profile:
            continue
        pid = project_by_user.get(profile["id"])
        rows.append(
            {
                "id": profile["id"],
                "email": profile.get("email"),
                "role": profile.get("role", "student"),
                "enrollment_role": enrollment.get("enrollment_role") or "student",
                "first_name": profile.get("first_name"),
                "last_name": profile.get("last_name"),
                "project_id": pid,
                "project_name": project_names.get(pid) if pid else None,
            }
        )
    return rows


def _roster_payload(roster_rows: list[dict], enrollments: list[dict], projects: list[dict]) -> dict:
    """Merge roster rows with enrolled users into ``get_class_roster``'s payload.

    ``enrollments`` come from :func:`_enrollments_with_profiles` with
    ``_ROSTER_PROFILE_COLUMNS``; ``projects`` from :func:`_projects_with_member_ids`
    (pass ``[]`` when project names are not needed). No database access, so the
    attention summary counts exactly what the roster page shows.
    """
    enrollment_role_by_user = {
        e["user_id"]: (e.get("enrollment_role") or "student") for e in enrollments
    }
    profiles = _enrolled_profiles(enrollments)
    profile_by_id = {p["id"]: p for p in profiles}
    profile_by_email = _build_profile_email_map(profiles)
    roster_emails = {(r.get("email") or "").strip().lower() for r in roster_rows}

    projects_by_user: dict[str, list[str]] = {}
    for project in projects:
        pname = project.get("name")
        if not pname:
            continue
        for member in project.get("project_members") or []:
            if member.get("user_id") in enrollment_role_by_user:
                projects_by_user.setdefault(member["user_id"], []).append(pname)

    students: list[dict] = []

    for entry in roster_rows:
        email = (entry.get("email") or "").strip().lower()
        profile = profile_by_email.get(email)
        if not profile and entry.get("matched_profile_id"):
            profile = profile_by_id.get(entry["matched_profile_id"])

        profile_id = profile["id"] if profile else None
        is_registered = bool(profile_id and profile_id in enrollment_role_by_user)
        project_names = projects_by_user.get(profile_id, []) if profile_id else []
        first_name, last_name = _resolve_roster_export_names(profile, entry)
        grepthink_email = (profile.get("email") or "").strip() if profile and is_registered else ""

        students.append(
            {
                "id": profile_id or entry["id"],
                "name": _resolve_roster_display_name(profile, entry, email),
                "email": email,
                "first_name": first_name,
                "last_name": last_name,
                "roster_email": email,
                "grepthink_email": grepthink_email,
                "project": _format_project_export(project_names),
                "class_status": entry.get("status") or "enrolled",
                "grepthink_status": "registered" if is_registered else "not_registered",
                "enrollment_role": enrollment_role_by_user.get(profile_id, "student")
                if is_registered
                else "student",
                "projects": project_names,
                # Manual rows can be deleted directly by roster_entries.id
                # regardless of whether the row's id above resolved to a
                # matched profile.
                "roster_entry_id": entry["id"] if entry.get("is_manual") else None,
            }
        )

    for profile in profiles:
        edu = (profile.get("edu_email") or "").strip().lower()
        primary = (profile.get("email") or "").strip().lower()
        roster_email = edu or primary
        if not roster_email:
            continue
        if roster_email in roster_emails or primary in roster_emails or edu in roster_emails:
            continue

        uid = profile["id"]
        project_names = projects_by_user.get(uid, [])
        first_name, last_name = _resolve_roster_export_names(profile, None)
        students.append(
            {
                "id": uid,
                "name": _resolve_roster_display_name(profile, None, roster_email),
                "email": roster_email,
                "first_name": first_name,
                "last_name": last_name,
                "roster_email": "",
                "grepthink_email": (profile.get("email") or "").strip(),
                "project": _format_project_export(project_names),
                "class_status": "not_on_roster",
                "grepthink_status": "registered",
                "enrollment_role": enrollment_role_by_user.get(uid, "student"),
                "projects": project_names,
                "roster_entry_id": None,
            }
        )

    timestamps = [r.get("uploaded_at") for r in roster_rows if r.get("uploaded_at")]
    uploaded_at = max(timestamps) if timestamps else None

    students.sort(key=lambda s: (s["name"].lower(), s["email"]))
    return {"students": students, "uploaded_at": uploaded_at}


def get_class_students(class_id: UUID, user_id: str) -> list:
    """
    Get all students enrolled in a class, enriched with their project affiliation.

    Readable by the class instructor and enrolled students / TAs, the same rule
    as ``get_class_roster``.

    Returns a list of dicts with: id, email, role, enrollment_role, first_name,
    last_name, project_id, project_name.

    Round trips: the access check (1 for the instructor, 2 for a member), the
    enrollments with profiles, and the projects with member ids, all in one
    concurrent wave (was 5 in 2 waves).
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "access": lambda: _require_member(client, user_id, cid),
                "enrollments": lambda: _enrollments_with_profiles(
                    client, cid, _STUDENT_PROFILE_COLUMNS
                ),
                "projects": lambda: _projects_with_member_ids(client, cid),
            }
        )
        result = _student_rows(reads["enrollments"], reads["projects"])
        logger.debug("get_class_students: class=%s count=%d", class_id, len(result))
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching students | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch students")


def get_class_roster(class_id: UUID, user_id: str) -> dict:
    """
    Return the merged class roster for the UI.

    Combines uploaded roster_entries with enrolled GrepThink students who are
    not on the official roster (classStatus = not_on_roster). Readable by the
    class instructor and enrolled students / TAs.

    Round trips: the access check (1 for the instructor, 2 for a member), the
    enrollments with profiles, the roster rows, and the projects with member ids,
    all in one concurrent wave (was 6 in 2 waves).
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "access": lambda: _require_member(client, user_id, cid),
                "enrollments": lambda: _enrollments_with_profiles(
                    client, cid, _ROSTER_PROFILE_COLUMNS
                ),
                "roster": lambda: (
                    (
                        client.table("roster_entries")
                        .select(_ROSTER_ENTRY_COLUMNS)
                        .eq("course_id", cid)
                        .execute()
                    ).data
                    or []
                ),
                "projects": lambda: _projects_with_member_ids(client, cid),
            }
        )
        payload = _roster_payload(reads["roster"], reads["enrollments"], reads["projects"])
        logger.debug("get_class_roster: class=%s count=%d", class_id, len(payload["students"]))
        return payload
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching roster | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch roster")


def _not_on_roster_count(students: list[dict]) -> int:
    """Roster rows the instructor home page flags: registered on GrepThink, not a TA,
    and not on the official roster (the frontend's ``summarizeRoster().notOnRoster``)."""
    return sum(
        1
        for s in students
        if s["enrollment_role"] != "ta"
        and s["grepthink_status"] == "registered"
        and s["class_status"] == "not_on_roster"
    )


@retry_on_disconnect()
def get_attention_summary(user_id: str) -> dict:
    """Roster alerts for every class the caller created, for the instructor home page.

    Returns ``{"classes": [{"class_id", "roster_uploaded_at", "not_on_roster"}]}``.
    ``roster_uploaded_at`` is what ``get_class_roster`` returns as ``uploaded_at``
    (``None`` before any upload) and ``not_on_roster`` counts that roster's rows
    for registered students, not TAs, who are not on the official roster. Every
    class status is included; the page shows the active ones. A caller who created
    no classes gets an empty list.

    One query however many classes: the caller's classes with their enrollments
    (profiles embedded) and roster rows embedded, merged by the same
    ``_roster_payload`` the roster page uses. The home page used to request the
    full roster of every class.
    """
    try:
        client = get_client()
        rows = (
            client.table("classes")
            .select(
                "id, "
                "class_enrollments(user_id, enrollment_role, "
                f"profile:profiles!class_enrollments_user_id_fkey({_ROSTER_PROFILE_COLUMNS})), "
                f"roster_entries({_ROSTER_ENTRY_COLUMNS})"
            )
            .eq("created_by", user_id)
            .execute()
        ).data or []

        summary = []
        for cls in rows:
            roster = _roster_payload(
                cls.get("roster_entries") or [], cls.get("class_enrollments") or [], []
            )
            summary.append(
                {
                    "class_id": cls["id"],
                    "roster_uploaded_at": roster["uploaded_at"],
                    "not_on_roster": _not_on_roster_count(roster["students"]),
                }
            )
        return {"classes": summary}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching attention summary | user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Failed to fetch attention summary")


def get_class_roster_timeline(class_id: UUID, instructor_id: str) -> dict:
    """Enrollment, team-join, and drop timestamps for roster students (instructor only).

    - ``enrolled_at``: from ``class_enrollments.enrolled_at`` when the student joined
      the course on GrepThink.
    - ``team_joined_at`` / ``project_name``: earliest ``project_members.created_at``
      in this class (if the student joined a team).
    - ``dropped_at``: ``roster_entries.uploaded_at`` when the roster row status is
      ``dropped`` (reflects when the roster was updated to mark them dropped).

    Round trips: the class, the enrollments with profiles, the roster rows and the
    projects with their members, all in one concurrent wave (was 6 sequential).
    """
    try:
        client = get_client()
        cid = str(class_id)

        reads = fan_out(
            {
                "class": lambda: _require_owner(client, instructor_id, cid),
                "enrollments": lambda: _enrollments_with_profiles(
                    client,
                    cid,
                    "id, email, edu_email, first_name, last_name",
                    columns="user_id, enrolled_at, enrollment_role",
                ),
                "roster": lambda: (
                    (
                        client.table("roster_entries")
                        .select(
                            "email, status, matched_profile_id, uploaded_at, first_name, last_name"
                        )
                        .eq("course_id", cid)
                        .execute()
                    ).data
                    or []
                ),
                "projects": lambda: (
                    (
                        client.table("projects")
                        .select("id, name, project_members(user_id, created_at)")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        enrollments = reads["enrollments"]
        roster_rows = reads["roster"]
        enrollment_by_user = {str(e["user_id"]): e for e in enrollments}
        profiles = _enrolled_profiles(enrollments)
        profile_by_id = {p["id"]: p for p in profiles}
        profile_by_email = _build_profile_email_map(profiles)

        # Earliest team join per enrolled student across the class's projects.
        team_join_by_user: dict[str, dict] = {}
        for project in reads["projects"]:
            for member in project.get("project_members") or []:
                uid = str(member.get("user_id"))
                ts = member.get("created_at")
                if not ts or uid not in enrollment_by_user:
                    continue
                prev = team_join_by_user.get(uid)
                if not prev or str(ts) < str(prev["joined_at"]):
                    team_join_by_user[uid] = {
                        "joined_at": ts,
                        "project_name": project.get("name"),
                    }

        roster_emails = {(r.get("email") or "").strip().lower() for r in roster_rows}
        seen_keys: set[str] = set()
        rows: list[dict] = []

        for entry in roster_rows:
            email = (entry.get("email") or "").strip().lower()
            profile = profile_by_email.get(email)
            if not profile and entry.get("matched_profile_id"):
                profile = profile_by_id.get(entry["matched_profile_id"])
            profile_id = str(profile["id"]) if profile else None
            status = entry.get("status") or "enrolled"
            enrollment = enrollment_by_user.get(profile_id) if profile_id else None
            team = team_join_by_user.get(profile_id) if profile_id else None
            row_key = profile_id or email
            seen_keys.add(row_key)
            rows.append(
                {
                    "id": row_key,
                    "name": _resolve_roster_display_name(profile, entry, email),
                    "email": email,
                    "class_status": status,
                    "enrolled_at": enrollment.get("enrolled_at") if enrollment else None,
                    "team_joined_at": team["joined_at"] if team else None,
                    "project_name": team.get("project_name") if team else None,
                    "dropped_at": entry.get("uploaded_at") if status == "dropped" else None,
                }
            )

        for profile in profiles:
            uid = str(profile["id"])
            if uid in seen_keys:
                continue
            edu = (profile.get("edu_email") or "").strip().lower()
            primary = (profile.get("email") or "").strip().lower()
            roster_email = edu or primary
            if roster_email in roster_emails or primary in roster_emails or edu in roster_emails:
                continue
            enrollment = enrollment_by_user[uid]
            team = team_join_by_user.get(uid)
            rows.append(
                {
                    "id": uid,
                    "name": _resolve_roster_display_name(profile, None, roster_email),
                    "email": roster_email,
                    "class_status": "not_on_roster",
                    "enrolled_at": enrollment.get("enrolled_at"),
                    "team_joined_at": team["joined_at"] if team else None,
                    "project_name": team.get("project_name") if team else None,
                    "dropped_at": None,
                }
            )

        rows.sort(key=lambda r: (r["name"].lower(), r["email"]))
        return {"students": rows}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching roster timeline | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch roster timeline")


def _remove_dropped_roster_students_from_teams(client, class_id: str) -> int:
    """Remove registered students marked dropped on the roster from class teams.

    Called after a roster CSV upload. Any matched GrepThink profile whose roster
    row is ``dropped`` is removed from every project in the class. The teammates
    who stay on each team get one in-app notification per student who left it;
    students leaving the same team are not notified about each other.

    Round trips, however many students leave: the dropped roster rows and the
    class's projects with their member ids (concurrently), one membership delete,
    a recount (one read plus one update per affected project), one notification
    insert and one join-request delete. It used to be about 6 per removal.
    """
    from app.notifications.controller import _insert_notifications
    from app.projects.controller import recount_num_members

    cid = str(class_id)
    reads = fan_out(
        {
            "dropped": lambda: (
                (
                    client.table("roster_entries")
                    .select("matched_profile_id, email, first_name, last_name")
                    .eq("course_id", cid)
                    .eq("status", "dropped")
                    .execute()
                ).data
                or []
            ),
            "projects": lambda: (
                (
                    client.table("projects")
                    .select("id, name, project_members(user_id)")
                    .eq("class_id", cid)
                    .execute()
                ).data
                or []
            ),
        }
    )
    dropped_by_user = {
        str(row["matched_profile_id"]): row
        for row in reads["dropped"]
        if row.get("matched_profile_id")
    }
    projects = reads["projects"]
    if not dropped_by_user or not projects:
        return 0

    project_ids = [p["id"] for p in projects]
    members_by_project = {
        str(p["id"]): [
            str(m["user_id"]) for m in (p.get("project_members") or []) if m.get("user_id")
        ]
        for p in projects
    }
    on_teams = {
        uid for uids in members_by_project.values() for uid in uids if uid in dropped_by_user
    }
    if not on_teams:
        return 0

    removed = (
        client.table("project_members")
        .delete()
        .in_("user_id", sorted(on_teams))
        .in_("project_id", project_ids)
        .execute()
    ).data or []
    leavers_by_project: dict[str, set[str]] = {}
    for row in removed:
        leavers_by_project.setdefault(str(row["project_id"]), set()).add(str(row["user_id"]))
    if leavers_by_project:
        recount_num_members(client, list(leavers_by_project))

    project_names = {str(p["id"]): (p.get("name") or "Unknown project") for p in projects}
    notifications = []
    for pid, leavers in leavers_by_project.items():
        staying = [uid for uid in members_by_project.get(pid, []) if uid not in leavers]
        for uid in sorted(leavers):
            row = dropped_by_user.get(uid, {})
            display_name = _roster_entry_name(row) or row.get("email") or "A student"
            body = (
                f"{display_name} has dropped the course and was removed from "
                f'"{project_names.get(pid, "Unknown project")}".'
            )
            notifications.extend(
                {
                    "user_id": recipient,
                    "type": "member_removed",
                    "title": "Team member removed",
                    "body": body,
                    "entity_type": "project",
                    "entity_id": pid,
                }
                for recipient in staying
            )
    _insert_notifications(notifications)

    client.table("project_join_requests").delete().in_(
        "user_id",
        list(dropped_by_user.keys()),
    ).in_("project_id", project_ids).eq("request_status", "pending").execute()

    if removed:
        logger.info(
            "Removed dropped roster students from teams | class_id=%s count=%d",
            cid,
            len(removed),
        )
    return len(removed)


def upload_class_roster(class_id: UUID, csv_text: str, instructor_id: str) -> dict:
    """
    Replace all roster_entries for a class from a UCSC roster CSV.

    Deletes existing rows for course_id, then bulk-inserts parsed entries.
    """
    try:
        client = get_client()
        cid = str(class_id)

        _require_owner(client, instructor_id, cid)

        parsed_rows = _parse_roster_csv(csv_text)
        emails = [r["email"] for r in parsed_rows]

        profile_map: dict[str, str] = {}
        for i in range(0, len(emails), _ROSTER_INSERT_BATCH):
            batch = emails[i : i + _ROSTER_INSERT_BATCH]
            profiles_res = (
                client.table("profiles")
                .select("id, email, edu_email")
                .in_("edu_email", batch)
                .execute()
            )
            for p in profiles_res.data or []:
                edu = (p.get("edu_email") or "").strip().lower()
                if edu:
                    profile_map[edu] = p["id"]

            remaining = [e for e in batch if e not in profile_map]
            if remaining:
                email_res = (
                    client.table("profiles")
                    .select("id, email, edu_email")
                    .in_("email", remaining)
                    .execute()
                )
                for p in email_res.data or []:
                    primary = (p.get("email") or "").strip().lower()
                    if primary and primary not in profile_map:
                        profile_map[primary] = p["id"]

        # Manually-added rows (is_manual = true) are never touched by a
        # roster re-upload — only rows sourced from a previous CSV are replaced.
        client.table("roster_entries").delete().eq("course_id", cid).eq(
            "is_manual", False
        ).execute()

        now = datetime.datetime.now(datetime.UTC).isoformat()
        insert_rows = []
        matched_count = 0
        for row in parsed_rows:
            email = row["email"]
            matched_id = profile_map.get(email)
            if matched_id:
                matched_count += 1
            insert_rows.append(
                {
                    "course_id": cid,
                    "email": email,
                    "status": row["status"],
                    "first_name": row.get("first_name") or None,
                    "last_name": row.get("last_name") or None,
                    "matched_profile_id": matched_id,
                    "uploaded_at": now,
                }
            )

        for i in range(0, len(insert_rows), _ROSTER_INSERT_BATCH):
            client.table("roster_entries").insert(
                insert_rows[i : i + _ROSTER_INSERT_BATCH]
            ).execute()

        logger.info(
            "Roster uploaded | class_id=%s rows=%d matched=%d uploaded_by=%s",
            class_id,
            len(insert_rows),
            matched_count,
            instructor_id,
        )

        from app.notifications.controller import dismiss_roster_upload_notification

        dismiss_roster_upload_notification(instructor_id, cid)

        removed_from_teams = _remove_dropped_roster_students_from_teams(client, cid)

        return {
            "message": "Roster uploaded successfully",
            "inserted_count": len(insert_rows),
            "matched_count": matched_count,
            "removed_from_teams": removed_from_teams,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error uploading roster | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to upload roster")


def add_manual_roster_student(
    class_id: UUID,
    first_name: str,
    last_name: str,
    email: str,
    instructor_id: str,
) -> dict:
    """
    Manually add a student to the class roster (instructor only).

    Manual rows are flagged with ``is_manual = true`` so a later CSV roster
    upload — which replaces non-manual rows — never deletes them. Class
    status for these rows is surfaced to the UI as ``manual``.
    """
    try:
        client = get_client()
        cid = str(class_id)

        first_name = first_name.strip()
        last_name = last_name.strip()
        normalized_email = email.strip().lower()

        if not first_name or not last_name:
            raise HTTPException(status_code=400, detail="First and last name are required")
        if not normalized_email or "@" not in normalized_email:
            raise HTTPException(status_code=400, detail="A valid email is required")

        _require_owner(client, instructor_id, cid)

        existing = (
            client.table("roster_entries")
            .select("id")
            .eq("course_id", cid)
            .eq("email", normalized_email)
            .execute()
        )
        if existing.data:
            raise HTTPException(status_code=409, detail="This student is already on the roster")

        matched_profile = _find_student_profile_by_email(client, normalized_email)
        matched_id = matched_profile["id"] if matched_profile else None

        now = datetime.datetime.now(datetime.UTC).isoformat()
        insert_row = {
            "course_id": cid,
            "email": normalized_email,
            "status": "manual",
            "first_name": first_name,
            "last_name": last_name,
            "matched_profile_id": matched_id,
            "uploaded_at": now,
            "is_manual": True,
        }
        result = client.table("roster_entries").insert(insert_row).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to add student to roster")

        logger.info(
            "Manual roster student added | class_id=%s email=%s added_by=%s",
            class_id,
            normalized_email,
            instructor_id,
        )
        return {
            "message": "Student added to roster",
            "entry": result.data[0],
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error adding manual roster student | class_id=%s email=%s", class_id, email
        )
        raise HTTPException(status_code=500, detail="Failed to add student to roster")


def delete_manual_roster_entry(class_id: UUID, entry_id: str, instructor_id: str) -> dict:
    """
    Delete a manually-added roster row (instructor only).

    Only rows with ``is_manual = true`` may be deleted this way — CSV-sourced
    rows are managed exclusively via roster re-upload.
    """
    try:
        client = get_client()
        cid = str(class_id)

        _require_owner(client, instructor_id, cid)

        existing = (
            client.table("roster_entries")
            .select("id, is_manual")
            .eq("id", entry_id)
            .eq("course_id", cid)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Roster entry not found")
        if not existing.data[0].get("is_manual"):
            raise HTTPException(
                status_code=400,
                detail="Only manually added roster entries can be deleted this way",
            )

        client.table("roster_entries").delete().eq("id", entry_id).eq("course_id", cid).execute()

        logger.info(
            "Manual roster entry deleted | class_id=%s entry_id=%s deleted_by=%s",
            class_id,
            entry_id,
            instructor_id,
        )
        return {"message": "Student removed from roster", "entry_id": entry_id}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error deleting manual roster entry | class_id=%s entry_id=%s", class_id, entry_id
        )
        raise HTTPException(status_code=500, detail="Failed to remove student from roster")


def _purge_student_from_class(client, class_id: UUID, student_id: str) -> None:
    """
    Remove all of a student's class-scoped state. Caller is responsible for
    authorization and error handling.

    - Removes them from every project in the class (project_members) and
      recounts each affected project's num_members from its remaining rows.
    - Cancels all pending project_join_requests for projects in this class.
    - Removes any TA project assignments for the user in the class.
    - Removes the class_enrollments row.

    The membership delete returns the rows it removed, which name the affected
    projects, so there is no membership read first and no read-then-write
    decrement per project.
    """
    from app.projects.controller import recount_num_members

    cid = str(class_id)
    projects_res = client.table("projects").select("id").eq("class_id", cid).execute()
    project_ids = [p["id"] for p in (projects_res.data or [])]

    if project_ids:
        removed = (
            client.table("project_members")
            .delete()
            .eq("user_id", student_id)
            .in_("project_id", project_ids)
            .execute()
        ).data or []
        affected = list(dict.fromkeys(str(row["project_id"]) for row in removed))
        if affected:
            recount_num_members(client, affected)

        # Cancel all pending join requests for projects in this class.
        client.table("project_join_requests").delete().eq("user_id", student_id).in_(
            "project_id", project_ids
        ).eq("request_status", "pending").execute()

    # A removed member no longer oversees any project in this class as its TA,
    # nor holds any end-of-quarter review claim.
    client.table("projects").update({"assigned_ta_id": None}).eq("class_id", cid).eq(
        "assigned_ta_id", student_id
    ).execute()
    client.table("project_review_tas").delete().eq("class_id", cid).eq(
        "user_id", student_id
    ).execute()

    # Remove class enrollment.
    client.table("class_enrollments").delete().eq("class_id", cid).eq(
        "user_id", student_id
    ).execute()


def remove_student_from_class(class_id: UUID, student_id: str, instructor_id: str) -> dict:
    """
    Remove a student's enrollment from a class (instructor only).

    Cleans up all class-related state for the student via
    :func:`_purge_student_from_class`.
    """
    try:
        client = get_client()

        _require_owner(client, instructor_id, class_id)

        _purge_student_from_class(client, class_id, student_id)

        logger.info(
            "Student removed from class | class_id=%s student_id=%s removed_by=%s",
            class_id,
            student_id,
            instructor_id,
        )
        return {"message": "Student removed successfully", "student_id": student_id}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error removing student | class_id=%s student_id=%s", class_id, student_id)
        raise HTTPException(status_code=500, detail="Failed to remove student")


def leave_class(class_id: UUID, user_id: str) -> dict:
    """
    Remove the acting student's own enrollment from a class.

    Authorizes the user as themselves (must be enrolled) and then performs the
    same cleanup as an instructor-initiated removal.
    """
    try:
        client = get_client()

        enrollment = (
            client.table("class_enrollments")
            .select("id")
            .eq("class_id", str(class_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not enrollment.data:
            raise HTTPException(
                status_code=404,
                detail="You are not enrolled in this class",
            )

        _purge_student_from_class(client, class_id, user_id)

        logger.info(
            "Student left class | class_id=%s user_id=%s",
            class_id,
            user_id,
        )
        return {"message": "You have left the class", "class_id": str(class_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error leaving class | class_id=%s user_id=%s", class_id, user_id)
        raise HTTPException(status_code=500, detail="Failed to leave class")


def bulk_invite_students(class_id: UUID, emails: list[str], instructor_id: str) -> dict:
    """
    Invite a batch of roster students by email (instructor only).

    For each email the possible statuses are:
    - ``enrolled``         – existing GrepThink account enrolled + email sent.
    - ``invited``          – no account yet; signup invitation email sent.
    - ``already_enrolled`` – student was already in the class; reminder email sent.
    - ``class_instructor`` – the address belongs to the class instructor; nothing done.
    - ``email_failed``     – SMTP/delivery error for this address.
    - ``error``            – the profile lookup or the enrollment failed for this email.

    Any account but the class instructor's is enrolled, whatever its role, including one
    that has not picked a role yet (joining by code refuses those): the instructor named
    the address, and the app sends such a user to /select before they can use anything.

    Addresses are handled in the order given, duplicates dropped. Two addresses of
    the same student report ``enrolled`` then ``already_enrolled`` and both are
    emailed, as when every address was handled on its own.

    Round trips: the class with its instructor's profile, then per 100 addresses at
    most one profile lookup, one enrollment read and one enrollment upsert: 4 for a
    typical batch (was 2 + up to 4 per address). Emails are still sent
    synchronously, once the enrollments are written.
    """
    try:
        client = get_client()
        cid = str(class_id)
        class_row = _require_owner(client, instructor_id, cid, columns=_INVITE_CLASS_COLUMNS)
        email_ctx = _invite_email_context(class_row)
        owner_id = str(class_row.get("created_by"))

        clean_emails = list(dict.fromkeys(e.strip().lower() for e in emails if e.strip()))

        profiles: dict[str, dict] = {}
        lookup_failed = False
        try:
            profiles = _find_student_profiles_by_email(client, clean_emails)
        except Exception:
            logger.warning("bulk_invite: profile lookup failed | class=%s", class_id, exc_info=True)
            lookup_failed = True

        student_ids = list(
            dict.fromkeys(str(p["id"]) for p in profiles.values() if str(p["id"]) != owner_id)
        )
        enrolled_before: set[str] = set()
        newly_enrolled: set[str] = set()
        read_failed = write_failed = False
        if student_ids:
            try:
                enrolled_before = _enrolled_user_ids(client, cid, student_ids)
            except Exception:
                logger.warning(
                    "bulk_invite: enrollment read failed | class=%s", class_id, exc_info=True
                )
                read_failed = True
            to_enroll = [uid for uid in student_ids if uid not in enrolled_before]
            if to_enroll and not read_failed:
                try:
                    newly_enrolled = _enroll_students(client, cid, to_enroll)
                except Exception:
                    logger.warning(
                        "bulk_invite: enrollment write failed | class=%s", class_id, exc_info=True
                    )
                    write_failed = True

        results = []
        reported: set[str] = set()  # students an earlier address already reported on
        for email in clean_emails:
            if lookup_failed:
                results.append({"email": email, "status": "error"})
                continue

            profile = profiles.get(email)
            if not profile:
                try:
                    send_class_invite_email(to=email, registered=False, **email_ctx)
                    results.append({"email": email, "status": "invited"})
                except Exception as exc:
                    logger.warning(
                        "bulk_invite: email failed for unregistered | email=%s err=%s",
                        email,
                        exc,
                    )
                    results.append({"email": email, "status": "email_failed"})
                continue

            if str(profile["id"]) == owner_id:
                results.append({"email": email, "status": "class_instructor"})
                continue

            uid = str(profile["id"])
            if read_failed or (write_failed and uid not in enrolled_before):
                results.append({"email": email, "status": "error"})
                continue

            already_enrolled = uid not in newly_enrolled or uid in reported
            reported.add(uid)
            delivery_email = (profile.get("email") or email).strip().lower()
            try:
                send_class_invite_email(
                    to=delivery_email,
                    registered=True,
                    **email_ctx,
                )
                results.append(
                    {
                        "email": email,
                        "status": "already_enrolled" if already_enrolled else "enrolled",
                    }
                )
            except Exception as exc:
                logger.warning(
                    "bulk_invite: email failed for registered | email=%s err=%s",
                    email,
                    exc,
                )
                if already_enrolled:
                    results.append({"email": email, "status": "email_failed"})
                else:
                    results.append({"email": email, "status": "enrolled"})

        enrolled_count = sum(1 for r in results if r["status"] == "enrolled")
        invited_count = sum(1 for r in results if r["status"] == "invited")
        logger.info(
            "bulk_invite_students: class=%s enrolled=%d invited=%d total=%d",
            class_id,
            enrolled_count,
            invited_count,
            len(results),
        )
        return {
            "results": results,
            "enrolled_count": enrolled_count,
            "invited_count": invited_count,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error in bulk_invite_students | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to bulk invite students")


@retry_on_disconnect()
def queue_invite(
    class_id: UUID,
    emails: list[str],
    instructor_id: str,
    delay_seconds: int = 60,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    custom_subject: str | None = None,
    custom_body: str | None = None,
    custom_body_html: str | None = None,
) -> dict:
    """Store a pending invite batch; the background worker sends it after delay_seconds."""
    try:
        client = get_client()
        _require_owner(client, instructor_id, class_id)

        send_at = datetime.datetime.now(datetime.UTC) + datetime.timedelta(seconds=delay_seconds)
        payload: dict = {
            "class_id": str(class_id),
            "instructor_id": instructor_id,
            "emails": emails,
            "send_at": send_at.isoformat(),
        }
        if cc:
            payload["cc"] = cc
        if bcc:
            payload["bcc"] = bcc
        if custom_subject is not None:
            payload["custom_subject"] = custom_subject
        if custom_body is not None:
            payload["custom_body"] = custom_body
        if custom_body_html is not None:
            payload["custom_body_html"] = custom_body_html
        row = client.table("pending_invites").insert(payload).execute()
        inserted = row.data[0]
        logger.info(
            "queue_invite: queued job=%s class=%s emails=%d", inserted["id"], class_id, len(emails)
        )
        return {"job_id": inserted["id"], "send_at": inserted["send_at"]}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error in queue_invite | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to queue invite")


@retry_on_disconnect()
def cancel_invite(class_id: UUID, job_id: str, instructor_id: str) -> dict:
    """Cancel a queued invite batch before it is sent.

    404 when the class does not exist, 403 unless the caller created it.
    """
    try:
        client = get_client()
        _require_owner(client, instructor_id, str(class_id))
        result = (
            client.table("pending_invites")
            .select("id, sent, cancelled")
            .eq("id", job_id)
            .eq("class_id", str(class_id))
            .eq("instructor_id", instructor_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Invite job not found")
        row = result.data[0]
        if row["sent"]:
            raise HTTPException(status_code=409, detail="Emails already sent")
        client.table("pending_invites").update({"cancelled": True}).eq("id", job_id).execute()
        logger.info("cancel_invite: cancelled job=%s class=%s", job_id, class_id)
        return {"cancelled": True}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error in cancel_invite | job_id=%s", job_id)
        raise HTTPException(status_code=500, detail="Failed to cancel invite")


@retry_on_disconnect()
def get_class_projects(class_id: UUID, user_id: str) -> list:
    """
    Get all projects for a class.

    Access rules: the class instructor and students / TAs enrolled in the class.

    Each project returns:
    - name, team_size, image_url, member_count, sentiment (class instructor only)
    - product_owner_name, product_owner_email
    - scrum_master_name, scrum_master_email (None if no scrum master assigned)

    Performance: the My Projects, Browse Projects and My Project pages call this
    on every navigation. The access check runs alongside one projects read that
    embeds every member with their profile, so the call is a single concurrent
    wave: 2 queries for the instructor, 3 for a member (was 5 in 3 waves).
    ``sentiment`` is always selected so that read does not wait on the access check; whether it
    is shown depends on ``reads["access"]["is_instructor"]`` — this class's instructor, never the
    caller's global ``profiles.role`` (an account can be an instructor elsewhere and only a
    student or TA here).
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "access": lambda: _require_member(client, user_id, cid),
                "projects": lambda: (
                    (
                        client.table("projects")
                        .select(
                            "id, name, team_size, sentiment, image_url, project_members(user_id, role, "
                            "profile:profiles!project_members_user_id_fkey(email, first_name, last_name))"
                        )
                        .eq("class_id", cid)
                        .order("created_at", desc=True)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        show_sentiment = reads["access"]["is_instructor"]
        return _project_cards(reads["projects"], show_sentiment, lambda m: m.get("profile") or {})
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching class projects | class_id=%s user_id=%s", class_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to fetch projects")


def _key_role_name(profile: dict) -> str | None:
    """Display name for an owner / scrum-master profile, falling back to email."""
    if not profile:
        return None
    first = profile.get("first_name") or ""
    last = profile.get("last_name") or ""
    full = f"{first} {last}".strip()
    return full or profile.get("email")


def _project_cards(projects: list[dict], show_sentiment: bool, lead_profile) -> list[dict]:
    """Project cards in the shape ``get_class_projects`` returns.

    ``projects`` embed ``project_members(user_id, role, ...)``. ``lead_profile(member)``
    returns the profile that names an owner or scrum master (``{}`` when unknown).
    ``sentiment`` is shown only when ``show_sentiment`` — pass the caller's ``is_instructor``
    for *this class*, never their account-wide ``profiles.role``: an instructor-role account
    that is only a TA or student here must not see the room's sentiment.
    """
    key_roles = {"product owner", "owner", "scrum master"}
    cards = []
    for project in projects:
        members = project.get("project_members") or []
        leads = {m["role"]: lead_profile(m) for m in members if m.get("role") in key_roles}
        owner_profile = leads.get("product owner") or leads.get("owner") or {}
        scrum_profile = leads.get("scrum master") or {}
        cards.append(
            {
                "id": project["id"],
                "name": project.get("name"),
                "team_size": project.get("team_size"),
                "image_url": project.get("image_url"),
                "member_count": len(members),
                "sentiment": project.get("sentiment") if show_sentiment else None,
                "product_owner_name": _key_role_name(owner_profile),
                "product_owner_email": owner_profile.get("email"),
                "scrum_master_name": _key_role_name(scrum_profile) if scrum_profile else None,
                "scrum_master_email": scrum_profile.get("email") if scrum_profile else None,
            }
        )
    return cards


@retry_on_disconnect()
def get_class_projects_overview(class_id: UUID, user_id: str) -> dict:
    """Projects list + enrolled-student list for the Projects page in one call.

    Returns ``{"projects": [...], "students": [...]}`` in the shapes of
    ``get_class_projects`` and ``get_class_students``. Owners and scrum masters
    are named from the enrolled users' profiles, so a lead who is not enrolled in
    the class shows no name or email here. ``sentiment`` is shown only to this class's
    instructor (``reads["access"]["is_instructor"]``), never by the caller's account-wide role.

    Round trips: the access check (1 for the instructor, 2 for a member), the
    enrollments with profiles, and the projects with their members, all in one
    concurrent wave (was 5 in 2 waves).
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "access": lambda: _require_member(client, user_id, cid),
                "enrollments": lambda: _enrollments_with_profiles(
                    client, cid, _STUDENT_PROFILE_COLUMNS
                ),
                "projects": lambda: (
                    (
                        client.table("projects")
                        .select(
                            "id, name, team_size, sentiment, image_url, project_members(user_id, role)"
                        )
                        .eq("class_id", cid)
                        .order("created_at", desc=True)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        enrollments, projects = reads["enrollments"], reads["projects"]
        profile_by_id = {p["id"]: p for p in _enrolled_profiles(enrollments)}
        show_sentiment = reads["access"]["is_instructor"]
        return {
            "projects": _project_cards(
                projects, show_sentiment, lambda m: profile_by_id.get(m.get("user_id"), {})
            ),
            "students": _student_rows(enrollments, projects),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching class projects overview | class_id=%s user_id=%s",
            class_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch projects overview")


def get_class_turn_in_stats(class_id: UUID, user_id: str) -> dict:
    """
    Turn-in stats for the class's current TSR assignment (instructor only).

    A team is fully submitted when every project member has at least one TSR
    row for the assignment (one evaluator_id per member). Partial means some
    but not all members have submitted.

    Round trips: the class, the published assignments and the projects with
    their member ids concurrently, then the current assignment's TSRs, which are
    skipped when no team has members (was 5 sequential).
    """
    try:
        client = get_client()
        cid = str(class_id)
        today = datetime.date.today()

        reads = fan_out(
            {
                "class": lambda: _require_owner(client, user_id, cid),
                "assignments": lambda: (
                    (
                        client.table("assignments")
                        .select("id, Title, open_date, close_date, status, assignment_type")
                        .eq("class_id", cid)
                        .eq("status", "publish")
                        .order("close_date")
                        .execute()
                    ).data
                    or []
                ),
                "projects": lambda: (
                    (
                        client.table("projects")
                        .select("id, project_members(user_id)")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        tsr_assignments = [a for a in reads["assignments"] if a.get("assignment_type") == "tsr"]

        current: dict | None = None
        for assignment in tsr_assignments:
            open_d = datetime.date.fromisoformat(assignment["open_date"])
            close_d = datetime.date.fromisoformat(assignment["close_date"])
            if open_d <= today <= close_d:
                current = assignment
                break

        if not current and tsr_assignments:
            open_future = [
                a for a in tsr_assignments if datetime.date.fromisoformat(a["close_date"]) >= today
            ]
            if open_future:
                current = min(
                    open_future,
                    key=lambda a: datetime.date.fromisoformat(a["close_date"]),
                )
            else:
                current = max(
                    tsr_assignments,
                    key=lambda a: datetime.date.fromisoformat(a["close_date"]),
                )

        empty = {
            "rate": 0,
            "teamsSubmitted": {"count": 0, "total": 0},
            "partialSubmissions": {"count": 0, "total": 0},
            "currentAssignment": None,
            "closeDate": None,
        }
        if not current:
            return empty

        projects = reads["projects"]
        if not projects:
            return {
                **empty,
                "currentAssignment": current.get("Title"),
                "closeDate": current.get("close_date"),
            }

        # A team is a project with at least one member row; its size is the row count.
        teams = {p["id"]: len(p["project_members"]) for p in projects if p.get("project_members")}
        total_teams = len(teams)

        evaluators_by_project: dict[str, set[str]] = {}
        if teams:
            tsr_rows = (
                client.table("TSRs")
                .select("project_id, evaluator_id")
                .eq("assignment_id", current["id"])
                .in_("project_id", list(teams))
                .execute()
            ).data or []
            for row in tsr_rows:
                pid = row.get("project_id")
                eid = row.get("evaluator_id")
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
            "rate": rate,
            "teamsSubmitted": {"count": full_count, "total": total_teams},
            "partialSubmissions": {"count": partial_count, "total": total_teams},
            "currentAssignment": current.get("Title"),
            "closeDate": current.get("close_date"),
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
