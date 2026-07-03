"""Rich synthetic dataset for offline demo mode (`ingest-all --seed-demo`).

Generates a *lot* of realistic-looking data so the whole stack can be shown
off without a live Tuleap / git backend:

  * 6 repositories with deep, plausible file trees (C firmware, TS frontend,
    Python service, docs) — hot files that change often, vendored/lock paths
    excluded from churn.
  * ~2,400 commits (× --scale) over ~18 months, biased to weekdays and
    business hours, authored by 8 contributors with different activity levels.
  * 3 trackers with *distinct* status semantics (Bugs / Tasks / User Stories),
    ~270 artifacts with realistic lifecycles (open → close, some reopened,
    some still open) and per-assignee distribution.
  * Cross-reference links from ~35% of commits to artifacts.

Everything is driven by a seeded PRNG, so re-running is deterministic and
idempotent (rows upsert on their natural keys). This is a demo aid only — the
real ingestion paths (git_lane / tuleap_lane / crossref) remain primary.
"""
from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

from psycopg2.extras import execute_values

# --------------------------------------------------------------- people ----

# (name, email, relative activity weight)
AUTHORS = [
    ("Alice Martin", "alice.martin@example.com", 1.0),
    ("Bob Nguyen", "bob.nguyen@example.com", 0.85),
    ("Carol Diaz", "carol.diaz@example.com", 0.95),
    ("David Okoro", "david.okoro@example.com", 0.6),
    ("Elena Rossi", "elena.rossi@example.com", 0.7),
    ("Farid Haddad", "farid.haddad@example.com", 0.4),
    ("Grace Kim", "grace.kim@example.com", 0.55),
    ("Hugo Lefevre", "hugo.lefevre@example.com", 0.3),
]
ASSIGNEES = [a[1].split("@")[0] for a in AUTHORS]  # login-ish handles

# ---------------------------------------------------------------- repos ----

def _tree(*paths: str) -> List[str]:
    return list(paths)

REPOS = [
    {
        "name": "uart", "kind": "c", "commits": 380,
        "files": _tree(
            "src/drivers/uart/driver.c", "src/drivers/uart/driver.h",
            "src/drivers/uart/fifo.c", "src/drivers/uart/fifo.h",
            "src/drivers/uart/dma.c", "src/drivers/uart/dma.h",
            "src/hal/gpio.c", "src/hal/clock.c", "src/hal/nvic.c",
            "src/core/ring_buffer.c", "src/core/ring_buffer.h",
            "src/core/errno.c", "include/uart.h", "include/hal.h",
            "tests/unit/test_driver.c", "tests/unit/test_fifo.c",
            "tests/unit/test_ring_buffer.c", "tests/integration/test_loopback.c",
            "docs/uart.md", "docs/registers.md", "Makefile",
            "vendor/cmsis/core_cm4.h", "vendor/cmsis/system.c",
        ),
        "hot": ["src/drivers/uart/driver.c", "src/drivers/uart/fifo.c", "tests/unit/test_driver.c"],
    },
    {
        "name": "firmware", "kind": "c", "commits": 520,
        "files": _tree(
            "app/main.c", "app/scheduler.c", "app/scheduler.h", "app/tasks/sensor.c",
            "app/tasks/comm.c", "app/tasks/power.c", "app/config/board.h",
            "hal/gpio.c", "hal/spi.c", "hal/i2c.c", "hal/adc.c", "hal/timer.c",
            "drivers/lsm6dsl.c", "drivers/lsm6dsl.h", "drivers/flash.c",
            "lib/crc.c", "lib/crc.h", "lib/queue.c", "lib/queue.h",
            "tests/unit/test_scheduler.c", "tests/unit/test_queue.c",
            "tests/hil/test_sensor.c", "docs/architecture.md", "README.md",
            "Makefile", "third_party/freertos/tasks.c", "third_party/freertos/queue.c",
        ),
        "hot": ["app/scheduler.c", "app/main.c", "drivers/lsm6dsl.c", "hal/spi.c"],
    },
    {
        "name": "bootloader", "kind": "c", "commits": 180,
        "files": _tree(
            "src/start.S", "src/boot.c", "src/flash.c", "src/crc32.c",
            "src/usb_dfu.c", "src/uart_boot.c", "include/boot.h",
            "linker/stm32.ld", "tests/test_crc32.c", "docs/protocol.md", "Makefile",
        ),
        "hot": ["src/boot.c", "src/usb_dfu.c"],
    },
    {
        "name": "web-console", "kind": "ts", "commits": 640,
        "files": _tree(
            "src/main.tsx", "src/App.tsx", "src/routes/Dashboard.tsx",
            "src/routes/Devices.tsx", "src/routes/DeviceDetail.tsx",
            "src/routes/Settings.tsx", "src/components/Chart.tsx",
            "src/components/Table.tsx", "src/components/Sidebar.tsx",
            "src/components/StatusBadge.tsx", "src/hooks/useApi.ts",
            "src/hooks/useWebsocket.ts", "src/lib/api.ts", "src/lib/format.ts",
            "src/lib/auth.ts", "src/styles/theme.css", "tests/App.test.tsx",
            "tests/api.test.ts", "public/index.html", "package.json",
            "vite.config.ts", "pnpm-lock.yaml",
        ),
        "hot": ["src/routes/Dashboard.tsx", "src/lib/api.ts", "src/components/Chart.tsx",
                "src/App.tsx"],
    },
    {
        "name": "telemetry-service", "kind": "py", "commits": 460,
        "files": _tree(
            "app/main.py", "app/api/devices.py", "app/api/metrics.py",
            "app/api/alerts.py", "app/models/device.py", "app/models/reading.py",
            "app/ingest/mqtt.py", "app/ingest/decoder.py", "app/storage/timeseries.py",
            "app/storage/postgres.py", "app/tasks/aggregate.py", "app/config.py",
            "tests/test_devices.py", "tests/test_decoder.py", "tests/test_aggregate.py",
            "migrations/0001_init.sql", "migrations/0002_alerts.sql",
            "pyproject.toml", "requirements.txt", "poetry.lock",
        ),
        "hot": ["app/ingest/decoder.py", "app/api/metrics.py", "app/storage/timeseries.py"],
    },
    {
        "name": "docs-portal", "kind": "docs", "commits": 220,
        "files": _tree(
            "docs/index.md", "docs/getting-started.md", "docs/hardware/uart.md",
            "docs/hardware/spi.md", "docs/api/rest.md", "docs/api/mqtt.md",
            "docs/guides/provisioning.md", "docs/guides/ota.md",
            "docs/troubleshooting.md", "assets/diagram.svg", "mkdocs.yml",
        ),
        "hot": ["docs/getting-started.md", "docs/api/rest.md"],
    },
]

# commit-message vocabulary
VERBS = ["Add", "Fix", "Refactor", "Optimize", "Update", "Clean up", "Handle",
         "Implement", "Improve", "Rework", "Tweak", "Document", "Guard against"]
NOUNS = ["edge case in", "timeout in", "retry logic for", "parsing of", "handling of",
         "the state machine in", "error path in", "config for", "tests for",
         "the interface for", "memory use in", "logging in"]
REF_KEYWORDS = ["fixes", "closes", "refs", "re", "implements", "part of"]

# ------------------------------------------------------------- trackers ----

TRACKERS = [
    {
        "tuleap_id": 101, "name": "Bugs", "status_field": "status",
        "open_value_ids": [10, 11, 12], "assignee_field": "assigned_to",
        "open_statuses": ["New", "In Progress", "Need Info"],
        "closed_statuses": ["Fixed", "Closed", "Won't Fix"],
        "artifacts": 120, "id_base": 1000, "cycle_mu": 2.2, "cycle_sigma": 0.9,
    },
    {
        "tuleap_id": 149, "name": "Tasks", "status_field": "status",
        "open_value_ids": [20, 21], "assignee_field": "assigned_to",
        "open_statuses": ["Todo", "Doing"],
        "closed_statuses": ["Done", "Cancelled"],
        "artifacts": 90, "id_base": 2000, "cycle_mu": 1.8, "cycle_sigma": 0.7,
    },
    {
        "tuleap_id": 172, "name": "User Stories", "status_field": "status",
        "open_value_ids": [30, 31, 32, 33], "assignee_field": "assigned_to",
        "open_statuses": ["New", "Analyzed", "In Dev", "In Review"],
        "closed_statuses": ["Done", "Rejected"],
        "artifacts": 60, "id_base": 3000, "cycle_mu": 3.0, "cycle_sigma": 0.8,
    },
]

# ----------------------------------------------------------- generation ----


def _sha(seed: str) -> str:
    return hashlib.sha1(seed.encode()).hexdigest()


def _commit_time(rng: random.Random, start: datetime, end: datetime) -> datetime:
    """Sample a timestamp biased to weekdays and business hours, recency-weighted."""
    span = (end - start).total_seconds()
    for _ in range(3):
        # triangular gives a mild recency bias (mode near the end)
        frac = rng.triangular(0.0, 1.0, 0.72)
        t = start + timedelta(seconds=span * frac)
        if t.weekday() >= 5 and rng.random() < 0.8:
            continue  # mostly skip weekends
        break
    hour = rng.choices(range(24),
                       weights=[1, 1, 1, 1, 1, 1, 2, 4, 8, 12, 14, 13, 10, 12,
                                14, 13, 11, 9, 6, 4, 3, 2, 2, 1])[0]
    return t.replace(hour=hour, minute=rng.randint(0, 59), second=rng.randint(0, 59),
                     microsecond=0)


def _counts_churn(path: str) -> bool:
    lowered = path.lower()
    return not (
        lowered.endswith(".lock")
        or "vendor/" in lowered
        or "third_party/" in lowered
        or "node_modules/" in lowered
        or lowered.endswith("lock.yaml")
        or lowered.endswith("poetry.lock")
        or lowered.endswith("pnpm-lock.yaml")
    )


def _plan_artifacts(rng: random.Random, now: datetime, scale: float):
    """Build (in memory) artifact rows, their status events, and the id pool."""
    window_start = now - timedelta(days=int(540))  # ~18 months
    artifacts = []   # dicts pre-DB
    events = []      # (tuleap_artifact_id, changeset_id, event_time, event_type)
    pool: List[int] = []

    for tr in TRACKERS:
        n = max(1, int(tr["artifacts"] * scale))
        for k in range(n):
            aid = tr["id_base"] + k
            pool.append(aid)
            # submitted biased older so a backlog accumulates
            frac = rng.triangular(0.0, 1.0, 0.35)
            submitted = window_start + timedelta(
                seconds=(now - window_start).total_seconds() * frac)
            assignee = rng.choices(ASSIGNEES + ["(unassigned)"],
                                   weights=[6, 5, 6, 3, 4, 2, 3, 2, 2])[0]
            seq = 1
            evs = [(aid, aid * 100 + seq, submitted, "open")]

            roll = rng.random()
            is_open = True
            status = rng.choice(tr["open_statuses"])

            def cycle_days():
                return max(1, int(rng.lognormvariate(tr["cycle_mu"], tr["cycle_sigma"])))

            if roll < 0.30:
                # still open
                pass
            else:
                close1 = submitted + timedelta(days=cycle_days())
                if close1 >= now:
                    pass  # would close in the future → treat as still open
                elif roll < 0.80:
                    seq += 1
                    evs.append((aid, aid * 100 + seq, close1, "close"))
                    is_open, status = False, rng.choice(tr["closed_statuses"])
                elif roll < 0.92:
                    # reopened then closed again
                    reopen = close1 + timedelta(days=rng.randint(2, 30))
                    close2 = reopen + timedelta(days=cycle_days())
                    seq += 1; evs.append((aid, aid * 100 + seq, close1, "close"))
                    if reopen < now:
                        seq += 1; evs.append((aid, aid * 100 + seq, reopen, "reopen"))
                        if close2 < now:
                            seq += 1; evs.append((aid, aid * 100 + seq, close2, "close"))
                            is_open, status = False, rng.choice(tr["closed_statuses"])
                        else:
                            is_open, status = True, rng.choice(tr["open_statuses"])
                    else:
                        is_open, status = False, rng.choice(tr["closed_statuses"])
                else:
                    # reopened, still open
                    reopen = close1 + timedelta(days=rng.randint(2, 30))
                    seq += 1; evs.append((aid, aid * 100 + seq, close1, "close"))
                    if reopen < now:
                        seq += 1; evs.append((aid, aid * 100 + seq, reopen, "reopen"))
                        is_open, status = True, rng.choice(tr["open_statuses"])
                    else:
                        is_open, status = False, rng.choice(tr["closed_statuses"])

            artifacts.append({
                "tuleap_id": aid, "tracker_tuleap_id": tr["tuleap_id"],
                "title": f"[{tr['name'][:-1] if tr['name'].endswith('s') else tr['name']}] "
                         f"{rng.choice(VERBS)} {rng.choice(NOUNS)} module {rng.randint(1, 40)}",
                "submitted": submitted, "status": status,
                "assignee": None if assignee == "(unassigned)" else assignee,
                "is_open": is_open,
            })
            events.extend(evs)

    return artifacts, events, pool


def load_demo(conn, scale: float = 1.0, seed: int = 1337) -> Dict[str, int]:
    rng = random.Random(seed)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    window_start = now - timedelta(days=540)

    cur = conn.cursor()
    counts = {"repos": 0, "commits": 0, "files": 0, "trackers": 0,
              "artifacts": 0, "events": 0, "links": 0}

    # ---- plan trackers/artifacts first so commits can reference real ids ----
    artifacts, events, pool = _plan_artifacts(rng, now, scale)

    # ---- repos ----
    repo_ids: Dict[str, int] = {}
    for r in REPOS:
        cur.execute(
            """
            INSERT INTO repo (name, clone_url, default_branch)
            VALUES (%s, %s, 'main')
            ON CONFLICT (name) DO UPDATE SET clone_url = EXCLUDED.clone_url
            RETURNING id
            """,
            (r["name"], f"https://tuleap.example.com/plugins/git/myproj/{r['name']}.git"),
        )
        repo_ids[r["name"]] = cur.fetchone()[0]
        counts["repos"] += 1

    # ---- commits + files (+ pending cross-ref links) ----
    commit_rows: List[tuple] = []
    file_rows: List[tuple] = []
    pending_links: List[Tuple[str, int]] = []  # (sha, tuleap_artifact_id)

    for r in REPOS:
        repo_id = repo_ids[r["name"]]
        files = r["files"]
        hot = set(r["hot"])
        weights = [4.0 if f in hot else 1.0 for f in files]
        n_commits = max(1, int(r["commits"] * scale))

        for i in range(n_commits):
            cseed = f"{r['name']}-{i}"
            sha = _sha(cseed)
            author = rng.choices(AUTHORS, weights=[a[2] for a in AUTHORS])[0]
            ts = _commit_time(rng, window_start, now)

            ref = ""
            if rng.random() < 0.35 and pool:
                aid = rng.choice(pool)
                ref = f" ({rng.choice(REF_KEYWORDS)} #{aid})"
                pending_links.append((sha, aid))
            subject = f"{r['name']}: {rng.choice(VERBS).lower()} {rng.choice(NOUNS)} " \
                      f"{files[rng.randrange(len(files))].split('/')[-1]}{ref}"

            commit_rows.append((sha, repo_id, author[0], author[1], ts, subject))

            # 1..6 files, weighted toward hot files, small toward large edits
            n_files = rng.choices([1, 2, 3, 4, 5, 6], weights=[30, 26, 18, 12, 8, 6])[0]
            chosen = set()
            for _ in range(n_files):
                path = rng.choices(files, weights=weights)[0]
                if path in chosen:
                    continue
                chosen.add(path)
                is_binary = path.endswith(".svg") and rng.random() < 0.5
                if is_binary:
                    added = removed = 0
                    ctype = "M"
                else:
                    added = int(rng.lognormvariate(2.6, 1.0))
                    removed = int(rng.lognormvariate(1.8, 1.1))
                    ctype = rng.choices(["M", "A", "D"], weights=[80, 15, 5])[0]
                    if ctype == "A":
                        removed = 0
                    elif ctype == "D":
                        added = 0
                file_rows.append((sha, repo_id, path, added, removed, ctype,
                                  is_binary, _counts_churn(path)))

    execute_values(
        cur,
        """
        INSERT INTO git_commit (sha, repo_id, author_name, author_email, authored_at, subject)
        VALUES %s
        ON CONFLICT (sha) DO UPDATE SET
            author_name = EXCLUDED.author_name, author_email = EXCLUDED.author_email,
            authored_at = EXCLUDED.authored_at, subject = EXCLUDED.subject
        """,
        commit_rows, page_size=500,
    )
    counts["commits"] = len(commit_rows)

    execute_values(
        cur,
        """
        INSERT INTO commit_file
            (sha, repo_id, path, lines_added, lines_removed, change_type, is_binary, counts_churn)
        VALUES %s
        ON CONFLICT (sha, path) DO UPDATE SET
            lines_added = EXCLUDED.lines_added, lines_removed = EXCLUDED.lines_removed,
            change_type = EXCLUDED.change_type, is_binary = EXCLUDED.is_binary,
            counts_churn = EXCLUDED.counts_churn
        """,
        file_rows, page_size=1000,
    )
    counts["files"] = len(file_rows)

    # ---- trackers ----
    tracker_ids: Dict[int, int] = {}
    for tr in TRACKERS:
        cur.execute(
            """
            INSERT INTO tracker (tuleap_tracker_id, name, status_field, open_value_ids, assignee_field)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (tuleap_tracker_id) DO UPDATE SET
                name = EXCLUDED.name, status_field = EXCLUDED.status_field,
                open_value_ids = EXCLUDED.open_value_ids, assignee_field = EXCLUDED.assignee_field
            RETURNING id
            """,
            (tr["tuleap_id"], tr["name"], tr["status_field"],
             tr["open_value_ids"], tr["assignee_field"]),
        )
        tracker_ids[tr["tuleap_id"]] = cur.fetchone()[0]
        counts["trackers"] += 1

    # ---- artifacts ----
    art_rows = [
        (a["tuleap_id"], tracker_ids[a["tracker_tuleap_id"]], a["title"],
         a["submitted"], a["status"], a["assignee"], a["is_open"])
        for a in artifacts
    ]
    execute_values(
        cur,
        """
        INSERT INTO artifact
            (tuleap_artifact_id, tracker_id, title, submitted_at,
             current_status, current_assignee, is_open)
        VALUES %s
        ON CONFLICT (tuleap_artifact_id) DO UPDATE SET
            title = EXCLUDED.title, current_status = EXCLUDED.current_status,
            current_assignee = EXCLUDED.current_assignee, is_open = EXCLUDED.is_open
        """,
        art_rows, page_size=500,
    )
    counts["artifacts"] = len(art_rows)

    # map tuleap_artifact_id -> internal artifact.id
    cur.execute("SELECT tuleap_artifact_id, id FROM artifact")
    art_map = {r[0]: r[1] for r in cur.fetchall()}

    # ---- status events ----
    event_rows = [
        (art_map[aid], changeset_id, event_time, event_type)
        for (aid, changeset_id, event_time, event_type) in events
        if aid in art_map
    ]
    execute_values(
        cur,
        """
        INSERT INTO artifact_status_event (artifact_id, changeset_id, event_time, event_type)
        VALUES %s
        ON CONFLICT (artifact_id, changeset_id) DO NOTHING
        """,
        event_rows, page_size=1000,
    )
    counts["events"] = len(event_rows)

    # ---- cross-ref links ----
    link_rows = list({(sha, art_map[aid]) for (sha, aid) in pending_links if aid in art_map})
    if link_rows:
        execute_values(
            cur,
            """
            INSERT INTO commit_artifact_link (sha, artifact_id)
            VALUES %s ON CONFLICT (sha, artifact_id) DO NOTHING
            """,
            link_rows, page_size=1000,
        )
    counts["links"] = len(link_rows)

    conn.commit()
    return counts
