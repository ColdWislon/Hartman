import React from "react";
import { useApp } from "../App.jsx";
import { api } from "../api.js";
import { useApi } from "../lib/hooks.js";
import { refLabel } from "../lib/format.js";
import { icons } from "./ui.jsx";

const day = (iso) => (iso ? iso.slice(0, 10) : "–");

function Head({ kicker, title, onClose }) {
  return (
    <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--panel)", zIndex: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="micro-caps mono" style={{ letterSpacing: 0.7 }}>{kicker}</span>
        <button className="icon-btn" style={{ width: 30, height: 30, color: "var(--muted)" }} onClick={onClose}>
          {icons.close}
        </button>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>{title}</div>
    </div>
  );
}

function MetaRow({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
      {items.map(([k, v, color, mono]) => (
        <div key={k}>
          <div className="micro-caps" style={{ fontSize: 10.5, letterSpacing: 0.4 }}>{k}</div>
          <div className={mono ? "mono" : ""} style={{ fontSize: 13, fontWeight: 500, marginTop: 2, color: color || "var(--text)" }}>
            {v}
          </div>
        </div>
      ))}
    </div>
  );
}

function LinkHeader({ text }) {
  return (
    <div className="micro-caps" style={{ padding: "16px 20px 8px", display: "flex", alignItems: "center", gap: 7 }}>
      {icons.linkSm}
      {text}
    </div>
  );
}

function LinkRow({ lead, title, meta, onClick }) {
  return (
    <button className="drawer-row" onClick={onClick}>
      <span className="mono" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500, flexShrink: 0 }}>{lead}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <div className="mono" style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>{meta}</div>
      </div>
      {icons.external}
    </button>
  );
}

function ArtifactBody({ id, close }) {
  const app = useApp();
  const { data } = useApi(() => api.ticketCommits(id), [id]);
  if (!data) return null;
  const commits = data.commits || [];
  return (
    <div>
      <Head kicker={`${data.tracker || "artifact"} · ${refLabel(data.tracker, id)}`} title={data.title || `#${id}`} onClose={close} />
      <MetaRow
        items={[
          ["Status", data.status || "–", "var(--accent)"],
          ["Assignee", data.assignee || "–"],
          ["Opened", day(data.submitted_at), null, true],
          ["Age", data.age_days != null ? Math.round(data.age_days) + " d" : "–", null, true],
        ]}
      />
      <LinkHeader text={`${commits.length} linked commits`} />
      <div style={{ padding: "0 12px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
        {commits.map((c) => (
          <LinkRow
            key={c.sha}
            lead={c.sha.slice(0, 7)}
            title={c.subject}
            meta={`${c.repo} · ${c.author} · ${day(c.authored_at)}`}
            onClick={() => app.setDrawer({ type: "commit", id: c.sha })}
          />
        ))}
      </div>
    </div>
  );
}

function CommitBody({ sha, close }) {
  const app = useApp();
  const { data } = useApi(() => api.commitTickets(sha), [sha]);
  if (!data) return null;
  const tickets = data.tickets || [];
  return (
    <div>
      <Head kicker={`commit · ${data.repo || ""}`} title={data.subject || sha.slice(0, 7)} onClose={close} />
      <MetaRow
        items={[
          ["SHA", sha.slice(0, 7), "var(--accent)", true],
          ["Author", data.author || "–"],
          ["When", day(data.authored_at), null, true],
          ["Repo", data.repo || "–"],
        ]}
      />
      <LinkHeader text={`${tickets.length} linked artifacts`} />
      <div style={{ padding: "0 12px 20px", display: "flex", flexDirection: "column", gap: 2 }}>
        {tickets.map((t) => (
          <LinkRow
            key={t.artifact_id}
            lead={refLabel(t.tracker, t.artifact_id)}
            title={t.title}
            meta={`${t.tracker} · ${t.status}`}
            onClick={() => app.setDrawer({ type: "artifact", id: t.artifact_id })}
          />
        ))}
      </div>
    </div>
  );
}

// Right-side detail drawer with bidirectional artifact ↔ commit cross-links.
export default function Drawer() {
  const app = useApp();
  const d = app.drawer;
  const close = () => app.setDrawer(null);
  if (!d) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", justifyContent: "flex-end" }}>
      <div className="drawer-scrim" onClick={close} />
      <div className="drawer">
        {d.type === "artifact" ? <ArtifactBody id={d.id} close={close} /> : <CommitBody sha={d.id} close={close} />}
      </div>
    </div>
  );
}
