"""SQL query builders for the read-only API.

All time bucketing is done in Europe/Paris with ISO weeks (Mon start).
Metrics:
  commits — COUNT(DISTINCT sha)
  churn   — SUM(lines_added + lines_removed) WHERE counts_churn
  files   — COUNT(*) file rows (every touched file, churn-excluded or not)

Path semantics: every git view addresses files by their *full path*
"<repo>/<path-in-repo>", so the first tree level is the repository. When
`group == 'zone'` the full path gains a zone prefix "<zone>/<repo>/<path>":
a file belongs to the FIRST zone whose directory list matches any segment of
its full path (else "Other"), mirroring the UI's zone configuration.
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

REPO_PATH = "(r.name || '/' || cf.path)"


def metric_expr(metric: str) -> str:
    return METRIC_SQL.get(metric, METRIC_SQL["commits"])


def bucket_expr(bucket: str, col: str = "c.authored_at") -> str:
    unit = "month" if bucket == "month" else "week"
    return f"date_trunc('{unit}', ({col} AT TIME ZONE '{TZ}'))"


def like_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


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


def zone_case(params: dict, zones: Optional[list], full_col: str = REPO_PATH) -> str:
    """First zone whose dirs match any path segment; else 'Other'."""
    whens = []
    for i, z in enumerate(zones or []):
        dirs = [d for d in (z.get("dirs") or []) if d]
        name = (z.get("name") or "").strip()
        if not dirs or not name:
            continue
        params[f"z{i}_dirs"] = dirs
        params[f"z{i}_name"] = name
        whens.append(
            f"WHEN string_to_array({full_col}, '/') && %(z{i}_dirs)s::text[] THEN %(z{i}_name)s::text"
        )
    if not whens:
        return "'Other'::text"
    return "CASE " + " ".join(whens) + " ELSE 'Other'::text END"


def full_path_expr(params: dict, group: str, zones: Optional[list]) -> str:
    if group == "zone":
        zc = zone_case(params, zones)
        return f"({zc} || '/' || {REPO_PATH})"
    return REPO_PATH


def _git_from(params: dict, repo_ids, frm, to) -> str:
    return f"""
        FROM commit_file cf
        JOIN git_commit c ON c.sha = cf.sha
        JOIN repo r ON r.id = cf.repo_id
        WHERE 1=1
          {_repo_filter(params, repo_ids)}
          {_time_filter(params, frm, to)}
    """


def _path_filter(params: dict, full: str, path_prefix: Optional[str]) -> str:
    if not path_prefix:
        return ""
    params["prefix_like"] = like_escape(path_prefix) + "%"
    return f" AND {full} LIKE %(prefix_like)s ESCAPE '\\'"


# ----------------------------------------------------------------- git ----

def q_tree(metric: str, repo_ids, frm, to, path_prefix: str, group: str, zones):
    """Aggregate one level below `path_prefix` for a treemap drill-down."""
    params: dict = {}
    full = full_path_expr(params, group, zones)
    prefix = path_prefix or ""
    params["prefix"] = prefix
    sql = f"""
        WITH scoped AS (
            SELECT cf.sha, cf.counts_churn, cf.lines_added, cf.lines_removed,
                   substr({full}, char_length(%(prefix)s) + 1) AS remainder
            {_git_from(params, repo_ids, frm, to)}
            {_path_filter(params, full, prefix)}
        )
        SELECT
            split_part(remainder, '/', 1) AS name,
            (position('/' in remainder) = 0) AS is_leaf,
            COUNT(DISTINCT sha) AS commits,
            SUM(CASE WHEN counts_churn THEN lines_added + lines_removed ELSE 0 END) AS churn,
            COUNT(*) AS files
        FROM scoped
        GROUP BY name, is_leaf
        HAVING split_part(remainder, '/', 1) <> ''
        ORDER BY commits DESC NULLS LAST
    """
    return sql, params


def q_tree_total(repo_ids, frm, to, path_prefix: str, group: str, zones):
    """Aggregates of the node at `path_prefix` itself (distinct-commit-true)."""
    params: dict = {}
    full = full_path_expr(params, group, zones)
    sql = f"""
        SELECT COUNT(DISTINCT cf.sha) AS commits,
               SUM(CASE WHEN cf.counts_churn THEN cf.lines_added + cf.lines_removed ELSE 0 END) AS churn,
               COUNT(*) AS files
        {_git_from(params, repo_ids, frm, to)}
        {_path_filter(params, full, path_prefix)}
    """
    return sql, params


def q_contributors(metric: str, repo_ids, frm, to, path_prefix, group: str, zones):
    params: dict = {}
    m = metric_expr(metric)
    full = full_path_expr(params, group, zones)
    sql = f"""
        SELECT c.author_name AS author, {m} AS value
        {_git_from(params, repo_ids, frm, to)}
        {_path_filter(params, full, path_prefix)}
        GROUP BY c.author_name
        ORDER BY value DESC NULLS LAST
        LIMIT 100
    """
    return sql, params


def q_timeseries(metric: str, bucket: str, repo_ids, frm, to, path_prefix,
                 group: str, zones, series: Optional[str]):
    """Per-bucket totals, optionally split by a series key:
    series = 'part'   → first path segment below path_prefix
             'author' → committer
             'zone'   → configured zone (ignores group/path zone prefixing)
             None     → single series
    """
    params: dict = {}
    m = metric_expr(metric)
    b = bucket_expr(bucket)
    full = full_path_expr(params, group, zones)
    key = None
    if series == "part":
        params["prefix"] = path_prefix or ""
        key = f"split_part(substr({full}, char_length(%(prefix)s) + 1), '/', 1)"
    elif series == "author":
        key = "c.author_name"
    elif series == "zone":
        key = zone_case(params, zones)
    key_sel = f"{key} AS key," if key else ""
    key_grp = "key," if key else ""
    sql = f"""
        SELECT {key_sel} {b} AS bucket, {m} AS value
        {_git_from(params, repo_ids, frm, to)}
        {_path_filter(params, full, path_prefix)}
        GROUP BY {key_grp} bucket
        ORDER BY {key_grp} bucket
    """
    return sql, params


def q_mix(metric: str, repo_ids, frm, to, path_prefix, group: str, zones):
    """Per committer, value split by first path segment below path_prefix."""
    params: dict = {}
    m = metric_expr(metric)
    full = full_path_expr(params, group, zones)
    params["prefix"] = path_prefix or ""
    part = f"split_part(substr({full}, char_length(%(prefix)s) + 1), '/', 1)"
    sql = f"""
        SELECT c.author_name AS author, {part} AS part, {m} AS value
        {_git_from(params, repo_ids, frm, to)}
        {_path_filter(params, full, path_prefix)}
        GROUP BY author, part
        HAVING {part} <> ''
        ORDER BY author, value DESC NULLS LAST
    """
    return sql, params


def q_punchcard(metric: str, repo_ids, frm, to, path_prefix, group: str, zones):
    """weekday (0=Mon) × hour-of-day grid in Europe/Paris."""
    params: dict = {}
    m = metric_expr(metric)
    full = full_path_expr(params, group, zones)
    local = f"(c.authored_at AT TIME ZONE '{TZ}')"
    sql = f"""
        SELECT (EXTRACT(isodow FROM {local})::int - 1) AS dow,
               EXTRACT(hour FROM {local})::int AS hour,
               {m} AS value
        {_git_from(params, repo_ids, frm, to)}
        {_path_filter(params, full, path_prefix)}
        GROUP BY dow, hour
        ORDER BY dow, hour
    """
    return sql, params


def q_codefrequency(bucket: str, repo_ids, frm, to, path_prefix, group: str, zones):
    """Lines added / removed per bucket (always churn-based)."""
    params: dict = {}
    b = bucket_expr(bucket)
    full = full_path_expr(params, group, zones)
    sql = f"""
        SELECT {b} AS bucket,
               SUM(CASE WHEN cf.counts_churn THEN cf.lines_added ELSE 0 END) AS additions,
               SUM(CASE WHEN cf.counts_churn THEN cf.lines_removed ELSE 0 END) AS deletions
        {_git_from(params, repo_ids, frm, to)}
        {_path_filter(params, full, path_prefix)}
        GROUP BY bucket
        ORDER BY bucket
    """
    return sql, params


def q_topfiles(metric: str, repo_ids, frm, to, path_prefix, group: str, zones, limit: int):
    """Top leaf files under path_prefix. Returned path is always repo-rooted."""
    params: dict = {}
    m = metric_expr(metric)
    full = full_path_expr(params, group, zones)
    params["limit"] = limit
    sql = f"""
        SELECT {REPO_PATH} AS path, {m} AS value, COUNT(DISTINCT cf.sha) AS commits
        {_git_from(params, repo_ids, frm, to)}
        {_path_filter(params, full, path_prefix)}
        GROUP BY r.name, cf.path
        ORDER BY value DESC NULLS LAST
        LIMIT %(limit)s
    """
    return sql, params


# -------------------------------------------------------------- trackers ----

def _tracker_filter(params: dict, tracker_ids, col="a.tracker_id") -> str:
    if tracker_ids:
        params["tracker_ids"] = tuple(tracker_ids)
        return f" AND {col} IN %(tracker_ids)s"
    return ""


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
    tr = _tracker_filter(params, tracker_ids)
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
    tr = _tracker_filter(params, tracker_ids)
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


def q_open_tickets(tracker_ids):
    """Every currently-open artifact, oldest first, with linked-commit count."""
    params: dict = {}
    tr = _tracker_filter(params, tracker_ids)
    sql = f"""
        SELECT a.tuleap_artifact_id, a.title, a.current_status AS status,
               a.current_assignee AS assignee, a.submitted_at,
               t.tuleap_tracker_id, t.name AS tracker_name,
               EXTRACT(EPOCH FROM (now() - a.submitted_at)) / 86400.0 AS age_days,
               COUNT(l.sha) AS linked_commits
        FROM artifact a
        JOIN tracker t ON t.id = a.tracker_id
        LEFT JOIN commit_artifact_link l ON l.artifact_id = a.id
        WHERE a.is_open IS TRUE {tr}
        GROUP BY a.id, t.id
        ORDER BY age_days DESC
    """
    return sql, params


def q_recent_artifacts(tracker_ids, limit: int):
    """Latest-activity artifacts with linked-commit counts."""
    params: dict = {"limit": limit}
    tr = _tracker_filter(params, tracker_ids)
    sql = f"""
        SELECT a.tuleap_artifact_id, a.title, a.current_status AS status,
               a.current_assignee AS assignee, a.submitted_at, a.is_open,
               t.tuleap_tracker_id, t.name AS tracker_name,
               EXTRACT(EPOCH FROM (now() - a.submitted_at)) / 86400.0 AS age_days,
               COUNT(DISTINCT l.sha) AS linked_commits,
               GREATEST(a.submitted_at, MAX(e.event_time), MAX(gc.authored_at)) AS last_activity
        FROM artifact a
        JOIN tracker t ON t.id = a.tracker_id
        LEFT JOIN artifact_status_event e ON e.artifact_id = a.id
        LEFT JOIN commit_artifact_link l ON l.artifact_id = a.id
        LEFT JOIN git_commit gc ON gc.sha = l.sha
        WHERE 1=1 {tr}
        GROUP BY a.id, t.id
        ORDER BY COUNT(DISTINCT l.sha) > 0 DESC, last_activity DESC
        LIMIT %(limit)s
    """
    return sql, params


def q_open_by_zone(tracker_ids, zones):
    """Open/closed artifact counts per (zone × tracker). An artifact's zone is
    the most common zone among the files touched by its linked commits;
    artifacts with no linked commits fall into 'Unlinked'."""
    params: dict = {}
    zc = zone_case(params, zones)
    tr = _tracker_filter(params, tracker_ids)
    sql = f"""
        WITH file_zones AS (
            SELECT l.artifact_id, {zc} AS zone
            FROM commit_artifact_link l
            JOIN commit_file cf ON cf.sha = l.sha
            JOIN repo r ON r.id = cf.repo_id
        ),
        art_zone AS (
            SELECT artifact_id, mode() WITHIN GROUP (ORDER BY zone) AS zone
            FROM file_zones
            GROUP BY artifact_id
        )
        SELECT COALESCE(az.zone, 'Unlinked') AS zone, t.tuleap_tracker_id,
               t.name AS tracker_name,
               COUNT(*) FILTER (WHERE a.is_open IS TRUE) AS open,
               COUNT(*) FILTER (WHERE a.is_open IS NOT TRUE) AS closed
        FROM artifact a
        JOIN tracker t ON t.id = a.tracker_id
        LEFT JOIN art_zone az ON az.artifact_id = a.id
        WHERE 1=1 {tr}
        GROUP BY zone, t.tuleap_tracker_id, t.name
        ORDER BY zone
    """
    return sql, params
