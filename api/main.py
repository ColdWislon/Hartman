"""FastAPI read-only JSON API over Postgres.

Global query params (where sensible):
  repo    comma-separated repo names (default: all)
  from    ISO date/datetime lower bound (inclusive)
  to      ISO date/datetime upper bound (exclusive)
  bucket  week | month  (default week; ISO weeks in Europe/Paris)
  metric  commits | churn | files  (default commits)
"""
from __future__ import annotations

import json
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

def parse_zones(zones: Optional[str]) -> Optional[list]:
    if not zones:
        return None
    try:
        parsed = json.loads(zones)
        return parsed if isinstance(parsed, list) else None
    except ValueError:
        return None


@app.get("/api/activity/tree")
def activity_tree(
    repo: Optional[str] = None,
    metric: str = Query("commits"),
    path: str = Query(""),
    group: str = Query("repo"),
    zones: Optional[str] = None,
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_tree(metric, repo_ids, frm, to, path, group, parse_zones(zones))
    rows = fetch(sql, params)
    tsql, tparams = queries.q_tree_total(repo_ids, frm, to, path, group, parse_zones(zones))
    trow = fetch(tsql, tparams)[0]
    metric_key = metric if metric in ("commits", "churn", "files") else "commits"
    return {
        "path": path,
        "metric": metric,
        "total": int(trow[metric_key] or 0),
        "children": [
            {
                "name": r["name"],
                "is_leaf": r["is_leaf"],
                "value": int(r[metric_key] or 0),
                "commits": int(r["commits"] or 0),
                "churn": int(r["churn"] or 0),
                "files": int(r["files"] or 0),
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
    group: str = Query("repo"),
    zones: Optional[str] = None,
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_contributors(metric, repo_ids, frm, to, path, group, parse_zones(zones))
    rows = fetch(sql, params)
    return [{"author": r["author"], "value": int(r["value"] or 0)} for r in rows]


@app.get("/api/activity/timeseries")
def activity_timeseries(
    repo: Optional[str] = None,
    metric: str = Query("commits"),
    bucket: str = Query("week"),
    path: Optional[str] = None,
    group: str = Query("repo"),
    zones: Optional[str] = None,
    series: Optional[str] = None,
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_timeseries(
        metric, bucket, repo_ids, frm, to, path, group, parse_zones(zones), series
    )
    rows = fetch(sql, params)
    out = []
    for r in rows:
        item = {
            "bucket": r["bucket"].isoformat() if r["bucket"] else None,
            "value": int(r["value"] or 0),
        }
        if "key" in r:
            item["key"] = r["key"]
        out.append(item)
    return out


@app.get("/api/activity/mix")
def activity_mix(
    repo: Optional[str] = None,
    metric: str = Query("commits"),
    path: Optional[str] = None,
    group: str = Query("repo"),
    zones: Optional[str] = None,
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_mix(metric, repo_ids, frm, to, path, group, parse_zones(zones))
    rows = fetch(sql, params)
    return [
        {"author": r["author"], "part": r["part"], "value": int(r["value"] or 0)}
        for r in rows
    ]


@app.get("/api/activity/punchcard")
def activity_punchcard(
    repo: Optional[str] = None,
    metric: str = Query("commits"),
    path: Optional[str] = None,
    group: str = Query("repo"),
    zones: Optional[str] = None,
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_punchcard(metric, repo_ids, frm, to, path, group, parse_zones(zones))
    rows = fetch(sql, params)
    return [
        {"dow": int(r["dow"]), "hour": int(r["hour"]), "value": int(r["value"] or 0)}
        for r in rows
    ]


@app.get("/api/activity/codefrequency")
def activity_codefrequency(
    repo: Optional[str] = None,
    bucket: str = Query("week"),
    path: Optional[str] = None,
    group: str = Query("repo"),
    zones: Optional[str] = None,
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_codefrequency(bucket, repo_ids, frm, to, path, group, parse_zones(zones))
    rows = fetch(sql, params)
    return [
        {
            "bucket": r["bucket"].isoformat() if r["bucket"] else None,
            "additions": int(r["additions"] or 0),
            "deletions": int(r["deletions"] or 0),
        }
        for r in rows
    ]


@app.get("/api/activity/topfiles")
def activity_topfiles(
    repo: Optional[str] = None,
    metric: str = Query("commits"),
    path: Optional[str] = None,
    group: str = Query("repo"),
    zones: Optional[str] = None,
    limit: int = Query(8, ge=1, le=100),
    frm: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    repo_ids = resolve_repo_ids(repo)
    sql, params = queries.q_topfiles(
        metric, repo_ids, frm, to, path, group, parse_zones(zones), limit
    )
    rows = fetch(sql, params)
    return [
        {"path": r["path"], "value": int(r["value"] or 0), "commits": int(r["commits"] or 0)}
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


@app.get("/api/tickets/open")
def tickets_open(tracker: Optional[str] = None):
    tracker_ids = resolve_tracker_ids(tracker)
    sql, params = queries.q_open_tickets(tracker_ids)
    rows = fetch(sql, params)
    return [
        {
            "artifact_id": r["tuleap_artifact_id"],
            "tracker_id": r["tuleap_tracker_id"],
            "tracker": r["tracker_name"],
            "title": r["title"],
            "status": r["status"],
            "assignee": r["assignee"],
            "submitted_at": r["submitted_at"].isoformat() if r["submitted_at"] else None,
            "age_days": round(float(r["age_days"] or 0), 1),
            "linked_commits": int(r["linked_commits"] or 0),
            "artifact_url": _artifact_url(r["tuleap_artifact_id"]),
        }
        for r in rows
    ]


@app.get("/api/tickets/recent")
def tickets_recent(tracker: Optional[str] = None, limit: int = Query(8, ge=1, le=100)):
    tracker_ids = resolve_tracker_ids(tracker)
    sql, params = queries.q_recent_artifacts(tracker_ids, limit)
    rows = fetch(sql, params)
    return [
        {
            "artifact_id": r["tuleap_artifact_id"],
            "tracker_id": r["tuleap_tracker_id"],
            "tracker": r["tracker_name"],
            "title": r["title"],
            "status": r["status"],
            "assignee": r["assignee"],
            "is_open": bool(r["is_open"]),
            "age_days": round(float(r["age_days"] or 0), 1),
            "linked_commits": int(r["linked_commits"] or 0),
            "last_activity": r["last_activity"].isoformat() if r["last_activity"] else None,
            "artifact_url": _artifact_url(r["tuleap_artifact_id"]),
        }
        for r in rows
    ]


@app.get("/api/tickets/open_by_zone")
def tickets_open_by_zone(tracker: Optional[str] = None, zones: Optional[str] = None):
    tracker_ids = resolve_tracker_ids(tracker)
    sql, params = queries.q_open_by_zone(tracker_ids, parse_zones(zones))
    rows = fetch(sql, params)
    return [
        {
            "zone": r["zone"],
            "tracker_id": r["tuleap_tracker_id"],
            "tracker": r["tracker_name"],
            "open": int(r["open"] or 0),
            "closed": int(r["closed"] or 0),
        }
        for r in rows
    ]


# ------------------------------------------------------------- cross-links ----

def _artifact_url(tuleap_artifact_id: int) -> str:
    return f"{TULEAP_BASE}/plugins/tracker/?aid={tuleap_artifact_id}"


@app.get("/api/tickets/{tuleap_artifact_id}/commits")
def ticket_commits(tuleap_artifact_id: int):
    meta = fetch(
        """
        SELECT a.title, a.current_status, a.current_assignee, a.submitted_at,
               a.is_open, t.name AS tracker_name, t.tuleap_tracker_id,
               EXTRACT(EPOCH FROM (now() - a.submitted_at)) / 86400.0 AS age_days
        FROM artifact a JOIN tracker t ON t.id = a.tracker_id
        WHERE a.tuleap_artifact_id = %(aid)s
        """,
        {"aid": tuleap_artifact_id},
    )
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
    a = meta[0] if meta else {}
    return {
        "artifact_id": tuleap_artifact_id,
        "artifact_url": _artifact_url(tuleap_artifact_id),
        "tracker": a.get("tracker_name"),
        "tracker_id": a.get("tuleap_tracker_id"),
        "title": a.get("title"),
        "status": a.get("current_status"),
        "assignee": a.get("current_assignee"),
        "is_open": a.get("is_open"),
        "submitted_at": a["submitted_at"].isoformat() if a.get("submitted_at") else None,
        "age_days": round(float(a["age_days"]), 1) if a.get("age_days") is not None else None,
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
    meta = fetch(
        """
        SELECT gc.sha, gc.subject, gc.author_name, gc.authored_at,
               r.name AS repo, r.clone_url
        FROM git_commit gc JOIN repo r ON r.id = gc.repo_id
        WHERE gc.sha = %(sha)s
        """,
        {"sha": sha},
    )
    rows = fetch(
        """
        SELECT a.tuleap_artifact_id, a.title, a.current_status, a.current_assignee,
               t.name AS tracker_name, t.tuleap_tracker_id
        FROM commit_artifact_link l
        JOIN artifact a ON a.id = l.artifact_id
        JOIN tracker t ON t.id = a.tracker_id
        WHERE l.sha = %(sha)s
        ORDER BY a.tuleap_artifact_id
        """,
        {"sha": sha},
    )
    c = meta[0] if meta else {}
    return {
        "sha": sha,
        "subject": c.get("subject"),
        "author": c.get("author_name"),
        "authored_at": c["authored_at"].isoformat() if c.get("authored_at") else None,
        "repo": c.get("repo"),
        "commit_url": _commit_url(c["clone_url"], sha) if c.get("clone_url") else None,
        "tickets": [
            {
                "artifact_id": r["tuleap_artifact_id"],
                "tracker": r["tracker_name"],
                "tracker_id": r["tuleap_tracker_id"],
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
