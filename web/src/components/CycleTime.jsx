import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api.js";

// Secondary panel: median time-to-close + age-of-open, broken down per assignee.
export default function CycleTime({ trackerIds }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.cycletime({ tracker: trackerIds, by: "assignee" })
      .then(setRows).catch(() => setRows([]));
  }, [trackerIds]);

  const data = rows.map((r) => ({
    assignee: r.assignee,
    median_close: r.median_days_to_close != null ? Math.round(r.median_days_to_close * 10) / 10 : 0,
    median_age: r.median_open_age_days != null ? Math.round(r.median_open_age_days * 10) / 10 : 0,
    open_count: r.open_count,
    closed_count: r.closed_count,
  }));

  if (!data.length) return <div className="empty">No cycle-time data.</div>;

  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 16 }}>
          <CartesianGrid horizontal={false} stroke="#262a33" />
          <XAxis type="number" stroke="#9aa1ad" fontSize={11}
            label={{ value: "days", position: "insideBottom", fill: "#9aa1ad", fontSize: 10 }} />
          <YAxis type="category" dataKey="assignee" width={110} stroke="#9aa1ad" fontSize={11} />
          <Tooltip contentStyle={{ background: "#181b22", border: "1px solid #262a33" }} />
          <Legend />
          <Bar dataKey="median_close" fill="#4f8cff" name="Median days to close" radius={[0, 4, 4, 0]} />
          <Bar dataKey="median_age" fill="#f4b740" name="Median open age" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <table className="data">
        <thead>
          <tr><th>Assignee</th><th>Open</th><th>Closed</th><th>Median close (d)</th><th>Median age (d)</th></tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.assignee}>
              <td>{d.assignee}</td>
              <td>{d.open_count}</td>
              <td>{d.closed_count}</td>
              <td>{d.median_close || "—"}</td>
              <td>{d.median_age || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
