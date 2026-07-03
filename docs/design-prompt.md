# Claude design prompt — Git + Tuleap Activity Monitor dashboard

Paste the brief below into Claude to generate a polished visual design (an
interactive HTML/CSS/JS or React + Recharts artifact) for this app's
dashboard. It captures the product, every page and component, the real data
shapes from the API, and an aesthetic direction, so the output maps directly
onto `web/src`.

---

You are a senior product designer + front-end engineer. Design a polished,
production-quality dashboard for an internal web app called the
"Git + Tuleap Activity Monitor." Deliver it as a single self-contained,
interactive artifact (inline HTML/CSS/JS, or React + Recharts) with realistic
placeholder data, styled for both light and dark themes. This is a visual
design pass over an app that already works — make it feel considered,
information-dense but calm, and genuinely usable by engineers.

## What the app is
An internal, LAN-only dashboard (no login) that monitors development activity
across ~6 git repositories and their associated Tuleap issue trackers. Two
audiences: engineering leads scanning "where is effort going / what's the
backlog doing," and developers drilling into a specific area or ticket.
Batch-ingested data (not realtime). Keep it factual and scannable, not flashy.

## Global shell
- A slim top bar, persistent across pages: product name on the left; on the
  right a **repo multi-select**, a **date-range picker** (From / To), and a
  **week / month bucket toggle**.
- Two primary pages via tabs: **Git activity** and **Trackers**.
- Dark theme as the default/hero look; also provide a clean light theme.
  Theme-aware charts (axes, gridlines, tooltips legible in both).

## Page 1 — Git activity
A metric drives the whole page: a **commits / churn / files** segmented
toggle (default: commits). Three linked panels that all respect the current
metric, repo selection, date range, and a shared drill-down path:
1. **Activity-by-path treemap** (hero, full width). Sized by the active
   metric. Click a directory node to drill in (repo → dir → subdir → file);
   a breadcrumb (root / app / storage …) walks back out. Leaf = file,
   node = directory. Tooltip shows the metric value + commit count.
2. **Contributors** bar chart — per-author totals for the current metric,
   scoped to the drilled path. ~8 authors, descending.
3. **Trend** line — the metric per week/month over the range, scoped to the
   drilled path. Should read as a clear activity curve over ~18 months.
Sub-labels on the smaller panels should show scope ("scoped to app/ · commits").

## Page 2 — Trackers
A tracker multi-select (Bugs / Tasks / User Stories) plus:
1. **Backlog & throughput** (headline, full width): a combined chart — a
   **backlog line** (count of open artifacts over time, climbing to ~90) with
   **opened (green) / closed (red) throughput bars** per bucket underneath.
2. **Cycle time & age, per assignee** (secondary): horizontal bars showing
   **median days-to-close** and **median age of still-open artifacts** for
   each of ~9 assignees, plus a companion table (Assignee, Open, Closed,
   Median close (d), Median age (d)).
3. Cross-links: an artifact detail lists its linked commits; a commit detail
   lists its linked artifacts — all as outbound hyperlinks. Show a tasteful
   representation of this (e.g. a linked-items list on a detail drawer/row).

## Real data shapes (design to these — invent realistic values)
- repos: `[{ name, default_branch }]` — e.g. uart, firmware, bootloader,
  web-console, telemetry-service, docs-portal
- tree node: `{ name, is_leaf, value, commits, path }`
- contributor: `{ author, value }` — real names, weighted descending
- timeseries point: `{ bucket (ISO date), value }`
- backlog point: `{ bucket, open_count }`
- throughput point: `{ bucket, opened, closed }`
- cycletime row: `{ assignee, median_days_to_close, median_open_age_days,
  open_count, closed_count }`
- trackers: `[{ tuleap_tracker_id, name }]` with distinct status vocabularies

## Aesthetic direction
- Modern engineering-tool feel (think Linear / Vercel / GitHub Insights):
  restrained, high-contrast, generous whitespace, one confident accent color
  plus a small categorical palette for the treemap and series.
- Colorblind-safe, accessible contrast. Opened=positive/green, closed=red,
  backlog=accent. Consistent color meaning across the whole app.
- Rounded panels on a subtle elevated surface; quiet borders; clear section
  headers with muted sub-labels; numbers set in a tabular/mono-ish face.
- Charts: minimal chrome, soft gridlines, no chartjunk, readable tooltips,
  legends only where needed. Empty states ("No activity in this selection").
- Fully responsive: panels stack to one column on narrow screens; wide charts
  and tables scroll inside their own container — the page never scrolls
  horizontally.

## Deliverable
One interactive artifact demonstrating both pages (a tab switcher is fine),
with the treemap drill-down and the metric toggle actually working on
placeholder data, and both light and dark themes. Prioritize the two hero
panels (treemap; backlog & throughput). Include a short note on the palette
tokens and type scale you chose so it can be lifted into the real
React + Vite + Recharts codebase.
