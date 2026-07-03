# Handoff: Git + Tuleap Activity Monitor

## Overview
An internal, LAN-only dashboard (no login) monitoring development activity across ~6 git
repositories and their associated Tuleap issue trackers. Two audiences: engineering leads
scanning "where is effort going / what's the backlog doing", and developers drilling into a
specific area or ticket. Data is batch-ingested (not realtime). Two pages behind tabs:
**Git activity** and **Trackers**.

## About the Design Files
`Activity Monitor.dc.html` is a **design reference created in HTML** — an interactive
prototype showing intended look and behavior with realistic placeholder data. It is NOT
production code to copy directly. The task is to **recreate this design in the target
codebase** — a **React + Vite + Recharts** stack per the project brief — using its
established patterns. All charts in the prototype are hand-rolled SVG; in the real app use
Recharts where it fits (line, bar, area, stacked area) and a custom SVG component only for
the treemap and the two heatmap matrices (Recharts has no good primitive for those).
All placeholder data generation must be replaced with the real batch-ingest API.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final intent.
Recreate pixel-perfectly using the tokens below.

## Design Tokens

### Type
- UI font: `IBM Plex Sans` (400/500/600/700), fallback `system-ui, sans-serif`
- Numeric / code / paths / sub-labels: `IBM Plex Mono` (400/500/600)
- Scale: panel title 15.5px/600 · body 13px · labels 12–12.5px/500–600 ·
  micro-caps 10.5–11px/600 uppercase +0.5 letter-spacing · big stat 22px/600 mono ·
  chart axis 10–10.5px mono
- Letter-spacing +0.1px globally; antialiased.

### Colors — dark theme (default)
```
--bg:#0b0c0e  --surface:#111214  --panel:#17181b  --panel2:#1e2024
--hover:rgba(255,255,255,.045)  --border:rgba(255,255,255,.09)  --border2:rgba(255,255,255,.15)
--text:#e9eaed  --muted:#8b8e97  --faint:#5d606a
--accent:#5b8cff  --accent2:#7aa2ff  --accentweak:rgba(91,140,255,.16)
--green:#43b95e  --red:#f0603f  --grid:rgba(255,255,255,.07)  --track:rgba(255,255,255,.06)
--shadow:0 1px 2px rgba(0,0,0,.4),0 10px 30px rgba(0,0,0,.28)
```

### Colors — light theme
```
--bg:#f4f5f7  --surface:#fff  --panel:#fff  --panel2:#f4f5f7
--hover:rgba(0,0,0,.03)  --border:rgba(0,0,0,.09)  --border2:rgba(0,0,0,.16)
--text:#15171c  --muted:#5f636e  --faint:#9599a3
--accent:#3b6ef5  --accent2:#2f5fe0  --accentweak:rgba(59,110,245,.10)
--green:#1f8a43  --red:#d0402f  --grid:rgba(0,0,0,.07)  --track:rgba(0,0,0,.05)
--shadow:0 1px 2px rgba(0,0,0,.05),0 10px 26px rgba(0,0,0,.08)
```
Theme switch = swap a `data-theme` attribute on the root; everything reads CSS custom
properties. Charts must read the same variables (axes, gridlines, tooltips).

### Semantic color rules (consistent app-wide)
- opened / additions = `--green` · closed / deletions = `--red` · backlog & primary series = `--accent`
- Categorical palette (repos & zones, colorblind-aware, index-stable):
  `#5b8cff #12b3a6 #e0a34e #b07cf0 #ec6f9e #4cc0e0`
- Tracker colors: Bugs `#ec6f9e`, Tasks `#4cc0e0`, User Stories `#b07cf0`
- Ticket age bands: ≤7d green · 8–30d accent · 31–90d `#e0a34e` · >90d red

### Surfaces & spacing
- Panels: `--panel` bg, 1px `--border`, radius 16, padding 20 (16 narrow), `--shadow`
- Popovers/drawer: `--panel`, 1px `--border2`, radius 12, `--shadow`
- Controls: height 32–34, radius 8–9, `--panel2` bg, 1px `--border`
- Segmented control: 3px padded track, active pill = `--accent` with white text, radius 6/9
- Page: max-width 1400, gutter 24 (14 narrow), 16px gap between panels
- Bars: track `--track` radius 4–5; bar radius 4–5

## Global Shell
- **Top bar** (sticky, blur backdrop `--surface` @82% + bottom `--border`): logo mark
  (30px, accent gradient, git-graph glyph) + "Activity Monitor" 14.5/700 with
  "Git + Tuleap · LAN" 11 `--faint`; right side: repo multi-select (checkbox popover w/
  repo color dots + default branch in mono), From/To date inputs (mono 12), Week/Month
  segmented toggle, theme toggle icon button.
- **Tabs**: "Git activity" / "Trackers", 14/600, active = `--text` + 2px accent underline,
  inactive `--muted`.
- All filters are global: repo selection, date range, bucket (week|month) affect every panel.

## Page 1 — Git activity
A metric segmented toggle **Commits / Churn / Files** (in the treemap panel header) drives
the whole page. A shared drill-down path scopes every panel; sub-labels echo scope,
e.g. `scoped to uart/rtl/ip/ · commits`.

Panels in order:
1. **Activity by path** (hero treemap, full width, ~440px tall)
   - Squarified treemap of the current node's children; leaf=file, node=directory.
   - Click node → drill (repo → dir → … → file); breadcrumb `repos / uart / rtl / ip`
     walks back out (mono 12.5, current crumb = accent pill).
   - **Group by: Repository | Zone** toggle. Zone mode replaces the top level with
     user-configurable zones. **Configure zones** popover: each zone = name + comma-
     separated directory names; a file joins the FIRST zone whose dir list matches any
     path segment; unmatched → "Other". Editing re-groups everything live.
   - Tile fill: top level = palette by index; drilled = lightness ramp of the ancestor's
     palette color. Label 12/600 + value/percent 11 mono; text white or near-black by
     luminance. 2px gaps, radius 5, `--panel` stroke.
   - Tooltip: path, metric value, commits, files. Footer: legend (top-level names+dots) and
     `<total> <metric> total` right-aligned mono.
2. **Zone activity** (full width) — heatmap matrix: rows = zones (zone color dot + name),
   cols = buckets, cell opacity 0.06–1.0 by metric value, per-row total right (mono).
   Cell size ~26×26 (month) / 9px wide (week), radius 2.5, 3px row gap.
3. **Contributors** + **Trend** (two-up, 5fr/7fr; stacks < 880px)
   - Contributors: horizontal bars per author (~8), descending, accent fill, value mono right.
   - Trend: **stacked area by part** (children of drilled node; top 6 + "other"), part colors
     = treemap colors, dashed `--text` total line, legend chips, hover lists every part
     sorted + total. Falls back to single accent line+gradient area for a leaf file.
4. **Committer activity** (full width) — same matrix as Zone activity but rows = ALL
   committers, accent-intensity cells, totals right. Shows cadence per person per bucket.
5. **Contribution mix** (full width) — per committer, a 100% stacked bar segmented by
   top-level part (repo/zone; or sub-dirs when drilled), treemap-consistent colors, total
   right, tooltip = value + share. Legend on top. Row: `134px | 1fr | 52px` grid, bar h 20.
6. **Commit rhythm** (full width) — weekday(7) × hour(24) punchcard heatmap,
   accent-intensity cells, Less→More legend, business-hours concentration.
7. **Code frequency** + **Top files** (two-up, equal)
   - Code frequency: diverging area — additions above zero line (green), deletions below
     (red), gradient fills, ±yMax labels. Always lines-based (churn), independent of metric.
   - Top files: top-8 leaf files under current path; `dir/` in faint mono + filename 600 mono,
     bar in scope color, value right.

## Page 2 — Trackers
Tracker multi-select chips (Bugs #101, Tasks #102, User Stories #103 — id in mono,
active = accent border + `--accentweak` bg). All panels respect the selection.

1. **Backlog & throughput** (hero, full width, ~400px)
   - Top band: backlog line (accent, 2.4px, gradient area) = open artifacts over time,
     climbing to ~92; left axis accent-tinted.
   - Bottom band (~46% height): paired bars per bucket — opened (green) and closed (red)
     side by side growing up from a baseline; right axis for throughput.
   - Legend: line chip "Open backlog", squares Opened/Closed. Tooltip: open backlog,
     +opened, −closed, net.
2. **Open tickets by zone** (full width) — vertical stacked bars per zone (sorted desc),
   segments by tracker type (tracker colors), total on top (mono 11.5/600), zone color dot
   next to x label, tooltip incl. closed count.
3. **Cycle time & age** + **Per-assignee detail** (two-up)
   - Left: per assignee (~9), two thin bars — median days-to-close (accent) and median
     open age (`#e0a34e`) — with `Nd` mono values.
   - Right: companion table (Assignee, Open, Closed, Close (d), Age (d)); sticky header,
     micro-caps headers, mono numerics, medians tinted accent/amber; scrolls in-container.
4. **Open ticket age** (full width)
   - Summary strip: Open count + median age card, then one card per age band with count
     + proportion micro-bar.
   - Distribution histogram: 15-day bins, bars in band color, count labels, dashed median
     marker with `med 35d` chip, hover = range/count/share.
   - List: every open ticket sorted oldest-first — ref (mono, accent when linked), title,
     status dot+label, assignee, age bar (band color, width = age/max) + `Nd`.
5. **Recent artifacts** — cross-linked list; each row: ref, title, assignee, status, linked-
   commit count with link icon, chevron.

### Cross-links (detail drawer)
Right-side drawer (460px, overlay rgba(0,0,0,.45)): artifact detail shows status/assignee/
opened/age meta row + "N linked commits" list (sha in accent mono, message, repo·author·date);
each commit navigates to a commit drawer showing its meta + "N linked artifacts" — fully
bidirectional. In production these are outbound hyperlinks (Tuleap artifact URL / git web UI).

## Interactions & Behavior
- Tooltips: floating card (`--surface`, `--border2`, radius 10, shadow) with color chip +
  mono title, k/v rows; flips near viewport edges; pointer-events none.
- Hover on list rows/table rows = `--hover` bg. Bars animate width .3–.4s ease.
- Page/metric/bucket switches animate content with 250ms fade+4px rise.
- Popovers close on outside click. Drawer closes on scrim click.
- Empty states: centered magnifier icon + message ("No activity in this selection",
  "Select at least one repository", "Select at least one tracker").
- Responsive: two-up grids collapse to one column < 880px; date range drops to a second
  row < 880px; wide charts/tables scroll inside their container — page never scrolls
  horizontally. Number formatting: `1.4k` compact in chart context, full `8,004` in tooltips.

## State Management
```
theme: 'dark'|'light'         page: 'git'|'trackers'
metric: 'commits'|'churn'|'files'   bucket: 'week'|'month'
repos: string[]               from,to: ISO date
drill: string[]               groupBy: 'repo'|'zone'
zones: {name, dirs:string[]}[]      trackers: ('bugs'|'tasks'|'stories')[]
drawer: {type:'artifact'|'commit', id} | null
```
Zone classification: first zone whose `dirs` contains any path segment; else "Other".
Editing zones resets `drill`. Deselecting a repo that is the drill root resets `drill`.

## Data Shapes (API contract the UI expects)
```
repo:        { name, default_branch }
tree node:   { name, path, is_leaf, children?, commits, churn, files }   // dirs = sums
contributor: { author, value }                                            // desc
timeseries:  { bucket /*ISO date*/, value }
backlog:     { bucket, open_count }
throughput:  { bucket, opened, closed }
cycletime:   { assignee, median_days_to_close, median_open_age_days, open_count, closed_count }
tracker:     { tuleap_tracker_id, name, statuses[] }   // distinct vocab per tracker
open ticket: { ref, tracker, title, status, assignee, age_days, linked_commits[] }
commit:      { sha, repo, author, date, message, linked_artifacts[] }
zone:        { name, dirs: string[] }                  // user-configurable, persist server- or localStorage-side
```

## Assets
None — the logo mark, icons (sun/moon, git graph, link, chevrons, close, search) are inline
SVG strokes (1.5–2.4px, currentColor). Fonts from Google Fonts (IBM Plex Sans + Mono).

## Files
- `Activity Monitor.dc.html` — the full interactive prototype (both pages, both themes,
  all interactions). Open in a browser. All layout styles are inline; theme tokens are the
  CSS custom properties in the `<style>` block at the top; all data generation and chart
  rendering live in the single `Component` class in the embedded script.
