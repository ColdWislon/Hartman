import React from "react";
import { fmtFull, METRIC_LABEL } from "../lib/format.js";
import { useMeasure } from "../lib/hooks.js";
import { useTip } from "./Tooltip.jsx";
import { EmptyState, IntensityLegend } from "./ui.jsx";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// weekday(7) × hour(24) punchcard heatmap, accent-intensity cells.
export default function Punchcard({ rows, metric }) {
  const tip = useTip();
  const [ref, width] = useMeasure();
  if (!rows || rows.length === 0) return <EmptyState />;

  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  rows.forEach((r) => {
    if (r.dow >= 0 && r.dow < 7 && r.hour >= 0 && r.hour < 24) grid[r.dow][r.hour] = r.value;
  });
  const max = Math.max(...grid.flat(), 0.0001);
  let peak = { v: -1, d: 0, h: 0 };
  grid.forEach((row, d) => row.forEach((v, h) => { if (v > peak.v) peak = { v, d, h }; }));

  const W = Math.max(360, width || 900);
  const P = { l: 36, r: 6, t: 6, b: 22 };
  const cell = (W - P.l - P.r) / 24;
  const gap = 3;
  const rh = Math.min(26, Math.max(14, cell));
  const H = P.t + P.b + 7 * rh + 6 * gap;

  return (
    <div>
      <div ref={ref} className="scroll-x">
        <svg width={W} height={H} style={{ display: "block", maxWidth: "100%" }} onMouseLeave={tip.hide}>
          {DAYS.map((dl, r) => (
            <text key={dl} x={P.l - 8} y={P.t + r * (rh + gap) + rh / 2 + 4} textAnchor="end" fontSize={10.5} fill="var(--faint)" fontFamily="IBM Plex Mono">
              {dl}
            </text>
          ))}
          {grid.map((row, r) =>
            row.map((v, c) => (
              <rect
                key={r + "-" + c}
                x={P.l + c * cell + 0.6}
                y={P.t + r * (rh + gap)}
                width={Math.max(1, cell - 1.2)}
                height={rh}
                rx={3}
                fill="var(--accent)"
                fillOpacity={0.05 + 0.95 * (v / max)}
                onMouseMove={(e) =>
                  tip.show(e, {
                    title: DAYS[r] + " · " + String(c).padStart(2, "0") + ":00",
                    rows: [[METRIC_LABEL[metric], fmtFull(v)]],
                    accent: "var(--accent)",
                  })
                }
                onMouseLeave={tip.hide}
              />
            ))
          )}
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hh) => (
            <text key={hh} x={P.l + hh * cell + cell / 2} y={H - 7} textAnchor="middle" fontSize={9.5} fill="var(--faint)" fontFamily="IBM Plex Mono">
              {hh}
            </text>
          ))}
        </svg>
      </div>
      <IntensityLegend right={`peak: ${DAYS[peak.d]} ${String(peak.h).padStart(2, "0")}:00`} />
    </div>
  );
}
