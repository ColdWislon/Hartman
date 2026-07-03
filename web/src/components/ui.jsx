import React from "react";

export function Panel({ title, sub, right, children }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div style={{ minWidth: 0, marginRight: "auto" }}>
          <h2>{title}</h2>
          {sub ? <div className="panel-sub">{sub}</div> : null}
        </div>
        {right || null}
      </div>
      {children}
    </section>
  );
}

export function Seg({ options, value, onPick }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? "active" : ""} onClick={() => onPick(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function IconBtn({ children, onClick, active, title }) {
  return (
    <button className={"icon-btn" + (active ? " active" : "")} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function CheckRow({ label, on, onClick, dot, meta }) {
  return (
    <button className="check-row" onClick={onClick}>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 5,
          border: `1.5px solid ${on ? "var(--accent)" : "var(--border2)"}`,
          background: on ? "var(--accent)" : "transparent",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {on ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round">
            <path d="M4 12l5 5L20 6" />
          </svg>
        ) : null}
      </span>
      {dot || null}
      <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
      {meta ? (
        <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)" }}>
          {meta}
        </span>
      ) : null}
    </button>
  );
}

export function EmptyState({ msg }) {
  return (
    <div className="empty-state">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
      <div>{msg || "No activity in this selection"}</div>
    </div>
  );
}

export function Dot({ color, size = 9, radius = 2 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: radius, background: color, flexShrink: 0, display: "inline-block" }} />
  );
}

export function LegendDot({ color, label, shape }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {shape === "line" ? (
        <span style={{ width: 14, height: 2.5, borderRadius: 2, background: color }} />
      ) : (
        <Dot color={color} />
      )}
      {label}
    </span>
  );
}

export function Legend({ items, style }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        flexWrap: "wrap",
        marginBottom: 10,
        fontSize: 11.5,
        color: "var(--muted)",
        ...style,
      }}
    >
      {items.map((it) => (
        <LegendDot key={it.label} color={it.color} label={it.label} shape={it.shape} />
      ))}
    </div>
  );
}

export function IntensityLegend({ color = "var(--accent)", right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
      <span>Less</span>
      {[0.1, 0.3, 0.55, 0.8, 1].map((o, i) => (
        <span key={i} style={{ width: 13, height: 13, borderRadius: 3, background: color, opacity: o }} />
      ))}
      <span>More</span>
      {right ? (
        <span className="mono" style={{ marginLeft: "auto" }}>
          {right}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- icons ---- */

export const icons = {
  logo: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="12" r="2.4" />
      <path d="M6 8.4v7.2M8 6h4.5a3 3 0 013 3v0" />
    </svg>
  ),
  git: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="9" r="2.4" />
      <path d="M6 8.4v7.2M18 11.4c0 3-3 3.6-6 3.6" />
    </svg>
  ),
  trackers: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 5h11M9 12h11M9 19h11" />
      <path d="M4 5l1 1 1.5-2M4 12l1 1 1.5-2M4 19l1 1 1.5-2" />
    </svg>
  ),
  sun: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  moon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
    </svg>
  ),
  chevronDown: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2.4">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  chevronRight: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  rows: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  ),
  gear: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2">
      <path d="M12 3v3M12 18v3M5 12H2M22 12h-3M6.3 6.3l-1.4-1.4M18.4 18.4l1.4 1.4" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  ),
  link: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 17H7A5 5 0 017 7h2M15 7h2a5 5 0 010 10h-2M8 12h8" />
    </svg>
  ),
  linkSm: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 17H7A5 5 0 017 7h2M15 7h2a5 5 0 010 10h-2M8 12h8" />
    </svg>
  ),
  external: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M7 17L17 7M9 7h8v8" />
    </svg>
  ),
  close: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  minus: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14" />
    </svg>
  ),
};
