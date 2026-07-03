import React from "react";
import { fmt, fmtFull, METRIC_LABEL } from "../lib/format.js";
import { useNarrow } from "../lib/hooks.js";
import { useTip } from "./Tooltip.jsx";
import { Dot, EmptyState } from "./ui.jsx";

// Per committer, 100% stacked bar segmented by top-level part.
// rows (API): [{author, part, value}]
export default function ContributionMix({ rows, metric, partColor, limit = 12 }) {
  const tip = useTip();
  const narrow = useNarrow();
  if (!rows || rows.length === 0) return <EmptyState msg="No sub-paths at this level" />;

  const partTotals = new Map();
  const byAuthor = new Map();
  rows.forEach((r) => {
    partTotals.set(r.part, (partTotals.get(r.part) || 0) + r.value);
    if (!byAuthor.has(r.author)) byAuthor.set(r.author, []);
    byAuthor.get(r.author).push(r);
  });
  const parts = [...partTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const colorOf = (name) => partColor(name, parts.indexOf(name), parts.length);

  const authors = [...byAuthor.entries()]
    .map(([author, list]) => ({
      author,
      total: list.reduce((s, r) => s + r.value, 0),
      parts: parts
        .map((p) => ({ name: p, value: (list.find((r) => r.part === p) || {}).value || 0 }))
        .filter((p) => p.value > 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14, fontSize: 11.5, color: "var(--muted)" }}>
        {parts.map((p) => (
          <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Dot color={colorOf(p)} />
            {p}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {authors.map((r) => (
          <div
            key={r.author}
            style={{
              display: "grid",
              gridTemplateColumns: narrow ? "96px 1fr 46px" : "134px 1fr 52px",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.author}
            </div>
            <div style={{ display: "flex", height: 20, borderRadius: 5, overflow: "hidden", background: "var(--track)" }}>
              {r.parts.map((p) => {
                const pct = r.total ? (p.value / r.total) * 100 : 0;
                if (pct < 0.4) return null;
                return (
                  <div
                    key={p.name}
                    onMouseMove={(e) =>
                      tip.show(e, {
                        title: r.author + " · " + p.name,
                        rows: [
                          [METRIC_LABEL[metric], fmtFull(p.value)],
                          ["share", pct.toFixed(1) + "%"],
                        ],
                        accent: colorOf(p.name),
                      })
                    }
                    onMouseLeave={tip.hide}
                    style={{ width: pct + "%", background: colorOf(p.name), borderRight: "1px solid var(--panel)", transition: "width .3s" }}
                  />
                );
              })}
            </div>
            <div className="mono" style={{ fontSize: 12, textAlign: "right", color: "var(--muted)" }}>
              {fmt(r.total)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
