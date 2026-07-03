import React from "react";
import { useApp } from "../App.jsx";
import { PALETTE } from "../lib/color.js";
import { usePopover } from "../lib/hooks.js";
import { Seg, IconBtn, CheckRow, Dot, icons } from "./ui.jsx";

function RepoSelect() {
  const app = useApp();
  const [open, setOpen] = usePopover();
  const sel = app.repos;
  const all = app.repoList;
  const label =
    all.length && sel.length === all.length ? "All repos" : `${sel.length} repo${sel.length === 1 ? "" : "s"}`;
  return (
    <div data-pop="1" style={{ position: "relative" }}>
      <button
        className="ctl-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {icons.rows}
        {label}
        {icons.chevronDown}
      </button>
      {open ? (
        <div className="pop" style={{ width: 260 }}>
          <div className="pop-head">
            <span className="micro-caps">Repositories</span>
            <button
              className="pop-action"
              onClick={() => app.setRepos(sel.length === all.length ? [] : all.map((r) => r.name))}
            >
              {sel.length === all.length ? "Clear" : "All"}
            </button>
          </div>
          {all.map((r, i) => (
            <CheckRow
              key={r.name}
              label={r.name}
              on={sel.includes(r.name)}
              onClick={() => app.toggleRepo(r.name)}
              dot={<Dot color={PALETTE[i % PALETTE.length]} size={8} />}
              meta={r.default_branch}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DateRange() {
  const app = useApp();
  const inp = (val, key) => (
    <input
      type="date"
      value={val || ""}
      onChange={(e) => app.setRange({ [key]: e.target.value })}
      style={{ colorScheme: app.theme }}
    />
  );
  return (
    <div className="daterange">
      <span className="lbl">From</span>
      {inp(app.from, "from")}
      <span className="lbl">To</span>
      {inp(app.to, "to")}
    </div>
  );
}

export default function TopBar() {
  const app = useApp();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="brand-mark">{icons.logo}</div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-title">Activity Monitor</div>
            <div className="brand-sub">Git + Tuleap · LAN</div>
          </div>
        </div>
        <RepoSelect />
        <DateRange />
        <Seg
          options={[
            { v: "week", l: "Week" },
            { v: "month", l: "Month" },
          ]}
          value={app.bucket}
          onPick={app.setBucket}
        />
        <IconBtn onClick={() => app.setTheme(app.theme === "dark" ? "light" : "dark")} title="Toggle theme">
          {app.theme === "dark" ? icons.sun : icons.moon}
        </IconBtn>
      </div>
      <div className="topbar-daterow">
        <DateRange />
      </div>
    </header>
  );
}
