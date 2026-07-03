import React from "react";
import { fmt, fmtFull, METRIC_LABEL } from "../lib/format.js";
import { useTip } from "./Tooltip.jsx";
import { EmptyState } from "./ui.jsx";

// Horizontal bars per author, descending, accent fill, mono value right.
export default function Contributors({ rows, metric, limit = 8 }) {
  const tip = useTip();
  const top = (rows || []).slice(0, limit);
  if (top.length === 0) return <EmptyState />;
  const max = Math.max(...top.map((r) => r.value), 1);
  const sum = (rows || []).reduce((s, r) => s + r.value, 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, paddingTop: 2 }}>
      {top.map((r, i) => (
        <div
          key={r.author}
          onMouseMove={(e) =>
            tip.show(e, {
              title: r.author,
              rows: [
                [METRIC_LABEL[metric], fmtFull(r.value)],
                ["share", ((r.value / sum) * 100).toFixed(1) + "%"],
              ],
              accent: "var(--accent)",
            })
          }
          onMouseLeave={tip.hide}
          style={{ display: "grid", gridTemplateColumns: "120px 1fr 52px", alignItems: "center", gap: 10, cursor: "default" }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {r.author}
          </div>
          <div className="bar-track" style={{ height: 22 }}>
            <div
              className="bar-fill"
              style={{
                position: "absolute",
                inset: 0,
                width: (r.value / max) * 100 + "%",
                background:
                  i === 0
                    ? "var(--accent)"
                    : "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 55%, transparent))",
              }}
            />
          </div>
          <div className="mono" style={{ fontSize: 12.5, textAlign: "right", color: "var(--muted)", fontWeight: 500 }}>
            {fmt(r.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
