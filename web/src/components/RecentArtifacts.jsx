import React from "react";
import { statusColor } from "../lib/color.js";
import { refLabel } from "../lib/format.js";
import { useApp } from "../App.jsx";
import { EmptyState, icons } from "./ui.jsx";

// Cross-linked artifact list: ref, title+assignee, status, linked-commit
// count with link icon, chevron. Click → detail drawer.
export default function RecentArtifacts({ rows }) {
  const app = useApp();
  if (!rows || rows.length === 0) return <EmptyState msg="No artifacts in this selection" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {rows.map((a) => (
        <button
          key={a.artifact_id}
          className="hover-row"
          onClick={() => app.setDrawer({ type: "artifact", id: a.artifact_id })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 12px",
            border: "none",
            borderRadius: 10,
            background: "transparent",
            cursor: "pointer",
            textAlign: "left",
            color: "var(--text)",
          }}
        >
          <span className="mono" style={{ fontSize: 11.5, color: "var(--accent)", flexShrink: 0, width: 78 }}>
            {refLabel(a.tracker, a.artifact_id)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {a.title}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{a.assignee}</div>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: statusColor(a.status), fontWeight: 600, flexShrink: 0 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor(a.status) }} />
            {a.status}
          </span>
          <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--muted)", flexShrink: 0 }}>
            {icons.link}
            {a.linked_commits}
          </span>
          {icons.chevronRight}
        </button>
      ))}
    </div>
  );
}
