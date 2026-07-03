import React from "react";
import { useApp } from "../App.jsx";
import { PALETTE, lum, shade } from "../lib/color.js";
import { fmt, fmtFull, METRIC_LABEL } from "../lib/format.js";
import { squarify } from "../lib/squarify.js";
import { useMeasure, useNarrow, usePopover } from "../lib/hooks.js";
import { useTip } from "./Tooltip.jsx";
import { Seg, Dot, EmptyState } from "./ui.jsx";
import { icons } from "./ui.jsx";

function truncate(s, px) {
  const max = Math.floor(px / 7);
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + "…" : s;
}

function ZoneEditor() {
  const app = useApp();
  const update = (i, patch) =>
    app.setZones(app.zones.map((z, j) => (j === i ? { ...z, ...patch } : z)));
  return (
    <div
      className="pop"
      style={{ left: 0, right: "auto", top: 40, width: "min(calc(100vw - 40px), 430px)", padding: 14, zIndex: 55 }}
    >
      <div className="micro-caps" style={{ letterSpacing: 0.5, marginBottom: 4 }}>
        Zone definitions
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.4 }}>
        A file joins the first zone whose directory list contains any segment of its path.
        Comma-separate directory names.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
        {app.zones.map((z, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Dot color={PALETTE[i % PALETTE.length]} />
            <input
              className="zone-inp"
              style={{ flex: "0 0 96px" }}
              value={z.name}
              placeholder="zone"
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <input
              className="zone-inp"
              style={{ flex: "1 1 auto" }}
              value={(z.dirs || []).join(", ")}
              placeholder="ip, block, …"
              onChange={(e) =>
                update(i, { dirs: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
              }
            />
            <button
              className="icon-btn"
              style={{ width: 30, height: 30, color: "var(--muted)" }}
              title="Remove zone"
              onClick={() => app.setZones(app.zones.filter((_, j) => j !== i))}
            >
              {icons.minus}
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => app.setZones([...app.zones, { name: "New zone", dirs: [] }])}
        style={{
          marginTop: 12,
          cursor: "pointer",
          width: "100%",
          height: 34,
          borderRadius: 8,
          border: "1px dashed var(--border2)",
          background: "transparent",
          color: "var(--accent)",
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        + Add zone
      </button>
    </div>
  );
}

function GroupControl() {
  const app = useApp();
  const [open, setOpen] = usePopover();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
      <span className="micro-caps" style={{ letterSpacing: 0.5 }}>
        Group by
      </span>
      <Seg
        options={[
          { v: "repo", l: "Repository" },
          { v: "zone", l: "Zone" },
        ]}
        value={app.groupBy}
        onPick={app.setGroupBy}
      />
      {app.groupBy === "zone" ? (
        <div data-pop="1" style={{ position: "relative" }}>
          <button
            className={"ctl-btn" + (open ? " active" : "")}
            style={{ height: 32, padding: "0 12px", gap: 7 }}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
          >
            {icons.gear}
            Configure zones
          </button>
          {open ? <ZoneEditor /> : null}
        </div>
      ) : null}
    </div>
  );
}

function Breadcrumb() {
  const app = useApp();
  const segs = [app.groupBy === "zone" ? "zones" : "repos", ...app.drill];
  return (
    <div
      className="mono"
      style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 12, fontSize: 12.5 }}
    >
      {segs.map((s, i) => {
        const last = i === segs.length - 1;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {i > 0 ? <span style={{ color: "var(--faint)" }}>/</span> : null}
            <button
              onClick={() => app.setDrill(app.drill.slice(0, i))}
              disabled={last}
              className="mono"
              style={{
                cursor: last ? "default" : "pointer",
                border: "none",
                background: last ? "var(--accentweak)" : "transparent",
                color: last ? "var(--accent)" : "var(--muted)",
                padding: "3px 7px",
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: last ? 600 : 500,
              }}
            >
              {s}
            </button>
          </span>
        );
      })}
    </div>
  );
}

// children: [{name, path, is_leaf, value, commits, churn, files}]
export default function TreemapPanel({ children, total, rootIndexOf }) {
  const app = useApp();
  const tip = useTip();
  const narrow = useNarrow();
  const [ref, width] = useMeasure();
  const H = narrow ? 340 : 440;
  const W = Math.max(320, width || 900);

  const items = (children || []).filter((c) => c.value > 0);
  const sorted = items.slice().sort((a, b) => b.value - a.value);
  const rects = squarify(
    items.map((c) => ({ ...c })),
    0,
    0,
    W,
    H
  );
  const atRoot = app.drill.length === 0;
  const baseRoot = atRoot ? null : app.drill[0];
  const sum = items.reduce((s, c) => s + c.value, 0) || 1;
  const gap = 2;

  const fillOf = (d) => {
    if (atRoot) return PALETTE[rootIndexOf(d.name) % PALETTE.length];
    const base = PALETTE[rootIndexOf(baseRoot) % PALETTE.length];
    const idx = sorted.findIndex((s) => s.name === d.name);
    const t = sorted.length > 1 ? idx / (sorted.length - 1) : 0;
    return shade(base, -0.28 + t * 0.5);
  };

  const tipOf = (d) => ({
    title: (app.drill.length ? app.drill.join("/") + "/" : "") + d.name,
    rows: [
      [METRIC_LABEL[app.metric], fmtFull(d.value)],
      ["commits", fmtFull(d.commits)],
      d.is_leaf ? ["type", "file"] : ["files", fmtFull(d.files)],
    ],
    accent: PALETTE[rootIndexOf(atRoot ? d.name : baseRoot) % PALETTE.length],
  });

  return (
    <div>
      <GroupControl />
      <Breadcrumb />
      {items.length === 0 ? (
        <EmptyState msg="No activity in this selection" />
      ) : (
        <>
          <div ref={ref} style={{ width: "100%", overflow: "hidden", borderRadius: 10 }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
              {rects.map((r, ri) => {
                const fill = fillOf(r.d);
                const txt = lum(fill) > 0.55 ? "#0b0c0e" : "#ffffff";
                const showLabel = r.w > 44 && r.h > 26;
                const showVal = r.w > 60 && r.h > 44;
                const clickable = !r.d.is_leaf;
                const pct = (r.d.value / sum) * 100;
                return (
                  <g
                    key={ri}
                    style={{ cursor: clickable ? "pointer" : "default" }}
                    onClick={() => clickable && app.setDrill([...app.drill, r.d.name])}
                    onMouseMove={(e) => tip.show(e, tipOf(r.d))}
                    onMouseLeave={tip.hide}
                  >
                    <rect
                      x={r.x + gap / 2}
                      y={r.y + gap / 2}
                      width={Math.max(0, r.w - gap)}
                      height={Math.max(0, r.h - gap)}
                      rx={5}
                      fill={fill}
                      fillOpacity={r.d.is_leaf ? 0.82 : 1}
                      stroke="var(--panel)"
                      strokeWidth={1}
                    />
                    {showLabel ? (
                      <text x={r.x + 9} y={r.y + 19} fill={txt} fontSize={12} fontWeight={600} style={{ pointerEvents: "none" }}>
                        {truncate(r.d.name, r.w - 14)}
                      </text>
                    ) : null}
                    {showVal ? (
                      <text
                        x={r.x + 9}
                        y={r.y + 35}
                        fill={txt}
                        fontSize={11}
                        fontFamily="IBM Plex Mono"
                        opacity={0.82}
                        style={{ pointerEvents: "none" }}
                      >
                        {fmt(r.d.value) + (pct > 4 ? " · " + pct.toFixed(0) + "%" : "")}
                      </text>
                    ) : null}
                    {showLabel && !r.d.is_leaf && r.w > 30 ? (
                      <text x={r.x + r.w - 8} y={r.y + 18} fill={txt} opacity={0.7} fontSize={13} textAnchor="end" style={{ pointerEvents: "none" }}>
                        ›
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, flexWrap: "wrap", fontSize: 11.5, color: "var(--muted)" }}
          >
            {atRoot ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {items.map((c) => (
                  <span key={c.name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Dot color={PALETTE[rootIndexOf(c.name) % PALETTE.length]} />
                    {c.name}
                  </span>
                ))}
              </div>
            ) : (
              <span className="mono">
                {(app.groupBy === "zone" ? "zone · " : "directory · ") + app.metric + " — click a node to drill in"}
              </span>
            )}
            <span className="mono" style={{ marginLeft: "auto" }}>
              {fmtFull(total)} {app.metric} total
            </span>
          </div>
        </>
      )}
    </div>
  );
}
