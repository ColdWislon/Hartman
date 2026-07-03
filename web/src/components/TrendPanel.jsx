import React from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmt, fmtFull, niceMax, alignSeries } from "../lib/format.js";
import { useNarrow } from "../lib/hooks.js";
import { ChartTip } from "./Tooltip.jsx";
import { Dot, EmptyState } from "./ui.jsx";

const AXIS_TICK = { fontSize: 10.5, fill: "var(--faint)", fontFamily: "IBM Plex Mono" };

// Stacked area by part (children of the drilled node; top 6 + "other"), part
// colors match the treemap, dashed total line. Falls back to a single accent
// line + gradient area when there is only one part.
export default function TrendPanel({ grouped, buckets, metricLabel, partColor }) {
  const narrow = useNarrow();
  if (!buckets.length) return <EmptyState />;

  // fold rows {key,bucket,value} → per-part series aligned on the bucket range
  const byKey = new Map();
  (grouped || []).forEach((r) => {
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r);
  });
  let parts = [...byKey.entries()].map(([name, rows]) => ({
    name,
    total: rows.reduce((s, r) => s + r.value, 0),
    data: alignSeries(buckets, rows, (r) => ({ value: r ? r.value : 0 })),
  }));
  parts.sort((a, b) => b.total - a.total);
  parts = parts.filter((p) => p.total > 0);
  if (parts.length === 0) return <EmptyState />;

  let series = parts;
  if (parts.length > 6) {
    const rest = parts.slice(6);
    const agg = buckets.map((b, i) => ({ ...b, value: rest.reduce((s, p) => s + p.data[i].value, 0) }));
    series = [...parts.slice(0, 6), { name: `other (${rest.length})`, isOther: true, data: agg }];
  }
  const single = series.length === 1;

  const data = buckets.map((b, i) => {
    const d = { label: b.label };
    let total = 0;
    series.forEach((s) => {
      d[s.name] = s.data[i].value;
      total += s.data[i].value;
    });
    d.__total = total;
    return d;
  });
  const yMax = niceMax(Math.max(...data.map((d) => d.__total), 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(yMax * f));
  const step = Math.ceil(buckets.length / (narrow ? 5 : 8));
  const colorOf = (s, si) => (s.isOther ? "var(--faint)" : partColor(s.name, si, series.length));

  const build = (label, payload) => {
    const d = payload[0] && payload[0].payload;
    if (!d) return null;
    const rows = single
      ? [[metricLabel, fmtFull(d.__total)]]
      : [
          ...series
            .map((s) => [s.name, d[s.name] || 0])
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => [k, fmtFull(v)]),
          ["total", fmtFull(d.__total)],
        ];
    return { title: label, rows, accent: "var(--accent)" };
  };

  return (
    <div>
      {!single ? (
        <div style={{ display: "flex", gap: 11, flexWrap: "wrap", marginBottom: 8, fontSize: 11, color: "var(--muted)" }}>
          {series.map((s, si) => (
            <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Dot color={colorOf(s, si)} />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ width: "100%", height: 248 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="trend-single" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ ...AXIS_TICK, fontSize: 10 }} interval={step - 1} />
            <YAxis width={44} domain={[0, yMax]} ticks={ticks} tickFormatter={fmt} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <Tooltip content={<ChartTip build={build} />} cursor={{ stroke: "var(--border2)" }} isAnimationActive={false} />
            {single ? (
              <Area
                dataKey={series[0].name}
                stroke="var(--accent)"
                strokeWidth={2.2}
                fill="url(#trend-single)"
                dot={false}
                isAnimationActive={false}
              />
            ) : (
              series.map((s, si) => (
                <Area
                  key={s.name}
                  dataKey={s.name}
                  stackId="parts"
                  stroke="var(--panel)"
                  strokeWidth={0.75}
                  fill={colorOf(s, si)}
                  fillOpacity={0.78}
                  dot={false}
                  isAnimationActive={false}
                />
              ))
            )}
            {!single ? (
              <Line
                dataKey="__total"
                stroke="var(--text)"
                strokeWidth={1.4}
                strokeOpacity={0.55}
                strokeDasharray="1 3"
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
