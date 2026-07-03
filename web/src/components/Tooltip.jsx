import React, { createContext, useCallback, useContext, useState } from "react";

// Global floating tooltip: content = { title, rows: [[k, v], …], accent }.
// Flips near viewport edges; pointer-events none (see .tip-card).
const TipCtx = createContext({ show: () => {}, hide: () => {} });

export function useTip() {
  return useContext(TipCtx);
}

function TipCard({ title, rows, accent, className }) {
  const hasRows = rows && rows.length > 0;
  return (
    <div className={className}>
      <div className={"tip-title" + (hasRows ? " tip-title-wrap" : "")}>
        {accent ? (
          <span style={{ width: 8, height: 8, borderRadius: 2, background: accent, flexShrink: 0 }} />
        ) : null}
        <span>{title}</span>
      </div>
      {(rows || []).map((r, i) => (
        <div key={i} className="tip-row">
          <span className="k">{r[0]}</span>
          <span className="v">{r[1]}</span>
        </div>
      ))}
    </div>
  );
}

export function TooltipProvider({ children }) {
  const [tip, setTip] = useState(null);
  const show = useCallback((e, content) => {
    setTip({ x: e.clientX, y: e.clientY, ...content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  let el = null;
  if (tip) {
    const flipX = tip.x > window.innerWidth - 190;
    const flipY = tip.y > window.innerHeight - 140;
    el = (
      <div
        className="tip-card"
        style={{
          left: tip.x + (flipX ? -14 : 14),
          top: tip.y + (flipY ? -14 : 14),
          transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
        }}
      >
        <TipCard title={tip.title} rows={tip.rows} accent={tip.accent} />
      </div>
    );
  }
  return (
    <TipCtx.Provider value={{ show, hide }}>
      {children}
      {el}
    </TipCtx.Provider>
  );
}

// Recharts <Tooltip content={…}> adapter rendering the same card.
// `build(label, payload)` → { title, rows, accent }.
export function ChartTip({ active, label, payload, build }) {
  if (!active || !payload || payload.length === 0) return null;
  const content = build(label, payload);
  if (!content) return null;
  return (
    <TipCard
      className="tip-card-static"
      title={content.title}
      rows={content.rows}
      accent={content.accent}
    />
  );
}
