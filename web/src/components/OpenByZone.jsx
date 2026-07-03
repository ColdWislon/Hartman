import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ResponsiveContainer } from "recharts";
import { PALETTE, trackerColor } from "../lib/color.js";
import { fmtFull } from "../lib/format.js";
import { zoneIndex } from "../lib/zones.js";
import { useApp } from "../App.jsx";
import { useNarrow } from "../lib/hooks.js";
import { ChartTip } from "./Tooltip.jsx";
import { EmptyState, Legend } from "./ui.jsx";

function ZoneTick({ x, y, payload, colorOf }) {
  const name = payload.value;
  const label = name.length > 14 ? name.slice(0, 13) + "…" : name;
  return (
    <g transform={`translate(${x},${y})`}>
      <circle cx={-label.length * 3.1 - 8} cy={9} r={3.5} fill={colorOf(name)} />
      <text x={0} y={13} textAnchor="middle" fontSize={10.5} fill="var(--muted)" fontFamily="IBM Plex Mono">
        {label}
      </text>
    </g>
  );
}

// Vertical stacked bars per zone (sorted desc), segments by tracker type.
// rows (API): [{zone, tracker_id, tracker, open, closed}]
export default function OpenByZone({ rows, trackerList, selected }) {
  const app = useApp();
  const narrow = useNarrow();
  const active = trackerList.filter((t) => selected.includes(t.tuleap_tracker_id));
  const byZone = new Map();
  (rows || []).forEach((r) => {
    if (!selected.includes(r.tracker_id)) return;
    if (!byZone.has(r.zone)) byZone.set(r.zone, { zone: r.zone, __total: 0, __closed: 0 });
    const z = byZone.get(r.zone);
    z[r.tracker] = (z[r.tracker] || 0) + r.open;
    z.__total += r.open;
    z.__closed += r.closed;
  });
  const data = [...byZone.values()].filter((z) => z.__total > 0).sort((a, b) => b.__total - a.__total);
  if (data.length === 0) return <EmptyState msg="No tickets in this selection" />;

  const colorOf = (zone) =>
    zone === "Unlinked" ? "var(--faint)" : PALETTE[zoneIndex(app.zones, zone) % PALETTE.length];

  const build = (label, payload) => {
    const d = payload[0] && payload[0].payload;
    if (!d) return null;
    return {
      title: label,
      rows: [
        ...active.map((t) => [t.name + " open", fmtFull(d[t.name] || 0)]),
        ["closed (all)", fmtFull(d.__closed)],
      ],
      accent: colorOf(label),
    };
  };

  return (
    <div>
      <Legend items={active.map((t, i) => ({ color: trackerColor(t.name, i), label: t.name }))} />
      <div style={{ width: "100%", height: narrow ? 240 : 280 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 20, right: 10, bottom: 0, left: 0 }} barCategoryGap="28%">
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis
              dataKey="zone"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={<ZoneTick colorOf={colorOf} />}
              height={24}
            />
            <YAxis
              width={36}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10.5, fill: "var(--faint)", fontFamily: "IBM Plex Mono" }}
              allowDecimals={false}
            />
            <Tooltip content={<ChartTip build={build} />} cursor={{ fill: "var(--hover)" }} isAnimationActive={false} />
            {active.map((t, i) => (
              <Bar
                key={t.tuleap_tracker_id}
                dataKey={t.name}
                stackId="open"
                fill={trackerColor(t.name, i)}
                maxBarSize={66}
                radius={i === active.length - 1 ? [2, 2, 0, 0] : 0}
                isAnimationActive={false}
              >
                {i === active.length - 1 ? (
                  <LabelList
                    dataKey="__total"
                    position="top"
                    style={{ fontSize: 11.5, fontWeight: 600, fill: "var(--text)", fontFamily: "IBM Plex Mono" }}
                  />
                ) : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
