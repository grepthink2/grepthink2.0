"""The scrum board MCP connector: three tools a team member's AI assistant (Claude, ChatGPT) uses
to turn the team's plan, pasted or typed into the chat, into stories and tasks on their GrepThink
board.

Stateless Streamable HTTP with JSON responses, so any serverless instance can answer any
request. Every tool acts as the user whose token the app holds (:mod:`app.mcp.auth`), with the
board's own access rules (:mod:`app.mcp.controller`). The descriptions below are what the app
reads to learn the board's model and the confirm-first rule: they are product copy.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import anyio
from fastapi import HTTPException
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp_types import ToolAnnotations
from starlette.applications import Starlette
from starlette.responses import JSONResponse

from app.mcp import controller
from app.mcp.auth import SupabaseAppTokenVerifier, auth_settings
from app.mcp.controller import FillRejected
from app.mcp.models import FillBoardRequest, NewSprint, NewStory

INSTRUCTIONS = """GrepThink is where UCSC CSE 115 teams run their projects. These tools fill a team's
scrum board from the plan the student gives you (a scrum doc, backlog, sprint plan or notes,
pasted or typed into the chat).

Workflow:
1. list_my_projects; if there is more than one, ask which project.
2. get_board_context for it: the board's rules, the team, the sprints, and what is already there.
3. Draft the plan and show ALL of it to the student as readable text: sprints, then each story
   with its tasks, each with points, hours, tags, assignee and a short description. End with a
   list of warnings: fields left empty, and items you skipped as duplicates of existing ones.
4. Revise as the student asks. Only after the student explicitly approves the plan you showed,
   call fill_board with confirmed=true. Then report the keys created and repeat the warnings.

The connector only adds items. It never edits, moves or deletes what is on the board."""

mcp = MCPServer(
    "grepthink",
    title="GrepThink scrum board",
    instructions=INSTRUCTIONS,
    website_url="https://grepthink2.com",
    token_verifier=SupabaseAppTokenVerifier(),
    auth=auth_settings(),
)


def _caller() -> tuple[str, str]:
    """The user the app acts for, and the app's client id."""
    token = get_access_token()
    if token is None or not token.subject:  # the SDK's auth middleware lets no such request in
        raise ToolError("Not signed in")
    return token.subject, token.client_id


async def _run(fn, /, **kwargs):
    """Run a controller function off the event loop; its refusals become tool errors the app
    can read and act on."""
    try:
        return await anyio.to_thread.run_sync(lambda: fn(**kwargs))
    except FillRejected as exc:
        raise ToolError(
            "The batch was not added. Fix these and try again:\n- " + "\n- ".join(exc.errors)
        )
    except HTTPException as exc:
        raise ToolError(str(exc.detail))


@mcp.tool(
    title="List my projects",
    annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False),
    description="The GrepThink projects (teams) the signed-in student is a member of, with their class.",
)
async def list_my_projects() -> list[dict[str, Any]]:
    user_id, _ = _caller()
    return await _run(controller.list_my_projects, user_id=user_id)


@mcp.tool(
    title="Read a board's rules and contents",
    annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False),
    description="""Everything needed to draft items for a project's scrum board. Call it before drafting.

The board's model: stories hold tasks. A story is a user-facing outcome; describe it as
"As a <user>, I want <goal> so that <reason>" followed by acceptance criteria, in markdown.
Tasks are the concrete work to deliver it, each small enough for one person in at most 15 hours.
- points: only values in allowed_points (the project's estimate_scale). A story's points should
  equal the sum of its tasks' points: the burnup chart counts scope from story points and
  progress from done task points.
- estimate_hours: tasks only, a whole number in hours_range.
- tags: tasks only, from tags.
- assignee: a user_id from members. Where the plan doesn't say, spread the work across the team
  by role.
- sprints: existing sprints have an id and a status; stories can join planned or active ones.
- existing: items already on the board. Don't add duplicates; list what you skipped.
- today: the date at the student's school, for relative dates. Never invent sprint dates: ask.
can_write is false for staff, who can read the board but not add to it.""",
)
async def get_board_context(project_id: str) -> dict[str, Any]:
    user_id, _ = _caller()
    return await _run(controller.board_context, project_id=project_id, user_id=user_id)


@mcp.tool(
    title="Add sprints, stories and tasks to a board",
    annotations=ToolAnnotations(
        readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False
    ),
    description="""Add a batch of new sprints, stories and tasks to a project's board, all or nothing.

Only call this after showing the student the complete plan and receiving their explicit
approval of it; set confirmed=true only then. Calling it twice adds the items twice.

- sprints: new sprints, created as planned. Give each a ref (any short label) that stories in
  this batch use to join it.
- stories[].sprint: a new sprint's ref, an existing planned or active sprint's id, or omitted
  for the backlog.
- Only title is required. Leave a field out rather than guess, and tell the student.
The whole batch is checked first. If anything is wrong nothing is added and every problem is
listed with its path; fix them and call again. On success the created items come back with
their keys (US-n, GT-n), plus warnings about empty fields to repeat to the student.""",
)
async def fill_board(
    project_id: str,
    confirmed: bool,
    stories: list[NewStory] | None = None,
    sprints: list[NewSprint] | None = None,
) -> dict[str, Any]:
    user_id, client_id = _caller()
    request = FillBoardRequest(confirmed=confirmed, sprints=sprints or [], stories=stories or [])
    return await _run(
        controller.fill_board,
        project_id=project_id,
        user_id=user_id,
        client_id=client_id,
        request=request,
    )


#: The paths the MCP app answers: the endpoint, and its OAuth protected-resource metadata.
MCP_PATHS = ("/mcp", "/.well-known/oauth-protected-resource/mcp")


def build_mcp_app() -> Starlette:
    """A fresh MCP app with its own session manager (which can run only once)."""
    return mcp.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        # DNS-rebinding protection guards servers on localhost; this one is public and every
        # request carries a bearer token.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )


class MCPEndpoint:
    """The ASGI endpoint the API routes :data:`MCP_PATHS` to. It serves the MCP app started by
    :meth:`running`, which the API's lifespan enters, and answers 503 outside it."""

    __name__ = "mcp_endpoint"  # slowapi names every route's endpoint

    def __init__(self) -> None:
        self._app: Starlette | None = None

    @asynccontextmanager
    async def running(self) -> AsyncIterator[None]:
        app = build_mcp_app()
        async with app.router.lifespan_context(app):
            self._app = app
            try:
                yield
            finally:
                self._app = None

    async def __call__(self, scope, receive, send) -> None:
        if self._app is None:
            response = JSONResponse(
                {"detail": "Service unavailable", "code": "unavailable"}, status_code=503
            )
            await response(scope, receive, send)
            return
        await self._app(scope, receive, send)


mcp_endpoint = MCPEndpoint()
