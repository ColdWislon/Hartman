import React from "react";
import { AMBER } from "../lib/color.js";
import { useTip } from "./Tooltip.jsx";
import { EmptyState, Legend } from "./ui.jsx";

function MiniBar({ v, max, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="bar-track" style={{ flex: 1, height: 8, borderRadius: 4 }}>
        <div className="bar-fill" style={{ width: (Math.max(0, v || 0) / max) * 100 + "%", background: color, borderRadius: 4 }} />
      </div>
      <div className="mono" style={{ width: 34, fontSize: 11.5, color: "var(--muted)", textAlign: "right" }}>
        {v == null ? "–" : Math.round(v) + "d"}
      </div>
    </div>
  );
}

// Per assignee: two thin bars — median days-to-close (accent) and median open
// age (amber) — with `Nd` mono values.
export function CycleBars({ rows, limit = 9 }) {
  const tip = useTip();
  const top = (rows || [])
    .slice()
    .sort((a, b) => (b.median_open_age_days || 0) - (a.median_open_age_days || 0))
    .slice(0, limit);
  if (top.length === 0) return <EmptyState />;
  const max = Math.max(...top.flatMap((r) => [r.median_days_to_close || 0, r.median_open_age_days || 0]), 1);
  return (
    <div>
      <Legend
        items={[
          { color: "var(--accent)", label: "Median close (d)" },
          { color: AMBER, label: "Median age of open (d)" },
        ]}
        style={{ gap: 16, marginBottom: 14 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {top.map((r) => (
          <div
            key={r.assignee}
            style={{ cursor: "default" }}
            onMouseMove={(e) =>
              tip.show(e, {
                title: r.assignee,
                rows: [
                  ["median close", r.median_days_to_close == null ? "–" : Math.round(r.median_days_to_close) + " d"],
                  ["median age", r.median_open_age_days == null ? "–" : Math.round(r.median_open_age_days) + " d"],
                  ["open", r.open_count],
                  ["closed", r.closed_count],
                ],
                accent: "var(--accent)",
              })
            }
            onMouseLeave={tip.hide}
          >
            <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 5 }}>{r.assignee}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <MiniBar v={r.median_days_to_close} max={max} color="var(--accent)" />
              <MiniBar v={r.median_open_age_days} max={max} color={AMBER} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Companion table: sticky micro-caps header, mono numerics, tinted medians.
export function CycleTable({ rows }) {
  const sorted = (rows || []).slice().sort((a, b) => b.closed_count - a.closed_count);
  if (sorted.length === 0) return <EmptyState />;
  const num = (v) => (v == null ? "–" : Math.round(v));
  return (
    <div className="scroll-x" style={{ maxHeight: 352, overflowY: "auto", margin: "-4px -6px", borderRadius: 8 }}>
      <table className="data">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Assignee</th>
            <th>Open</th>
            <th>Closed</th>
            <th>Close (d)</th>
            <th>Age (d)</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.assignee}>
              <td style={{ textAlign: "left" }}>{r.assignee}</td>
              <td className="mono" style={{ color: "var(--muted)" }}>{r.open_count}</td>
              <td className="mono">{r.closed_count}</td>
              <td className="mono" style={{ color: "var(--accent)" }}>{num(r.median_days_to_close)}</td>
              <td className="mono" style={{ color: AMBER }}>{num(r.median_open_age_days)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
