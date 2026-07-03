import React, { useEffect, useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../api.js";

const COLORS = ["#4f8cff", "#35c28b", "#f4b740", "#c678dd", "#e06c75", "#56b6c2", "#98c379"];

// Drill-down treemap: each render shows one path level; clicking a directory
// node drills in, breadcrumbs walk back out.
export default function ActivityTreemap({ filters, metric, path, setPath }) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.tree({
      repo: filters.repos, metric, path,
      from: filters.from, to: filters.to,
    })
      .then((res) => setChildren(res.children || []))
      .catch(() => setChildren([]))
      .finally(() => setLoading(false));
  }, [filters.repos, filters.from, filters.to, metric, path]);

  const data = children.map((c, i) => ({
    name: c.name,
    size: Math.max(c.value, 0.0001),
    value: c.value,
    commits: c.commits,
    isLeaf: c.is_leaf,
    fullPath: c.path,
    fill: COLORS[i % COLORS.length],
  }));

  const crumbs = path ? path.replace(/\/$/, "").split("/") : [];

  const onClick = (node) => {
    if (node && !node.isLeaf) setPath(node.fullPath);
  };

  return (
    <div>
      <div className="breadcrumb">
        <a onClick={() => setPath("")}>root</a>
        {crumbs.map((c, i) => {
          const p = crumbs.slice(0, i + 1).join("/") + "/";
          return (
            <span key={p}>
              {" / "}
              <a onClick={() => setPath(p)}>{c}</a>
            </span>
          );
        })}
      </div>

      {loading ? (
        <div className="empty">Loading…</div>
      ) : data.length === 0 ? (
        <div className="empty">No activity in this selection.</div>
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <Treemap
            data={data}
            dataKey="size"
            nameKey="name"
            stroke="#0f1115"
            isAnimationActive={false}
            content={<Cell onClick={onClick} />}
          >
            <Tooltip content={<TreeTooltip metric={metric} />} />
          </Treemap>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// Custom cell renderer so we can color, label, and handle clicks.
function Cell(props) {
  const { x, y, width, height, name, fill, isLeaf, onClick, payload } = props;
  const node = payload || props;
  if (width < 1 || height < 1) return null;
  return (
    <g onClick={() => onClick && onClick(node)}>
      <rect
        x={x} y={y} width={width} height={height}
        className="treemap-node"
        style={{ fill: fill || node.fill, cursor: node.isLeaf ? "default" : "pointer" }}
      />
      {width > 46 && height > 18 && (
        <text className="treemap-label" x={x + 5} y={y + 15}>
          {node.isLeaf ? name : `${name}/`}
        </text>
      )}
    </g>
  );
}

function TreeTooltip({ active, payload, metric }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="panel" style={{ padding: "8px 10px" }}>
      <div><strong>{d.isLeaf ? d.name : d.name + "/"}</strong></div>
      <div>{metric}: {d.value}</div>
      {metric !== "commits" && <div>commits: {d.commits}</div>}
      {!d.isLeaf && <div className="sub">click to drill in</div>}
    </div>
  );
}
