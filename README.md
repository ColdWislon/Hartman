# Git + Tuleap Activity Monitor (v1)

An internal web app that monitors development activity across multiple git
repositories and their associated Tuleap trackers — all in a single Tuleap
instance, reached by one service account.

It ingests git history and Tuleap ticket history into Postgres, then exposes:

- **Git activity** — where the repo changed (path treemap), who changed it
  (contributors), and when (weekly/monthly trends), with a
  commits / churn / files metric toggle and path drill-down.
- **Trackers** — open-backlog trend + open/close throughput (headline),
  cycle-time / age of open artifacts (secondary), broken down per assignee.
- **Git ↔ ticket links** — surfaced as hyperlinks in both directions.

## Stack

| Layer   | Tech                                   |
|---------|----------------------------------------|
| Storage | Postgres (fact tables + materialized rollups) |
| API     | FastAPI, read-only JSON over Postgres  |
| Web     | React + Vite + Recharts SPA            |
| Ingest  | Python CLI (git lane, Tuleap lane, cross-ref) |
| Orchestration | Docker Compose (`db`, `api`, `web`, one-shot `ingest`) |

## Quick start (offline demo)

No live Tuleap needed — seeds a synthetic dataset:

```bash
make demo
# Web UI : http://localhost:8080
# API    : http://localhost:8000/api/repos
```

`make demo` builds and starts `db`, `api`, `web`, then runs
`ingest ingest-all --seed-sample`.

## Real ingestion

1. Copy `.env.example` → `.env` and set `TULEAP_ACCESS_KEY` (a long-lived
   personal access key) and git read auth (`GIT_HTTP_PAT` or a mounted SSH key).
2. Edit `config.yaml` — add your repos and the tracker IDs to monitor. The
   tracker list is the only knob needed to change what's monitored.
3. Stand up the stack and ingest:

```bash
make up                                   # db + api + web
make seed-mailmap                         # optional: dump identities → .mailmap, dedupe once
docker compose run --rm ingest ingest-all # git + trackers + cross-ref + refresh views
```

Re-running `ingest-all` is **idempotent**: commits/files/status-events dedupe
on their unique keys, git and tracker high-water marks advance, and a
force-push on a default branch is reconciled (full re-scan + upsert) rather
than duplicated.

## Ingestion CLI

```
python -m ingest.cli <subcommand>

  init-db          apply db/schema.sql
  seed-mailmap     dump distinct identities across all mirrors into .mailmap
  ingest-git       git history for all configured repos (default branch, no merges)
  ingest-trackers  Tuleap tracker/artifact/status-event history
  link-commits     cross-reference commit subjects → artifacts
  refresh-views    refresh materialized rollups
  ingest-all       every lane + refresh  (--seed-sample loads the offline demo)
```

## Configuration

Non-secret settings live in `config.yaml`; **credentials come from the
environment only**:

- `TULEAP_ACCESS_KEY` — Tuleap personal access key (`X-Auth-AccessKey` header).
- `GIT_HTTP_PAT` — optional HTTPS PAT for git read (or mount an SSH key).
- `DATABASE_URL` — Postgres DSN (defaults to the compose `db` service).

See `config.yaml` for repos, tracker IDs, timezone (`Europe/Paris`),
ISO weeks, the shared `mailmap_path`, and per-repo `churn_exclude` globs.

## Data model

Finest grain — one row per `(file, commit)` for git, one row per status event
for trackers. Every API view is a `GROUP BY` rollup over these fact tables, so
adding a view never needs re-ingestion. See `db/schema.sql`.

## API endpoints

Global params where sensible: `repo`, `from`, `to`, `bucket=week|month`,
`metric=commits|churn|files` (buckets in `Europe/Paris`, ISO weeks).

```
GET /api/repos
GET /api/trackers
GET /api/activity/tree           # treemap level; ?path= drill-down
GET /api/activity/contributors
GET /api/activity/timeseries     # ?path= to scope
GET /api/tickets/backlog
GET /api/tickets/throughput
GET /api/tickets/cycletime       # ?by=assignee
GET /api/tickets/{id}/commits    # cross-ref, with Tuleap/commit URLs
GET /api/commits/{sha}/tickets
```

## Non-goals (v1)

No auth, no webhooks/realtime, no task queue (plain CLI), raw paths only,
default branch only, git↔ticket stays hyperlink-level.

## Notes for operators

- Open/closed is driven by each tracker's **status semantic** (status field +
  open value IDs read from `GET /api/trackers/{id}`), never by hardcoded
  status names — verify the exact `semantics` shape and modified-since query
  syntax against your instance's `/api/explorer/`.
- Identity resolution is entirely at the git layer via `.mailmap`
  (`--use-mailmap`); the backend treats author name/email as canonical.
```
