import React from "react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, ReferenceLine, ResponsiveContainer } from "recharts";
import { AGE_BANDS, ageBand, statusColor } from "../lib/color.js";
import { refLabel } from "../lib/format.js";
import { useApp } from "../App.jsx";
import { useNarrow } from "../lib/hooks.js";
import { ChartTip } from "./Tooltip.jsx";
import { Dot, EmptyState } from "./ui.jsx";

function SummaryCards({ tickets, median }) {
  const total = tickets.length;
  const counts = AGE_BANDS.map((b) => ({
    ...b,
    n: tickets.filter((t) => t.age_days >= b.lo && t.age_days <= b.hi).length,
  }));
  const card = (body, key) => (
    <div key={key} style={{ padding: "12px 14px", background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 12 }}>
      {body}
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 16 }}>
      {card(
        <>
          <div className="micro-caps" style={{ letterSpacing: 0.5 }}>Open</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginTop: 3 }}>{total}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>median age {median}d</div>
        </>,
        "open"
      )}
      {counts.map((c) =>
        card(
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
              <Dot color={c.color} size={8} />
              {c.label}
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 600, marginTop: 3 }}>{c.n}</div>
            <div style={{ height: 4, borderRadius: 2, background: "var(--track)", marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: (total ? (c.n / total) * 100 : 0) + "%", background: c.color, borderRadius: 2 }} />
            </div>
          </>,
          c.label
        )
      )}
    </div>
  );
}

function MedianChip({ viewBox, median }) {
  const { x } = viewBox;
  return (
    <g>
      <rect x={x - 30} y={2} width={60} height={15} rx={4} fill="var(--text)" opacity={0.9} />
      <text x={x} y={13} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--panel)" fontFamily="IBM Plex Mono">
        med {median}d
      </text>
    </g>
  );
}

function Histogram({ tickets, median }) {
  const BIN = 15;
  const maxAge = Math.max(...tickets.map((t) => t.age_days), 1);
  const nb = Math.max(1, Math.ceil((maxAge + 1) / BIN));
  const bins = Array.from({ length: nb }, (_, i) => ({ lo: i * BIN, label: String(i * BIN), n: 0 }));
  tickets.forEach((t) => {
    bins[Math.min(nb - 1, Math.floor(t.age_days / BIN))].n++;
  });
  const medianBin = bins[Math.min(nb - 1, Math.floor(median / BIN))].label;

  const build = (label, payload) => {
    const d = payload[0] && payload[0].payload;
    if (!d) return null;
    const hi = d.lo + BIN - 1;
    return {
      title: `${d.lo}–${Math.min(hi, Math.ceil(maxAge))} days`,
      rows: [
        ["tickets", d.n],
        ["share", ((d.n / tickets.length) * 100).toFixed(0) + "%"],
      ],
      accent: ageBand(d.lo + BIN / 2).color,
    };
  };

  return (
    <div style={{ margin: "2px 0 18px" }}>
      <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>
        distribution of open-ticket age · 15-day bins
      </div>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={bins} margin={{ top: 18, right: 12, bottom: 0, left: 0 }} barCategoryGap="8%">
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--faint)", fontFamily: "IBM Plex Mono" }} />
            <YAxis width={30} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: "var(--faint)", fontFamily: "IBM Plex Mono" }} />
            <Tooltip content={<ChartTip build={build} />} cursor={{ fill: "var(--hover)" }} isAnimationActive={false} />
            <ReferenceLine
              x={medianBin}
              stroke="var(--text)"
              strokeWidth={1.4}
              strokeDasharray="3 3"
              opacity={0.55}
              label={<MedianChip median={median} />}
            />
            <Bar dataKey="n" radius={[4, 4, 0, 0]} fillOpacity={0.9} isAnimationActive={false}>
              {bins.map((b) => (
                <Cell key={b.lo} fill={ageBand(b.lo + BIN / 2).color} />
              ))}
              <LabelList
                dataKey="n"
                position="top"
                formatter={(v) => (v > 0 ? v : "")}
                style={{ fontSize: 11, fontWeight: 600, fill: "var(--text)", fontFamily: "IBM Plex Mono" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Summary strip + distribution histogram + every open ticket, oldest first.
export default function OpenAge({ tickets }) {
  const app = useApp();
  const narrow = useNarrow();
  if (!tickets || tickets.length === 0) return <EmptyState msg="No open tickets in this selection" />;

  const ages = tickets.map((t) => t.age_days).sort((a, b) => a - b);
  const m = ages.length;
  const median = Math.round(m % 2 ? ages[(m - 1) / 2] : (ages[m / 2 - 1] + ages[m / 2]) / 2);
  const maxAge = Math.max(...ages, 1);

  return (
    <div>
      <SummaryCards tickets={tickets} median={median} />
      <Histogram tickets={tickets} median={median} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {tickets.map((t) => {
          const band = ageBand(t.age_days);
          const age = Math.round(t.age_days);
          return (
            <div
              key={t.artifact_id}
              className="hover-row"
              onClick={() => app.setDrawer({ type: "artifact", id: t.artifact_id })}
              style={{
                display: "grid",
                gridTemplateColumns: narrow ? "70px 1fr 96px" : "82px 1fr 130px 150px 96px",
                alignItems: "center",
                gap: 12,
                padding: "11px 12px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              <span className="mono" style={{ fontSize: 11.5, color: "var(--accent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {refLabel(t.tracker, t.artifact_id)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.title}
                </div>
                {narrow ? <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{t.assignee}</div> : null}
              </div>
              {!narrow ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: statusColor(t.status), fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(t.status) }} />
                  {t.status}
                </span>
              ) : null}
              {!narrow ? (
                <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.assignee}
                </span>
              ) : null}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="bar-track" style={{ flex: 1, height: 7, borderRadius: 4 }}>
                  <div className="bar-fill" style={{ width: (t.age_days / maxAge) * 100 + "%", background: band.color, borderRadius: 4 }} />
                </div>
                <span className="mono" style={{ fontSize: 12, color: "var(--muted)", width: 34, textAlign: "right" }}>
                  {age}d
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
