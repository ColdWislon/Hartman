import React from "react";
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmtFull, niceMax } from "../lib/format.js";
import { useNarrow } from "../lib/hooks.js";
import { ChartTip } from "./Tooltip.jsx";
import { EmptyState, Legend } from "./ui.jsx";

const AXIS_TICK = { fontSize: 10.5, fontFamily: "IBM Plex Mono" };

// Hero: backlog line (accent, gradient area) in the top band; paired
// opened/closed bars growing from the baseline in the bottom ~46%.
// Both bands live in one chart via offset axis domains.
export default function BacklogHero({ data }) {
  const narrow = useNarrow();
  if (!data || data.length === 0) return <EmptyState msg="No activity in this selection" />;

  const openMax = niceMax(Math.max(...data.map((d) => d.open_count), 1));
  const thruMax = niceMax(Math.max(...data.flatMap((d) => [d.opened, d.closed]), 1));
  // line band = top 54% → value 0 sits at 46% of the left axis
  const K = 0.46 / 0.54;
  const step = Math.ceil(data.length / (narrow ? 5 : 9));

  const build = (label, payload) => {
    const d = payload[0] && payload[0].payload;
    if (!d) return null;
    const net = d.opened - d.closed;
    return {
      title: label,
      rows: [
        ["open backlog", fmtFull(d.open_count)],
        ["opened", "+" + d.opened],
        ["closed", "−" + d.closed],
        ["net", (net >= 0 ? "+" : "") + net],
      ],
      accent: "var(--accent)",
    };
  };

  return (
    <div>
      <Legend
        items={[
          { color: "var(--accent)", label: "Open backlog", shape: "line" },
          { color: "var(--green)", label: "Opened" },
          { color: "var(--red)", label: "Closed" },
        ]}
        style={{ gap: 16, marginBottom: 12 }}
      />
      <div style={{ width: "100%", height: narrow ? 300 : 380 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barGap={1}>
            <defs>
              <linearGradient id="backlog-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                <stop offset="54%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ ...AXIS_TICK, fontSize: 10, fill: "var(--faint)" }} interval={step - 1} />
            <YAxis
              yAxisId="backlog"
              width={42}
              domain={[-K * openMax, openMax]}
              ticks={[0, Math.round(openMax / 2), openMax]}
              tickLine={false}
              axisLine={false}
              tick={{ ...AXIS_TICK, fill: "var(--accent)", opacity: 0.8 }}
            />
            <YAxis
              yAxisId="thru"
              orientation="right"
              width={46}
              domain={[0, thruMax / 0.46]}
              ticks={[0, thruMax]}
              tickLine={false}
              axisLine={false}
              tick={{ ...AXIS_TICK, fill: "var(--faint)" }}
            />
            <Tooltip content={<ChartTip build={build} />} cursor={{ stroke: "var(--border2)" }} isAnimationActive={false} />
            <Bar yAxisId="thru" dataKey="opened" fill="var(--green)" radius={[1.5, 1.5, 0, 0]} maxBarSize={11} isAnimationActive={false} />
            <Bar yAxisId="thru" dataKey="closed" fill="var(--red)" radius={[1.5, 1.5, 0, 0]} maxBarSize={11} isAnimationActive={false} />
            <Area
              yAxisId="backlog"
              dataKey="open_count"
              stroke="none"
              fill="url(#backlog-area)"
              baseValue={0}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="backlog"
              dataKey="open_count"
              stroke="var(--accent)"
              strokeWidth={2.4}
              strokeLinecap="round"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
