import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api.js";

function fmtBucket(iso) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export default function TrendLine({ filters, metric, path }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api.timeseries({
      repo: filters.repos, metric, bucket: filters.bucket, path,
      from: filters.from, to: filters.to,
    }).then(setRows).catch(() => setRows([]));
  }, [filters.repos, filters.from, filters.to, filters.bucket, metric, path]);

  const data = rows.map((r) => ({ bucket: fmtBucket(r.bucket), value: r.value }));

  if (!data.length) return <div className="empty">No trend data in this selection.</div>;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid stroke="#262a33" />
        <XAxis dataKey="bucket" stroke="#9aa1ad" fontSize={11} minTickGap={24} />
        <YAxis stroke="#9aa1ad" fontSize={11} />
        <Tooltip contentStyle={{ background: "#181b22", border: "1px solid #262a33" }} />
        <Line type="monotone" dataKey="value" stroke="#35c28b" strokeWidth={2}
          dot={false} name={metric} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
