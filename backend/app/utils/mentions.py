"""@-mentions inside stored markdown bodies (issue #191).

A mention is the markdown link ``[@Display Name](mention:<profile-uuid>)``. The display
text is a snapshot taken when the comment was written; the UUID is the identity, so a
rename never breaks it. A typed ``@word`` without the token is plain text.
"""

from __future__ import annotations

import re

_UUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_MENTION_ID = re.compile(rf"\(mention:({_UUID})\)")
_MENTION_LINK = re.compile(rf"\[@?([^\]\n]*)\]\(mention:{_UUID}\)")


def extract_mention_ids(body_md: str | None) -> set[str]:
    """The unique, lowercased profile UUIDs in ``(mention:<uuid>)`` tokens."""
    if not body_md:
        return set()
    return {m.lower() for m in _MENTION_ID.findall(body_md)}


def render_mentions_plain(body_md: str | None) -> str:
    """``body_md`` with each ``[@Name](mention:<uuid>)`` link shown as ``@Name``."""
    if not body_md:
        return ""
    return _MENTION_LINK.sub(lambda m: f"@{m.group(1)}", body_md)
