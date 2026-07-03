import React from "react";
import { useApp } from "../App.jsx";
import { api, zonesParam } from "../api.js";
import { useApi } from "../lib/hooks.js";
import { PALETTE, shade } from "../lib/color.js";
import { alignSeries, bucketRange, METRIC_LABEL } from "../lib/format.js";
import { zoneIndex } from "../lib/zones.js";
import { Panel, Seg, EmptyState, IntensityLegend } from "../components/ui.jsx";
import TreemapPanel from "../components/TreemapPanel.jsx";
import MatrixPanel from "../components/MatrixPanel.jsx";
import Contributors from "../components/Contributors.jsx";
import TrendPanel from "../components/TrendPanel.jsx";
import ContributionMix from "../components/ContributionMix.jsx";
import Punchcard from "../components/Punchcard.jsx";
import CodeFrequency from "../components/CodeFrequency.jsx";
import TopFiles from "../components/TopFiles.jsx";

function Loading() {
  return <div style={{ height: 200 }} />;
}

export default function GitActivity() {
  const app = useApp();
  const { metric, bucket, groupBy, drill } = app;
  const prefix = drill.length ? drill.join("/") + "/" : "";
  const scope = drill.length ? prefix : "all repos";
  const zonesJson = zonesParam(app.zones);
  const enabled = app.reposLoaded && app.repos.length > 0;
  const repoKey = app.repos.join(",");
  const base = { repo: app.repos, from: app.from, to: app.to, group: groupBy, zones: zonesJson };
  const buckets = bucketRange(app.from, app.to, bucket);

  const baseDeps = [repoKey, app.from, app.to, groupBy, zonesJson, enabled];
  const tree = useApi(() => api.tree({ ...base, metric, path: prefix }), [...baseDeps, metric, prefix], { enabled });
  const zoneTs = useApi(
    () => api.timeseries({ repo: app.repos, from: app.from, to: app.to, metric, bucket, series: "zone", zones: zonesJson }),
    [repoKey, app.from, app.to, metric, bucket, zonesJson, enabled],
    { enabled }
  );
  const contributors = useApi(() => api.contributors({ ...base, metric, path: prefix }), [...baseDeps, metric, prefix], { enabled });
  const trend = useApi(
    () => api.timeseries({ ...base, metric, bucket, series: "part", path: prefix }),
    [...baseDeps, metric, bucket, prefix],
    { enabled }
  );
  const committerTs = useApi(
    () => api.timeseries({ ...base, metric, bucket, series: "author", path: prefix }),
    [...baseDeps, metric, bucket, prefix],
    { enabled }
  );
  const mix = useApi(() => api.mix({ ...base, metric, path: prefix }), [...baseDeps, metric, prefix], { enabled });
  const punch = useApi(() => api.punchcard({ ...base, metric, path: prefix }), [...baseDeps, metric, prefix], { enabled });
  const codefreq = useApi(() => api.codefrequency({ ...base, bucket, path: prefix }), [...baseDeps, bucket, prefix], { enabled });
  const topfiles = useApi(() => api.topfiles({ ...base, metric, path: prefix, limit: 8 }), [...baseDeps, metric, prefix], { enabled });

  // color anchors: top level = palette by index; drilled = lightness ramp
  const rootIndexOf = (name) => {
    if (groupBy === "zone") return zoneIndex(app.zones, name);
    const i = app.repoList.findIndex((r) => r.name === name);
    return i < 0 ? 0 : i;
  };
  const partColor = (name, idx, cnt) => {
    if (drill.length === 0) return PALETTE[rootIndexOf(name) % PALETTE.length];
    const base_ = PALETTE[rootIndexOf(drill[0]) % PALETTE.length];
    const t = cnt > 1 ? idx / (cnt - 1) : 0;
    return shade(base_, -0.3 + t * 0.62);
  };
  const scopeColor = drill.length ? PALETTE[rootIndexOf(drill[0]) % PALETTE.length] : "var(--accent)";
  const metricLabel = METRIC_LABEL[metric];

  const gate = (panel, msg, body) =>
    !enabled ? <EmptyState msg={msg} /> : panel.loading ? <Loading /> : body();

  // zone matrix rows, ordered by zone config (then Other)
  const zoneRows = () => {
    const byZone = new Map();
    (zoneTs.data || []).forEach((r) => {
      if (!byZone.has(r.key)) byZone.set(r.key, []);
      byZone.get(r.key).push(r);
    });
    return [...byZone.entries()]
      .map(([name, rows]) => ({
        name,
        color: PALETTE[zoneIndex(app.zones, name) % PALETTE.length],
        dot: true,
        total: rows.reduce((s, r) => s + r.value, 0),
        cells: alignSeries(buckets, rows, (r) => ({ v: r ? r.value : 0 })).map((c) => c.v),
      }))
      .filter((r) => r.total > 0)
      .sort((a, b) => zoneIndex(app.zones, a.name) - zoneIndex(app.zones, b.name));
  };

  const committerRows = () => {
    const byAuthor = new Map();
    (committerTs.data || []).forEach((r) => {
      if (!byAuthor.has(r.key)) byAuthor.set(r.key, []);
      byAuthor.get(r.key).push(r);
    });
    return [...byAuthor.entries()]
      .map(([name, rows]) => ({
        name,
        total: rows.reduce((s, r) => s + r.value, 0),
        cells: alignSeries(buckets, rows, (r) => ({ v: r ? r.value : 0 })).map((c) => c.v),
      }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  };

  const metricSeg = (
    <Seg
      options={[
        { v: "commits", l: "Commits" },
        { v: "churn", l: "Churn" },
        { v: "files", l: "Files" },
      ]}
      value={metric}
      onPick={app.setMetric}
    />
  );

  return (
    <div className="page-body">
      <Panel title="Activity by path" sub={`sized by ${metricLabel} · ${scope}`} right={metricSeg}>
        {gate(tree, "Select at least one repository", () => (
          <TreemapPanel
            children={(tree.data && tree.data.children) || []}
            total={(tree.data && tree.data.total) || 0}
            rootIndexOf={rootIndexOf}
          />
        ))}
      </Panel>

      <Panel title="Zone activity" sub={`all zones per ${bucket} · selected repos · ${metric}`}>
        {gate(zoneTs, "No selection", () => {
          const rows = zoneRows();
          return (
            <MatrixPanel
              rows={rows}
              buckets={buckets}
              bucket={bucket}
              metricLabel={metricLabel}
              rowH={26}
              footer={
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
                  <span className="mono">{rows.length} zones · configure via Group by → Zone → Configure zones</span>
                  <span className="mono" style={{ marginLeft: "auto" }}>per {bucket} · total →</span>
                </div>
              }
            />
          );
        })}
      </Panel>

      <div className="two-up cols-5-7">
        <Panel title="Contributors" sub={`scoped to ${scope} · ${metric}`}>
          {gate(contributors, "No selection", () => (
            <Contributors rows={contributors.data || []} metric={metric} />
          ))}
        </Panel>
        <Panel title="Trend" sub={`per ${bucket} · ${scope} · ${metric}`}>
          {gate(trend, "No selection", () => (
            <TrendPanel grouped={trend.data || []} buckets={buckets} metricLabel={metricLabel} partColor={partColor} />
          ))}
        </Panel>
      </div>

      <Panel title="Committer activity" sub={`all committers per ${bucket} · ${scope} · ${metric}`}>
        {gate(committerTs, "No selection", () => {
          const rows = committerRows();
          return (
            <MatrixPanel
              rows={rows}
              buckets={buckets}
              bucket={bucket}
              metricLabel={metricLabel}
              rowH={24}
              footer={<IntensityLegend right={`${rows.length} committers · per ${bucket} · total →`} />}
            />
          );
        })}
      </Panel>

      <Panel
        title="Contribution mix"
        sub={`where each committer contributes · ${drill.length ? "within " + scope : "by " + (groupBy === "zone" ? "zone" : "repository")} · ${metric}`}
      >
        {gate(mix, "No selection", () => (
          <ContributionMix rows={mix.data || []} metric={metric} partColor={partColor} />
        ))}
      </Panel>

      <Panel title="Commit rhythm" sub={`weekday × hour of day · ${scope} · ${metric}`}>
        {gate(punch, "No selection", () => (
          <Punchcard rows={punch.data || []} metric={metric} />
        ))}
      </Panel>

      <div className="two-up">
        <Panel title="Code frequency" sub={`lines added / removed per ${bucket} · ${scope}`}>
          {gate(codefreq, "No selection", () => (
            <CodeFrequency
              data={alignSeries(buckets, codefreq.data || [], (r) => ({
                additions: r ? r.additions : 0,
                deletions: r ? r.deletions : 0,
              }))}
            />
          ))}
        </Panel>
        <Panel title="Top files" sub={`by ${metricLabel} · ${scope}`}>
          {gate(topfiles, "No selection", () => (
            <TopFiles rows={topfiles.data || []} metric={metric} scopeColor={scopeColor} />
          ))}
        </Panel>
      </div>
    </div>
  );
}
