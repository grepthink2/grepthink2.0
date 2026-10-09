"""M1 (issue #191): mention ids come only from ``(mention:<uuid>)`` tokens."""

from app.utils.mentions import extract_mention_ids, render_mentions_plain

ANA = "0f1e2d3c-4b5a-4968-8776-655443322110"
BO = "11111111-2222-4333-8444-555555555555"


def test_empty_and_none_bodies_mention_nobody():
    assert extract_mention_ids(None) == set()
    assert extract_mention_ids("") == set()


def test_duplicates_collapse_to_one_id():
    body = f"[@Ana](mention:{ANA}) and again [@Ana R](mention:{ANA}), cc [@Bo](mention:{BO})"
    assert extract_mention_ids(body) == {ANA, BO}


def test_an_uppercase_uuid_comes_back_lowercased():
    assert extract_mention_ids(f"[@Ana](mention:{ANA.upper()})") == {ANA}


def test_a_plain_at_word_is_not_a_mention():
    assert extract_mention_ids("@Ana can you review? email ana@ucsc.edu") == set()


def test_bad_or_partial_tokens_are_ignored():
    bodies = [
        f"[@Ana](mention:{ANA[:-1]})",  # one digit short
        f"[@Ana](mention:{ANA}0)",  # one digit long
        f"[@Ana](mention:{ANA.replace('-', '')})",  # no dashes
        f"[@Ana](mention:{ANA[:-1]}g)",  # not hex
        f"[@Ana](mention:{ANA}",  # unclosed
        f"mention:{ANA}",  # no parentheses
        f"[@Ana](user:{ANA})",  # another scheme
        "[@Ana](mention:)",
    ]
    for body in bodies:
        assert extract_mention_ids(body) == set(), body


def test_render_shows_each_token_as_at_name():
    body = f"[@Ana Ruiz](mention:{ANA}) and [@Bo](mention:{BO}) — @plain stays"
    assert render_mentions_plain(body) == "@Ana Ruiz and @Bo — @plain stays"
    assert render_mentions_plain(None) == ""
