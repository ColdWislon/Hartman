"""FastAPI read-only JSON API over Postgres.

Global query params (where sensible):
  repo    comma-separated repo names (default: all)
  from    ISO date/datetime lower bound (inclusive)
  to      ISO date/datetime upper bound (exclusive)
  bucket  week | month  (default week; ISO weeks in Europe/Paris)
  metric  commits | churn | files  (default commits)
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from typing import List, Optional

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.pool import SimpleConnectionPool

from . import queries

DSN = os.environ.get("DATABASE_URL", "postgresql://monitor:monitor@localhost:5432/monitor")
TULEAP_BASE = os.environ.get("TULEAP_BASE_URL", "https://tuleap.example.com").rstrip("/")

app = FastAPI(title="Git + Tuleap Activity Monitor API", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

_pool: Optional[SimpleConnectionPool] = None


def get_pool() -> SimpleConnectionPool:
    global _pool
    if _pool is None:
        _pool = SimpleConnectionPool(1, 8, dsn=DSN)
    return _pool


@contextmanager
def cursor():
    pool = get_pool()
    conn = pool.getconn()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        yield cur
        conn.commit()
    finally:
        pool.putconn(conn)


def fetch(sql: str, params: dict) -> List[dict]:
    with cursor() as cur:
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


def resolve_repo_ids(repo: Optional[str]) -> Optional[List[int]]:
    if not repo:
        return None
    names = [r.strip() for r in repo.split(",") if r.strip()]
    if not names:
        return None
    rows = fetch("SELECT id FROM repo WHERE name = ANY(%(names)s)", {"names": names})
    return [r["id"] for r in rows] or [-1]


def resolve_tracker_ids(tracker: Optional[str]) -> Optional[List[int]]:
    """Map comma-separated tuleap_tracker_id list to internal tracker.id."""
    if not tracker:
        return None
    ids = [int(t) for t in tracker.split(",") if t.strip()]
    if not ids:
        return None
    rows = fetch("SELECT id FROM tracker WHERE tuleap_tracker_id = ANY(%(ids)s)", {"ids": ids})
    return [r["id"] for r in rows] or [-1]


# ------------------------------------------------------------------ meta ----

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/repos")
def list_repos():
    return fetch(
        "SELECT id, name, default_branch, last_ingested_sha FROM repo ORDER BY name", {}
    )


@app.get("/api/trackers")
def list_trackers():
    return fetch(
        """SELECT id, tuleap_tracker_id, name, status_field, assignee_field
           FROM tracker ORDER BY tuleap_tracker_id""", {}
    )


# --------------------------------------------------------------- git views ----

@app.get("/api/activity/tree")
def activity_tree(
    repo: Optional[str] = None,
    metric: str = Query("commits"),
    path: str = Query(""),
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_tree(metric, repo_ids, frm, to, path)
    rows = fetch(sql, params)
    return {
        "path": path,
        "metric": metric,
        "children": [
            {
                "name": r["name"],
                "is_leaf": r["is_leaf"],
                "value": int(r["value"] or 0),
                "commits": int(r["commits"] or 0),
                "path": (path + r["name"]) if r["is_leaf"] else (path + r["name"] + "/"),
            }
            for r in rows
        ],
    }


@app.get("/api/activity/contributors")
def activity_contributors(
    repo: Optional[str] = None,
    metric: str = Query("commits"),
    path: Optional[str] = None,
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_contributors(metric, repo_ids, frm, to, path)
    rows = fetch(sql, params)
    return [
        {"author": r["author"], "email": r["email"], "value": int(r["value"] or 0)}
        for r in rows
    ]


@app.get("/api/activity/timeseries")
def activity_timeseries(
    repo: Optional[str] = None,
    metric: str = Query("commits"),
    bucket: str = Query("week"),
    path: Optional[str] = None,
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_timeseries(metric, bucket, repo_ids, frm, to, path)
    rows = fetch(sql, params)
    return [
        {"bucket": r["bucket"].isoformat() if r["bucket"] else None, "value": int(r["value"] or 0)}
        for r in rows
    ]


# ----------------------------------------------------------- tracker views ----

@app.get("/api/tickets/backlog")
def tickets_backlog(
    tracker: Optional[str] = None,
    bucket: str = Query("week"),
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    tracker_ids = resolve_tracker_ids(tracker)
    sql, params = queries.q_backlog(bucket, tracker_ids, frm, to)
    rows = fetch(sql, params)
    return [
        {"bucket": r["bucket"].isoformat() if r["bucket"] else None,
         "open_count": int(r["open_count"] or 0)}
        for r in rows
    ]


@app.get("/api/tickets/throughput")
def tickets_throughput(
    tracker: Optional[str] = None,
    bucket: str = Query("week"),
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    tracker_ids = resolve_tracker_ids(tracker)
    sql, params = queries.q_throughput(bucket, tracker_ids, frm, to)
    rows = fetch(sql, params)
    return [
        {"bucket": r["bucket"].isoformat() if r["bucket"] else None,
         "opened": int(r["opened"] or 0), "closed": int(r["closed"] or 0)}
        for r in rows
    ]


@app.get("/api/tickets/cycletime")
def tickets_cycletime(
    tracker: Optional[str] = None,
    by: Optional[str] = None,
):
    tracker_ids = resolve_tracker_ids(tracker)
    by_assignee = (by == "assignee")
    sql, params = queries.q_cycletime(tracker_ids, by_assignee)
    rows = fetch(sql, params)
    return [
        {
            "assignee": r["assignee"],
            "median_days_to_close": float(r["median_days_to_close"]) if r["median_days_to_close"] is not None else None,
            "median_open_age_days": float(r["median_open_age_days"]) if r["median_open_age_days"] is not None else None,
            "open_count": int(r["open_count"] or 0),
            "closed_count": int(r["closed_count"] or 0),
        }
        for r in rows
    ]


# ------------------------------------------------------------- cross-links ----

def _artifact_url(tuleap_artifact_id: int) -> str:
    return f"{TULEAP_BASE}/plugins/tracker/?aid={tuleap_artifact_id}"


@app.get("/api/tickets/{tuleap_artifact_id}/commits")
def ticket_commits(tuleap_artifact_id: int):
    rows = fetch(
        """
        SELECT gc.sha, gc.subject, gc.author_name, gc.authored_at, r.name AS repo, r.clone_url
        FROM commit_artifact_link l
        JOIN artifact a ON a.id = l.artifact_id
        JOIN git_commit gc ON gc.sha = l.sha
        JOIN repo r ON r.id = gc.repo_id
        WHERE a.tuleap_artifact_id = %(aid)s
        ORDER BY gc.authored_at DESC
        """,
        {"aid": tuleap_artifact_id},
    )
    return {
        "artifact_id": tuleap_artifact_id,
        "artifact_url": _artifact_url(tuleap_artifact_id),
        "commits": [
            {
                "sha": r["sha"],
                "subject": r["subject"],
                "author": r["author_name"],
                "authored_at": r["authored_at"].isoformat() if r["authored_at"] else None,
                "repo": r["repo"],
                # base clone_url minus the .git → browse the commit in Tuleap's git plugin
                "commit_url": _commit_url(r["clone_url"], r["sha"]),
            }
            for r in rows
        ],
    }


@app.get("/api/commits/{sha}/tickets")
def commit_tickets(sha: str):
    rows = fetch(
        """
        SELECT a.tuleap_artifact_id, a.title, a.current_status, a.current_assignee
        FROM commit_artifact_link l
        JOIN artifact a ON a.id = l.artifact_id
        WHERE l.sha = %(sha)s
        ORDER BY a.tuleap_artifact_id
        """,
        {"sha": sha},
    )
    return {
        "sha": sha,
        "tickets": [
            {
                "artifact_id": r["tuleap_artifact_id"],
                "title": r["title"],
                "status": r["current_status"],
                "assignee": r["current_assignee"],
                "artifact_url": _artifact_url(r["tuleap_artifact_id"]),
            }
            for r in rows
        ],
    }


def _commit_url(clone_url: str, sha: str) -> str:
    # Tuleap git plugin commit view. clone_url like
    #   https://host/plugins/git/proj/repo.git  →  .../plugins/git/proj/repo?a=commit&h=<sha>
    base = clone_url[:-4] if clone_url.endswith(".git") else clone_url
    return f"{base}?a=commit&h={sha}"
