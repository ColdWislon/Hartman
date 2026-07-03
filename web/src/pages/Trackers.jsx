import React from "react";
import { useApp } from "../App.jsx";
import { api, zonesParam } from "../api.js";
import { useApi } from "../lib/hooks.js";
import { bucketRange, alignSeries } from "../lib/format.js";
import { Panel, EmptyState, Dot } from "../components/ui.jsx";
import BacklogHero from "../components/BacklogHero.jsx";
import OpenByZone from "../components/OpenByZone.jsx";
import { CycleBars, CycleTable } from "../components/CycleTime.jsx";
import OpenAge from "../components/OpenAge.jsx";
import RecentArtifacts from "../components/RecentArtifacts.jsx";

function Loading() {
  return <div style={{ height: 200 }} />;
}

function TrackerChips() {
  const app = useApp();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>Trackers</span>
      {app.trackerList.map((t) => {
        const on = app.trackers.includes(t.tuleap_tracker_id);
        return (
          <button
            key={t.tuleap_tracker_id}
            className={"chip" + (on ? " active" : "")}
            onClick={() =>
              app.setTrackers((sel) =>
                on ? (sel || []).filter((x) => x !== t.tuleap_tracker_id) : [...(sel || []), t.tuleap_tracker_id]
              )
            }
          >
            <Dot color={on ? "var(--accent)" : "var(--faint)"} size={8} />
            {t.name}
            <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>#{t.tuleap_tracker_id}</span>
          </button>
        );
      })}
      <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--faint)" }}>
        {app.trackers.length} of {app.trackerList.length} selected
      </span>
    </div>
  );
}

export default function Trackers() {
  const app = useApp();
  const { bucket } = app;
  const enabled = app.trackerList.length > 0 && app.trackers.length > 0;
  const trkKey = app.trackers.join(",");
  const zonesJson = zonesParam(app.zones);
  const buckets = bucketRange(app.from, app.to, bucket);
  const base = { tracker: app.trackers };

  const backlog = useApi(() => api.backlog({ ...base, bucket, from: app.from, to: app.to }), [trkKey, bucket, app.from, app.to, enabled], { enabled });
  const throughput = useApi(() => api.throughput({ ...base, bucket, from: app.from, to: app.to }), [trkKey, bucket, app.from, app.to, enabled], { enabled });
  const byZone = useApi(() => api.openByZone({ ...base, zones: zonesJson }), [trkKey, zonesJson, enabled], { enabled });
  const cycle = useApi(() => api.cycletime({ ...base, by: "assignee" }), [trkKey, enabled], { enabled });
  const open = useApi(() => api.openTickets(base), [trkKey, enabled], { enabled });
  const recent = useApi(() => api.recentArtifacts({ ...base, limit: 8 }), [trkKey, enabled], { enabled });

  const gate = (panel, msg, body) => (!enabled ? <EmptyState msg={msg} /> : panel.loading ? <Loading /> : body());

  const heroData = () => {
    const b = alignSeries(buckets, backlog.data || [], (r) => ({ open_count: r ? r.open_count : 0 }));
    const t = new Map((throughput.data || []).map((r) => [r.bucket.slice(0, 10), r]));
    // carry the backlog level forward through empty buckets
    let level = 0;
    return b.map((row) => {
      if (row.open_count > 0) level = row.open_count;
      const th = t.get(row.key);
      return { label: row.label, open_count: row.open_count || level, opened: th ? th.opened : 0, closed: th ? th.closed : 0 };
    });
  };

  return (
    <div className="page-body">
      <TrackerChips />

      <Panel title="Backlog & throughput" sub={`open artifacts over time · opened / closed per ${bucket}`}>
        {gate({ loading: backlog.loading || throughput.loading }, "Select at least one tracker", () => (
          <BacklogHero data={heroData()} />
        ))}
      </Panel>

      <Panel title="Open tickets by zone" sub="stacked by tracker · zones from Git activity config">
        {gate(byZone, "Select at least one tracker", () => (
          <OpenByZone rows={byZone.data || []} trackerList={app.trackerList} selected={app.trackers} />
        ))}
      </Panel>

      <div className="two-up">
        <Panel title="Cycle time & age" sub="median days · per assignee">
          {gate(cycle, "No selection", () => (
            <CycleBars rows={cycle.data || []} />
          ))}
        </Panel>
        <Panel title="Per-assignee detail" sub="open · closed · medians">
          {gate(cycle, "No selection", () => (
            <CycleTable rows={cycle.data || []} />
          ))}
        </Panel>
      </div>

      <Panel
        title="Open ticket age"
        sub="currently-open artifacts by age · oldest first"
        right={
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {(open.data || []).length} open
          </span>
        }
      >
        {gate(open, "Select at least one tracker", () => (
          <OpenAge tickets={open.data || []} />
        ))}
      </Panel>

      <Panel title="Recent artifacts" sub="cross-linked to commits · click to inspect">
        {gate(recent, "Select at least one tracker", () => (
          <RecentArtifacts rows={recent.data || []} />
        ))}
      </Panel>
    </div>
  );
}
