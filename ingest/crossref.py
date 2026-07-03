"""Cross-reference pass: link commits to Tuleap artifacts.

Parses each commit subject for Tuleap artifact references / closing keywords
followed by `#<artifact_id>`, e.g.:

    closes art #456
    implements story #123
    fix #789
    refs #42

Inserts (sha, artifact_id) into commit_artifact_link. The link is only ever
surfaced as hyperlinks in v1.
"""
from __future__ import annotations

import re
from typing import List, Set, Tuple

# Match an optional keyword/tracker word, then #<id>. We accept a bare `#123`
# too, since Tuleap's own cross-reference syntax is `art #123` / `#123`.
REF_RE = re.compile(
    r"(?:\b(?:close[sd]?|closing|fix(?:e[sd])?|resolve[sd]?|implement[sd]?|"
    r"refs?|references?|art|story|bug|task|req)\b\s*)?#(\d+)",
    re.IGNORECASE,
)


def extract_artifact_ids(text: str) -> Set[int]:
    if not text:
        return set()
    return {int(m.group(1)) for m in REF_RE.finditer(text)}


def link_commits(conn) -> int:
    """Scan all commit subjects and (re)build commit_artifact_link. Idempotent."""
    cur = conn.cursor()
    # Map tuleap_artifact_id -> internal artifact.id for artifacts we monitor.
    cur.execute("SELECT tuleap_artifact_id, id FROM artifact")
    art_map = {row[0]: row[1] for row in cur.fetchall()}

    cur.execute("SELECT sha, subject FROM git_commit")
    rows = cur.fetchall()

    inserted = 0
    for sha, subject in rows:
        for tuleap_id in extract_artifact_ids(subject or ""):
            artifact_id = art_map.get(tuleap_id)
            if artifact_id is None:
                continue  # reference to an artifact we don't track
            cur.execute(
                """
                INSERT INTO commit_artifact_link (sha, artifact_id)
                VALUES (%s, %s)
                ON CONFLICT (sha, artifact_id) DO NOTHING
                """,
                (sha, artifact_id),
            )
            inserted += cur.rowcount
    conn.commit()
    return inserted
