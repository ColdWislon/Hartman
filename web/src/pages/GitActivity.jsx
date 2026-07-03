import React, { useState } from "react";
import ActivityTreemap from "../components/Treemap.jsx";
import ContributorChart from "../components/ContributorChart.jsx";
import TrendLine from "../components/TrendLine.jsx";

const METRICS = ["commits", "churn", "files"];

export default function GitActivity({ filters }) {
  const [metric, setMetric] = useState("commits");
  const [path, setPath] = useState(""); // treemap drill path, shared with charts

  return (
    <div className="grid">
      <div className="panel full">
        <h3>Activity by path</h3>
        <div className="metric-toggle">
          {METRICS.map((m) => (
            <button key={m} className={m === metric ? "active" : ""} onClick={() => setMetric(m)}>
              {m}
            </button>
          ))}
        </div>
        <ActivityTreemap filters={filters} metric={metric} path={path} setPath={setPath} />
      </div>

      <div className="panel">
        <h3>Contributors</h3>
        <div className="sub">{path ? `scoped to ${path}` : "all paths"} · {metric}</div>
        <ContributorChart filters={filters} metric={metric} path={path} />
      </div>

      <div className="panel">
        <h3>Trend</h3>
        <div className="sub">{path ? `scoped to ${path}` : "all paths"} · {metric} per {filters.bucket}</div>
        <TrendLine filters={filters} metric={metric} path={path} />
      </div>
    </div>
  );
}
