---
name: run-activity-monitor
description: Build, run, and drive the Git + Tuleap Activity Monitor without Docker. Use when asked to start the app, run the stack (Postgres + FastAPI + Vite), seed demo data, smoke-test it, or take a screenshot of its UI.
---

Full-stack app: Postgres (data) + FastAPI (`api/`, port 8000) + React/Vite
(`web/`, port 5173). Drive it with
`node .claude/skills/run-activity-monitor/driver.mjs` — a Playwright-headless
smoke script that checks the API, renders both pages, clicks through a tab
switch + metric toggle, and drops screenshots in `web/.smoke/`.

All paths relative to the repo root. Verified on Windows 11 / PowerShell,
Python 3.14, Node 25. (`make demo` is the Docker path; this skill is the
no-Docker path.)

## Prerequisites

Python 3.x and Node.js on PATH. Postgres is needed but **no install/admin
rights required** — use the portable EDB binaries (one-time, ~320 MB):

```powershell
curl.exe -s -L -o "$env:USERPROFILE\pgsql-17.5.zip" https://get.enterprisedb.com/postgresql/postgresql-17.5-1-windows-x64-binaries.zip
Expand-Archive -Path "$env:USERPROFILE\pgsql-17.5.zip" -DestinationPath "$env:USERPROFILE\pgsql-portable" -Force
$pg = "$env:USERPROFILE\pgsql-portable\pgsql"
& "$pg\bin\initdb.exe" -D "$pg\data" -U postgres -A trust -E UTF8 --locale=C
```

## Setup (one-time)

```powershell
# Python deps — do NOT pip install the requirements.txt files as-is, see Gotchas
python -m venv .venv
.venv\Scripts\pip.exe install "fastapi==0.115.0" "uvicorn[standard]==0.30.6" "PyYAML==6.0.2" "requests==2.32.3" "psycopg2-binary>=2.9.10"

# Web deps + headless browser for the driver
cd web; npm install; npx playwright install chromium; cd ..

# Database: start server, create role/db, apply schema, seed demo data
$pg = "$env:USERPROFILE\pgsql-portable\pgsql"
& "$pg\bin\pg_ctl.exe" -D "$pg\data" -l "$pg\postgres.log" -w start
& "$pg\bin\psql.exe" -U postgres -c "CREATE USER monitor WITH PASSWORD 'monitor';"
& "$pg\bin\psql.exe" -U postgres -c "CREATE DATABASE monitor OWNER monitor;"
$env:DATABASE_URL = "postgresql://monitor:monitor@localhost:5432/monitor"
.venv\Scripts\python.exe -m ingest.cli init-db
.venv\Scripts\python.exe -m ingest.cli ingest-all --seed-demo
```

`--seed-demo` loads a deterministic synthetic dataset (6 repos, ~2,400
commits, 3 trackers, 270 artifacts) — no Tuleap or git access needed.

## Run (agent path)

Start the three processes (Postgres survives reboots of the others;
`pg_ctl start` is a no-op error if already running — harmless):

```powershell
$pg = "$env:USERPROFILE\pgsql-portable\pgsql"
& "$pg\bin\pg_ctl.exe" -D "$pg\data" -l "$pg\postgres.log" -w start
```

Then, in two background shells (both from repo root):

```powershell
$env:DATABASE_URL = "postgresql://monitor:monitor@localhost:5432/monitor"; .venv\Scripts\python.exe -m uvicorn api.main:app --port 8000
```

```powershell
cd web; npm run dev   # port 5173; proxies /api -> :8000 (override: VITE_API_TARGET)
```

Wait until `http://localhost:8000/api/repos` and `http://localhost:5173/`
both return 200, then drive it:

```powershell
node .claude\skills\run-activity-monitor\driver.mjs
```

The driver (args: `[webUrl] [apiUrl]`, defaults `http://localhost:5173`
`http://localhost:8000`):

| step | what it does |
|---|---|
| API smoke | `/api/repos`, `/api/activity/tree`, `/api/tickets/backlog` — fails on non-200 or empty (= unseeded db) |
| Git activity page | waits for treemap SVG, screenshots `web/.smoke/git-activity.png` |
| interact | clicks metric toggle → churn, clicks Trackers tab |
| Trackers page | waits for charts, screenshots `web/.smoke/trackers.png` |
| console check | fails on any pageerror/console.error; on failure dumps `web/.smoke/failure.png` |

Exit 0 + `SMOKE PASSED` = the app works. Read the PNGs to see the UI.

To stop: kill the uvicorn/npm shells;
`& "$pg\bin\pg_ctl.exe" -D "$pg\data" stop` for Postgres.

## Run (human path)

Same three processes, then open http://localhost:5173 in a browser.

## Gotchas

- **`pip install -r api/requirements.txt` fails on Python ≥3.14** —
  `psycopg2-binary==2.9.9` has no cp314 wheel, so pip builds from source and
  dies with `Error: pg_config executable not found`. Install the pinned list
  with `psycopg2-binary>=2.9.10` substituted (as in Setup above).
- **Empty charts / driver reports "empty response"** — schema exists but no
  data. Re-run `.venv\Scripts\python.exe -m ingest.cli ingest-all --seed-demo`
  (idempotent) with `DATABASE_URL` set.
- **Playwright is a devDependency of `web/`**, and the driver resolves it
  from there via `createRequire` — run `npm install` in `web/` before the
  driver, but the driver itself can be launched from any cwd.
- **First API request after a Postgres restart returns 500** — the psycopg2
  connection pool holds a dead connection; the next request works. Retry once
  before diagnosing.
- **The API reads `DATABASE_URL` at startup** (default
  `postgresql://monitor:monitor@localhost:5432/monitor`, which matches this
  setup) — if you change the port/db, set the env var in the uvicorn shell.

## Troubleshooting

- **`Error: pg_config executable not found` during pip install**: see first
  Gotcha — use `psycopg2-binary>=2.9.10`.
- **`psql: error: connection ... refused`**: Postgres isn't running — this
  setup has no Windows service; start it with the `pg_ctl ... start` line.
