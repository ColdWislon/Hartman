import React from "react";
import { fmt, fmtFull, METRIC_LABEL } from "../lib/format.js";
import { useTip } from "./Tooltip.jsx";
import { EmptyState } from "./ui.jsx";

// Top leaf files under the current path: dir/ in faint mono + filename 600
// mono, bar in scope color, value right.
export default function TopFiles({ rows, metric, scopeColor }) {
  const tip = useTip();
  if (!rows || rows.length === 0) return <EmptyState msg="No files in this selection" />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 2 }}>
      {rows.map((r) => {
        const parts = r.path.split("/");
        const name = parts.pop();
        const dir = parts.join("/") + "/";
        return (
          <div
            key={r.path}
            style={{ cursor: "default" }}
            onMouseMove={(e) =>
              tip.show(e, {
                title: r.path,
                rows: [
                  [METRIC_LABEL[metric], fmtFull(r.value)],
                  ["commits", fmtFull(r.commits)],
                ],
                accent: scopeColor,
              })
            }
            onMouseLeave={tip.hide}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5, alignItems: "baseline" }}>
              <div style={{ minWidth: 0, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span className="mono" style={{ color: "var(--faint)", fontSize: 11 }}>{dir}</span>
                <span className="mono" style={{ fontWeight: 600 }}>{name}</span>
              </div>
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>
                {fmt(r.value)}
              </span>
            </div>
            <div className="bar-track" style={{ height: 7, borderRadius: 4 }}>
              <div className="bar-fill" style={{ width: (r.value / max) * 100 + "%", background: scopeColor, borderRadius: 4 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
