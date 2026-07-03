import React, { useEffect, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { api } from "../api.js";

// Headline panel: backlog trend line + opened/closed throughput bars combined.
export default function BacklogThroughput({ filters, trackerIds }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const params = {
      tracker: trackerIds, bucket: filters.bucket,
      from: filters.from, to: filters.to,
    };
    Promise.all([api.backlog(params), api.throughput(params)])
      .then(([backlog, throughput]) => {
        const byBucket = {};
        backlog.forEach((b) => {
          byBucket[b.bucket] = { bucket: b.bucket.slice(0, 10), open_count: b.open_count };
        });
        throughput.forEach((t) => {
          const key = t.bucket;
          byBucket[key] = { ...(byBucket[key] || { bucket: key.slice(0, 10) }),
            opened: t.opened, closed: t.closed };
        });
        setRows(Object.values(byBucket).sort((a, b) => a.bucket.localeCompare(b.bucket)));
      })
      .catch(() => setRows([]));
  }, [trackerIds, filters.bucket, filters.from, filters.to]);

  if (!rows.length) return <div className="empty">No tracker activity in this selection.</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid stroke="#262a33" />
        <XAxis dataKey="bucket" stroke="#9aa1ad" fontSize={11} minTickGap={24} />
        <YAxis stroke="#9aa1ad" fontSize={11} />
        <Tooltip contentStyle={{ background: "#181b22", border: "1px solid #262a33" }} />
        <Legend />
        <Bar dataKey="opened" fill="#35c28b" name="Opened" />
        <Bar dataKey="closed" fill="#e06c75" name="Closed" />
        <Line type="monotone" dataKey="open_count" stroke="#4f8cff" strokeWidth={2}
          dot={false} name="Backlog (open)" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
