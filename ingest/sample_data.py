"""Synthetic dataset loader for offline/demo mode (`--seed-sample`).

Populates Postgres with a couple of repos' worth of (file, commit) rows and a
tracker's worth of artifacts with reconstructed status events, so the API and
UI can be demoed end-to-end without network access. This is a demo aid only —
the real ingestion paths (git_lane / tuleap_lane / crossref) remain primary.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

# Deterministic pseudo-data so the demo is reproducible.
AUTHORS = [
    ("Alice Martin", "alice@example.com"),
    ("Bob Nguyen", "bob@example.com"),
    ("Carol Diaz", "carol@example.com"),
]

PATHS = {
    "uart": [
        "src/uart/driver.c", "src/uart/driver.h", "src/uart/fifo.c",
        "src/core/clock.c", "tests/test_uart.c", "docs/uart.md", "vendor/lib.lock",
    ],
    "firmware": [
        "app/main.c", "app/scheduler.c", "hal/gpio.c", "hal/spi.c",
        "tests/test_scheduler.c", "README.md",
    ],
}

ASSIGNEES = ["alice", "bob", "carol"]


def _fake_sha(seed: str) -> str:
    return hashlib.sha1(seed.encode()).hexdigest()


def _det(seed: str, mod: int) -> int:
    return int(hashlib.md5(seed.encode()).hexdigest(), 16) % mod


def load_sample(conn, base_date: datetime | None = None) -> dict:
    """Insert the synthetic dataset. Idempotent via ON CONFLICT upserts."""
    if base_date is None:
        base_date = datetime(2026, 1, 1, tzinfo=timezone.utc)

    cur = conn.cursor()
    counts = {"repos": 0, "commits": 0, "files": 0, "artifacts": 0, "events": 0, "links": 0}

    # ---- repos + commits + files ----
    repo_ids = {}
    for repo_name, url_suffix in [("uart", "uart"), ("firmware", "firmware")]:
        cur.execute(
            """
            INSERT INTO repo (name, clone_url, default_branch)
            VALUES (%s, %s, 'main')
            ON CONFLICT (name) DO UPDATE SET clone_url = EXCLUDED.clone_url
            RETURNING id
            """,
            (repo_name, f"https://tuleap.example.com/plugins/git/myproj/{url_suffix}.git"),
        )
        repo_ids[repo_name] = cur.fetchone()[0]
        counts["repos"] += 1

    # ~60 commits per repo spread over ~24 weeks.
    for repo_name, repo_id in repo_ids.items():
        paths = PATHS[repo_name]
        for i in range(60):
            seed = f"{repo_name}-{i}"
            sha = _fake_sha(seed)
            author = AUTHORS[_det(seed + "a", len(AUTHORS))]
            days_ago = _det(seed + "d", 168)  # within 24 weeks
            authored_at = base_date - timedelta(days=days_ago, hours=_det(seed + "h", 24))
            # link every 5th commit to an artifact
            ref = f" closes art #{100 + (i % 12)}" if i % 5 == 0 else ""
            subject = f"{repo_name}: change {i}{ref}"

            cur.execute(
                """
                INSERT INTO git_commit (sha, repo_id, author_name, author_email, authored_at, subject)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (sha) DO NOTHING
                """,
                (sha, repo_id, author[0], author[1], authored_at, subject),
            )
            counts["commits"] += 1

            n_files = 1 + _det(seed + "nf", 4)
            for j in range(n_files):
                path = paths[_det(seed + f"p{j}", len(paths))]
                added = _det(seed + f"a{j}", 120)
                removed = _det(seed + f"r{j}", 60)
                counts_churn = not (path.endswith(".lock") or path.startswith("vendor/"))
                cur.execute(
                    """
                    INSERT INTO commit_file
                        (sha, repo_id, path, lines_added, lines_removed,
                         change_type, is_binary, counts_churn)
                    VALUES (%s, %s, %s, %s, %s, 'M', FALSE, %s)
                    ON CONFLICT (sha, path) DO NOTHING
                    """,
                    (sha, repo_id, path, added, removed, counts_churn),
                )
                counts["files"] += 1

    # ---- tracker + artifacts + events ----
    cur.execute(
        """
        INSERT INTO tracker (tuleap_tracker_id, name, status_field, open_value_ids, assignee_field)
        VALUES (101, 'Bugs', 'status', ARRAY[10,11], 'assigned_to')
        ON CONFLICT (tuleap_tracker_id) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        """,
    )
    tracker_id = cur.fetchone()[0]

    for k in range(24):
        tuleap_artifact_id = 100 + k
        submitted_at = base_date - timedelta(days=_det(f"art{k}", 160) + 5)
        assignee = ASSIGNEES[_det(f"asg{k}", len(ASSIGNEES))]
        # ~60% closed
        closed = _det(f"cl{k}", 10) < 6
        close_time = submitted_at + timedelta(days=3 + _det(f"ct{k}", 40))
        is_open = not closed
        status = "New" if is_open else "Closed"

        cur.execute(
            """
            INSERT INTO artifact
                (tuleap_artifact_id, tracker_id, title, submitted_at,
                 current_status, current_assignee, is_open)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (tuleap_artifact_id) DO UPDATE SET
                current_status = EXCLUDED.current_status,
                current_assignee = EXCLUDED.current_assignee,
                is_open = EXCLUDED.is_open
            RETURNING id
            """,
            (tuleap_artifact_id, tracker_id, f"Sample artifact {tuleap_artifact_id}",
             submitted_at, status, assignee, is_open),
        )
        artifact_id = cur.fetchone()[0]
        counts["artifacts"] += 1

        # open event at creation
        cur.execute(
            """
            INSERT INTO artifact_status_event (artifact_id, changeset_id, event_time, event_type)
            VALUES (%s, %s, %s, 'open')
            ON CONFLICT (artifact_id, changeset_id) DO NOTHING
            """,
            (artifact_id, tuleap_artifact_id * 10 + 1, submitted_at),
        )
        counts["events"] += cur.rowcount
        if closed:
            cur.execute(
                """
                INSERT INTO artifact_status_event (artifact_id, changeset_id, event_time, event_type)
                VALUES (%s, %s, %s, 'close')
                ON CONFLICT (artifact_id, changeset_id) DO NOTHING
                """,
                (artifact_id, tuleap_artifact_id * 10 + 2, close_time),
            )
            counts["events"] += cur.rowcount

    # ---- cross-ref links (mirror the "closes art #" subjects above) ----
    cur.execute("SELECT tuleap_artifact_id, id FROM artifact")
    art_map = {r[0]: r[1] for r in cur.fetchall()}
    cur.execute("SELECT sha, subject FROM git_commit WHERE subject LIKE %s", ("%closes art #%",))
    for sha, subject in cur.fetchall():
        # subject ends with "closes art #<id>"
        tid = int(subject.rsplit("#", 1)[1])
        artifact_id = art_map.get(tid)
        if artifact_id:
            cur.execute(
                """
                INSERT INTO commit_artifact_link (sha, artifact_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
                """,
                (sha, artifact_id),
            )
            counts["links"] += cur.rowcount

    conn.commit()
    return counts
