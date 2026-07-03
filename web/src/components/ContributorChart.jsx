import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api.js";

export default function ContributorChart({ filters, metric, path }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.contributors({
      repo: filters.repos, metric, path,
      from: filters.from, to: filters.to,
    }).then(setRows).catch(() => setRows([]));
  }, [filters.repos, filters.from, filters.to, metric, path]);

  const data = rows.slice(0, 15);

  if (!data.length) return <div className="empty">No contributors in this selection.</div>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 16 }}>
        <CartesianGrid horizontal={false} stroke="#262a33" />
        <XAxis type="number" stroke="#9aa1ad" fontSize={11} />
        <YAxis type="category" dataKey="author" width={120} stroke="#9aa1ad" fontSize={11} />
        <Tooltip cursor={{ fill: "rgba(79,140,255,0.08)" }}
          contentStyle={{ background: "#181b22", border: "1px solid #262a33" }} />
        <Bar dataKey="value" fill="#4f8cff" radius={[0, 4, 4, 0]} name={metric} />
      </BarChart>
    </ResponsiveContainer>
  );
}
