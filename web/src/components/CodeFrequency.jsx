import React from "react";
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmt, fmtFull, niceMax } from "../lib/format.js";
import { useNarrow } from "../lib/hooks.js";
import { ChartTip } from "./Tooltip.jsx";
import { EmptyState, Legend } from "./ui.jsx";

const AXIS_TICK = { fontSize: 10, fill: "var(--faint)", fontFamily: "IBM Plex Mono" };

// Diverging area: additions above the zero line (green), deletions below (red).
export default function CodeFrequency({ data }) {
  const narrow = useNarrow();
  if (!data || data.length === 0) return <EmptyState />;

  const rows = data.map((d) => ({ label: d.label, add: d.additions, del: -d.deletions }));
  const yMax = niceMax(Math.max(...data.flatMap((d) => [d.additions, d.deletions]), 1));
  const step = Math.ceil(rows.length / (narrow ? 5 : 8));

  const build = (label, payload) => {
    const d = payload[0] && payload[0].payload;
    if (!d) return null;
    return {
      title: label,
      rows: [
        ["additions", "+" + fmtFull(d.add)],
        ["deletions", "−" + fmtFull(-d.del)],
      ],
      accent: "var(--green)",
    };
  };

  return (
    <div>
      <Legend
        items={[
          { color: "var(--green)", label: "Additions" },
          { color: "var(--red)", label: "Deletions" },
        ]}
        style={{ gap: 16 }}
      />
      <div style={{ width: "100%", height: 210 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="cf-add" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--green)" stopOpacity={0.32} />
                <stop offset="50%" stopColor="var(--green)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="cf-del" x1="0" y1="0" x2="0" y2="1">
                <stop offset="50%" stopColor="var(--red)" stopOpacity={0.02} />
                <stop offset="100%" stopColor="var(--red)" stopOpacity={0.32} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={step - 1} />
            <YAxis
              width={44}
              domain={[-yMax, yMax]}
              ticks={[-yMax, yMax]}
              tickFormatter={(v) => (v > 0 ? "+" + fmt(v) : "−" + fmt(-v))}
              tickLine={false}
              axisLine={false}
              tick={AXIS_TICK}
            />
            <ReferenceLine y={0} stroke="var(--border2)" />
            <Tooltip content={<ChartTip build={build} />} cursor={{ stroke: "var(--border2)" }} isAnimationActive={false} />
            <Area dataKey="add" stroke="var(--green)" strokeWidth={2} fill="url(#cf-add)" baseValue={0} dot={false} isAnimationActive={false} />
            <Area dataKey="del" stroke="var(--red)" strokeWidth={2} fill="url(#cf-del)" baseValue={0} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
