import React from "react";
import { fmt, fmtFull } from "../lib/format.js";
import { useMeasure, useNarrow } from "../lib/hooks.js";
import { useTip } from "./Tooltip.jsx";
import { EmptyState } from "./ui.jsx";

// Heatmap matrix: rows × time buckets, cell opacity ∝ value.
// rows: [{name, color?, dot?, total, cells: number[]}]
// Zone activity passes per-row colors + dots; committer activity uses accent.
export default function MatrixPanel({ rows, buckets, bucket, metricLabel, rowH = 24, footer }) {
  const tip = useTip();
  const narrow = useNarrow();
  const [ref, width] = useMeasure();
  const nb = buckets.length;
  if (nb === 0 || rows.length === 0) return <EmptyState />;

  const Lw = narrow ? 94 : 154;
  const Tw = 56;
  const gap = 3;
  const topH = 18;
  const avail = Math.max(200, (width || 900)) - Lw - Tw;
  const cellW = Math.max(bucket === "week" ? 9 : 26, avail / nb);
  const W = Lw + nb * cellW + Tw;
  const H = topH + rows.length * (rowH + gap);
  const max = Math.max(...rows.flatMap((r) => r.cells), 0.0001);
  const step = Math.ceil(nb / (narrow ? 6 : 12));

  return (
    <div>
      <div ref={ref} className="scroll-x">
        <svg width={W} height={H} style={{ display: "block" }} onMouseLeave={tip.hide}>
          {buckets.map((b, c) =>
            c % step === 0 ? (
              <text key={"t" + c} x={Lw + c * cellW + cellW / 2} y={12} textAnchor="middle" fontSize={9.5} fill="var(--faint)" fontFamily="IBM Plex Mono">
                {b.label}
              </text>
            ) : null
          )}
          {rows.map((r, ri) => {
            const y = topH + ri * (rowH + gap);
            const color = r.color || "var(--accent)";
            return (
              <g key={r.name}>
                {r.dot ? <circle cx={5} cy={y + rowH / 2} r={4} fill={color} /> : null}
                <text x={r.dot ? 15 : 0} y={y + rowH / 2 + 4} fontSize={12} fill="var(--text)" fontWeight={500}>
                  {r.name.length > (Lw - (r.dot ? 22 : 8)) / 7
                    ? r.name.slice(0, Math.floor((Lw - (r.dot ? 22 : 8)) / 7) - 1) + "…"
                    : r.name}
                </text>
                {r.cells.map((v, c) => (
                  <rect
                    key={c}
                    x={Lw + c * cellW + 0.6}
                    y={y}
                    width={Math.max(1, cellW - 1.2)}
                    height={rowH}
                    rx={2.5}
                    fill={color}
                    fillOpacity={0.06 + 0.94 * (v / max)}
                    onMouseMove={(e) =>
                      tip.show(e, {
                        title: r.name + " · " + buckets[c].label,
                        rows: [[metricLabel, fmtFull(v)]],
                        accent: color,
                      })
                    }
                    onMouseLeave={tip.hide}
                  />
                ))}
                <text x={W - 4} y={y + rowH / 2 + 4} textAnchor="end" fontSize={11.5} fill="var(--muted)" fontFamily="IBM Plex Mono" fontWeight={500}>
                  {fmt(r.total)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {footer}
    </div>
  );
}
