"""HTTP handler for the issue form. Thin layer over controller.py."""

from __future__ import annotations

from fastapi import Request

from app.issues import controller
from app.issues.models import IssueReportRequest, IssueReportResponse
from app.limiter import limiter


@limiter.limit("5/minute")
def submit_issue(request: Request, body: IssueReportRequest) -> IssueReportResponse:
    return IssueReportResponse(
        **controller.submit_issue(
            github_user=body.github_user,
            email=body.email,
            title=body.title,
            description=body.description,
            website=body.website,
        )
    )
