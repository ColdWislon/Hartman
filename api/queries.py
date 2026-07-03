"""SQL query builders for the read-only API.

All time bucketing is done in Europe/Paris with ISO weeks (Mon start).
Metrics:
  commits — COUNT(DISTINCT sha)
  churn   — SUM(lines_added + lines_removed) WHERE counts_churn
  files   — COUNT(*) file rows (every touched file, churn-excluded or not)
"""
from __future__ import annotations

from typing import List, Optional

TZ = "Europe/Paris"

# metric name -> SQL aggregate expression over commit_file cf / git_commit c
METRIC_SQL = {
    "commits": "COUNT(DISTINCT cf.sha)",
    "churn": "SUM(CASE WHEN cf.counts_churn THEN cf.lines_added + cf.lines_removed ELSE 0 END)",
    "files": "COUNT(*)",
}


def metric_expr(metric: str) -> str:
    return METRIC_SQL.get(metric, METRIC_SQL["commits"])


def bucket_expr(bucket: str, col: str = "c.authored_at") -> str:
    unit = "month" if bucket == "month" else "week"
    return f"date_trunc('{unit}', ({col} AT TIME ZONE '{TZ}'))"


def _time_filter(params: dict, frm: Optional[str], to: Optional[str], col="c.authored_at") -> str:
    clauses = []
    if frm:
        clauses.append(f"{col} >= %(frm)s")
        params["frm"] = frm
    if to:
        clauses.append(f"{col} < %(to)s")
        params["to"] = to
    return (" AND " + " AND ".join(clauses)) if clauses else ""


def _repo_filter(params: dict, repo_ids: Optional[List[int]], col="cf.repo_id") -> str:
    if repo_ids:
        params["repo_ids"] = tuple(repo_ids)
        return f" AND {col} IN %(repo_ids)s"
    return ""


# ----------------------------------------------------------------- git ----

def q_tree(metric: str, repo_ids, frm, to, path_prefix: str):
    """Aggregate one level below `path_prefix` for a treemap drill-down."""
    params: dict = {}
    m = metric_expr(metric)
    prefix = path_prefix or ""
    params["prefix"] = prefix
    params["prefix_like"] = prefix + "%"
    # remainder after the prefix; first segment is the child node.
    sql = f"""
        WITH scoped AS (
            SELECT cf.*, cf.sha AS _sha,
                   substr(cf.path, char_length(%(prefix)s) + 1) AS remainder
            FROM commit_file cf
            JOIN git_commit c ON c.sha = cf.sha
            WHERE cf.path LIKE %(prefix_like)s
              {_repo_filter(params, repo_ids)}
              {_time_filter(params, frm, to)}
        )
        SELECT
            split_part(remainder, '/', 1) AS name,
            (position('/' in remainder) = 0) AS is_leaf,
            {m.replace('cf.', '')} AS value,
            COUNT(DISTINCT _sha) AS commits
        FROM scoped
        GROUP BY name, is_leaf
        HAVING split_part(remainder, '/', 1) <> ''
        ORDER BY value DESC NULLS LAST
    """
    return sql, params


def q_contributors(metric: str, repo_ids, frm, to, path_prefix: Optional[str]):
    params: dict = {}
    m = metric_expr(metric)
    path_clause = ""
    if path_prefix:
        params["prefix_like"] = path_prefix + "%"
        path_clause = " AND cf.path LIKE %(prefix_like)s"
    sql = f"""
        SELECT c.author_name AS author, c.author_email AS email,
               {m} AS value
        FROM commit_file cf
        JOIN git_commit c ON c.sha = cf.sha
        WHERE 1=1
          {_repo_filter(params, repo_ids)}
          {_time_filter(params, frm, to)}
          {path_clause}
        GROUP BY c.author_name, c.author_email
        ORDER BY value DESC NULLS LAST
        LIMIT 100
    """
    return sql, params


def q_timeseries(metric: str, bucket: str, repo_ids, frm, to, path_prefix: Optional[str]):
    params: dict = {}
    m = metric_expr(metric)
    b = bucket_expr(bucket)
    path_clause = ""
    if path_prefix:
        params["prefix_like"] = path_prefix + "%"
        path_clause = " AND cf.path LIKE %(prefix_like)s"
    sql = f"""
        SELECT {b} AS bucket, {m} AS value
        FROM commit_file cf
        JOIN git_commit c ON c.sha = cf.sha
        WHERE 1=1
          {_repo_filter(params, repo_ids)}
          {_time_filter(params, frm, to)}
          {path_clause}
        GROUP BY bucket
        ORDER BY bucket
    """
    return sql, params


# -------------------------------------------------------------- trackers ----

def q_backlog(bucket: str, tracker_ids, frm, to):
    """Open-count per bucket from the daily_backlog materialized view."""
    params: dict = {}
    unit = "month" if bucket == "month" else "week"
    b = f"date_trunc('{unit}', db.day::timestamp)"
    tr = ""
    if tracker_ids:
        params["tracker_ids"] = tuple(tracker_ids)
        tr = " AND db.tracker_id IN %(tracker_ids)s"
    time_clause = ""
    if frm:
        params["frm"] = frm
        time_clause += " AND db.day >= %(frm)s"
    if to:
        params["to"] = to
        time_clause += " AND db.day < %(to)s"
    # For each bucket, use the last day's open_count (end-of-period snapshot),
    # summed across selected trackers.
    sql = f"""
        WITH per_tracker AS (
            SELECT db.tracker_id, {b} AS bucket, db.day,
                   db.open_count,
                   ROW_NUMBER() OVER (PARTITION BY db.tracker_id, {b} ORDER BY db.day DESC) AS rn
            FROM daily_backlog db
            WHERE 1=1 {tr} {time_clause}
        )
        SELECT bucket, SUM(open_count) AS open_count
        FROM per_tracker
        WHERE rn = 1
        GROUP BY bucket
        ORDER BY bucket
    """
    return sql, params


def q_throughput(bucket: str, tracker_ids, frm, to):
    """Opened vs closed events per bucket."""
    params: dict = {}
    unit = "month" if bucket == "month" else "week"
    b = f"date_trunc('{unit}', (e.event_time AT TIME ZONE '{TZ}'))"
    tr = ""
    if tracker_ids:
        params["tracker_ids"] = tuple(tracker_ids)
        tr = " AND a.tracker_id IN %(tracker_ids)s"
    time_clause = ""
    if frm:
        params["frm"] = frm
        time_clause += " AND e.event_time >= %(frm)s"
    if to:
        params["to"] = to
        time_clause += " AND e.event_time < %(to)s"
    sql = f"""
        SELECT {b} AS bucket,
               SUM(CASE WHEN e.event_type IN ('open','reopen') THEN 1 ELSE 0 END) AS opened,
               SUM(CASE WHEN e.event_type = 'close' THEN 1 ELSE 0 END) AS closed
        FROM artifact_status_event e
        JOIN artifact a ON a.id = e.artifact_id
        WHERE 1=1 {tr} {time_clause}
        GROUP BY bucket
        ORDER BY bucket
    """
    return sql, params


def q_cycletime(tracker_ids, by_assignee: bool):
    """Median time-to-close + age distribution of still-open artifacts.

    Time-to-close is measured per artifact as (first close - submitted_at)
    for artifacts currently closed; age is (now - submitted_at) for open ones.
    """
    params: dict = {}
    tr = ""
    if tracker_ids:
        params["tracker_ids"] = tuple(tracker_ids)
        tr = " AND a.tracker_id IN %(tracker_ids)s"
    group_col = "COALESCE(a.current_assignee, '(unassigned)')" if by_assignee else "'all'"
    sql = f"""
        WITH first_close AS (
            SELECT artifact_id, MIN(event_time) AS closed_at
            FROM artifact_status_event
            WHERE event_type = 'close'
            GROUP BY artifact_id
        )
        SELECT
            {group_col} AS assignee,
            percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (fc.closed_at - a.submitted_at)) / 86400.0
            ) FILTER (WHERE fc.closed_at IS NOT NULL AND a.is_open IS NOT TRUE)
                AS median_days_to_close,
            percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (now() - a.submitted_at)) / 86400.0
            ) FILTER (WHERE a.is_open IS TRUE)
                AS median_open_age_days,
            COUNT(*) FILTER (WHERE a.is_open IS TRUE) AS open_count,
            COUNT(*) FILTER (WHERE a.is_open IS NOT TRUE AND fc.closed_at IS NOT NULL) AS closed_count
        FROM artifact a
        LEFT JOIN first_close fc ON fc.artifact_id = a.id
        WHERE 1=1 {tr}
        GROUP BY assignee
        ORDER BY open_count DESC
    """
    return sql, params
