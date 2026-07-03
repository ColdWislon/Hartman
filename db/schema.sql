-- Git + Tuleap Activity Monitor — Postgres schema (v1)
--
-- Finest grain: one row per (file, commit) for git, one row per status event
-- for trackers. Every API view is a GROUP BY rollup over these fact tables, so
-- adding a new view never requires re-ingestion.

-- ============================================================ git ============

CREATE TABLE IF NOT EXISTS repo (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  clone_url         TEXT NOT NULL,
  default_branch    TEXT NOT NULL DEFAULT 'main',
  last_ingested_sha TEXT                     -- high-water mark for incremental fetch
);

CREATE TABLE IF NOT EXISTS git_commit (
  sha          TEXT PRIMARY KEY,
  repo_id      INT  NOT NULL REFERENCES repo(id),
  author_name  TEXT NOT NULL,               -- canonicalised via .mailmap
  author_email TEXT NOT NULL,               -- canonicalised via .mailmap
  authored_at  TIMESTAMPTZ NOT NULL,
  subject      TEXT
);
CREATE INDEX IF NOT EXISTS idx_git_commit_repo_time ON git_commit (repo_id, authored_at);
CREATE INDEX IF NOT EXISTS idx_git_commit_email     ON git_commit (author_email);

CREATE TABLE IF NOT EXISTS commit_file (
  id            BIGSERIAL PRIMARY KEY,
  sha           TEXT NOT NULL REFERENCES git_commit(sha),
  repo_id       INT  NOT NULL REFERENCES repo(id),
  path          TEXT NOT NULL,
  lines_added   INT  NOT NULL DEFAULT 0,
  lines_removed INT  NOT NULL DEFAULT 0,
  change_type   CHAR(1),                     -- A / M / D / R
  is_binary     BOOLEAN NOT NULL DEFAULT FALSE,
  counts_churn  BOOLEAN NOT NULL DEFAULT TRUE, -- FALSE if matched churn_exclude
  UNIQUE (sha, path)                         -- idempotent re-derivation
);
CREATE INDEX IF NOT EXISTS idx_commit_file_repo_path ON commit_file (repo_id, path);
CREATE INDEX IF NOT EXISTS idx_commit_file_sha       ON commit_file (sha);

-- ======================================================== trackers ===========

CREATE TABLE IF NOT EXISTS tracker (
  id                SERIAL PRIMARY KEY,
  tuleap_tracker_id INT NOT NULL UNIQUE,
  name              TEXT,
  status_field      TEXT,                    -- from the tracker's status semantic
  open_value_ids    INT[],                   -- value IDs that mean "open"
  assignee_field    TEXT,                    -- from the contributor semantic
  last_modified_hwm TIMESTAMPTZ              -- high-water mark for incremental sync
);

CREATE TABLE IF NOT EXISTS artifact (
  id                 SERIAL PRIMARY KEY,
  tuleap_artifact_id INT NOT NULL UNIQUE,
  tracker_id         INT NOT NULL REFERENCES tracker(id),
  title              TEXT,
  submitted_at       TIMESTAMPTZ NOT NULL,   -- creation = first OPEN event
  current_status     TEXT,
  current_assignee   TEXT,                   -- from the "contributor" semantic
  is_open            BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_artifact_tracker ON artifact (tracker_id);

CREATE TABLE IF NOT EXISTS artifact_status_event (
  id           BIGSERIAL PRIMARY KEY,
  artifact_id  INT  NOT NULL REFERENCES artifact(id),
  changeset_id INT  NOT NULL,
  event_time   TIMESTAMPTZ NOT NULL,
  event_type   TEXT NOT NULL,                -- open | close | reopen
  UNIQUE (artifact_id, changeset_id)         -- idempotent re-derivation
);
CREATE INDEX IF NOT EXISTS idx_status_event_artifact ON artifact_status_event (artifact_id, event_time);

-- ==================================================== git <-> ticket =========

CREATE TABLE IF NOT EXISTS commit_artifact_link (
  sha         TEXT NOT NULL REFERENCES git_commit(sha),
  artifact_id INT  NOT NULL REFERENCES artifact(id),
  PRIMARY KEY (sha, artifact_id)
);

-- ======================================================= rollups =============
-- Materialized views refreshed at the end of ingest for read speed. They are
-- pure rollups of the fact tables above and can be dropped/rebuilt any time.

-- Backlog: open-artifact count per tracker per day, derived from the event
-- stream. We expand each artifact's [open, close) intervals into daily rows.
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_backlog AS
WITH ordered AS (
  SELECT
    a.tracker_id,
    e.artifact_id,
    e.event_time,
    e.event_type,
    LEAD(e.event_time) OVER (PARTITION BY e.artifact_id ORDER BY e.event_time, e.changeset_id) AS next_time
  FROM artifact_status_event e
  JOIN artifact a ON a.id = e.artifact_id
),
intervals AS (
  -- an artifact is "open" from an open/reopen event until the next event (or now)
  SELECT
    tracker_id,
    artifact_id,
    date_trunc('day', event_time) AS open_day,
    date_trunc('day', COALESCE(next_time, now())) AS close_day
  FROM ordered
  WHERE event_type IN ('open', 'reopen')
),
days AS (
  SELECT
    tracker_id,
    artifact_id,
    generate_series(open_day, close_day, interval '1 day') AS day
  FROM intervals
)
SELECT tracker_id, day::date AS day, COUNT(DISTINCT artifact_id) AS open_count
FROM days
GROUP BY tracker_id, day::date;

CREATE INDEX IF NOT EXISTS idx_daily_backlog ON daily_backlog (tracker_id, day);

-- Path/period activity rollup for the treemap + timeseries.
CREATE MATERIALIZED VIEW IF NOT EXISTS activity_by_path_period AS
SELECT
  cf.repo_id,
  cf.path,
  date_trunc('week', c.authored_at AT TIME ZONE 'Europe/Paris') AS bucket,
  COUNT(DISTINCT cf.sha)                                        AS commits,
  SUM(CASE WHEN cf.counts_churn THEN cf.lines_added   ELSE 0 END) AS added,
  SUM(CASE WHEN cf.counts_churn THEN cf.lines_removed ELSE 0 END) AS removed,
  COUNT(*)                                                      AS files
FROM commit_file cf
JOIN git_commit c ON c.sha = cf.sha
GROUP BY cf.repo_id, cf.path, bucket;

CREATE INDEX IF NOT EXISTS idx_activity_by_path ON activity_by_path_period (repo_id, path);
