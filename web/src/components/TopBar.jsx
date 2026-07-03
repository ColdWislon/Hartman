import React from "react";

// Shared top bar: repo multi-select, date-range picker, week/month toggle.
export default function TopBar({ repos, filters, setFilters }) {
  const update = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const onRepoChange = (e) => {
    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
    update({ repos: selected });
  };

  return (
    <header className="topbar">
      <div className="brand">Git + Tuleap Activity Monitor</div>

      <label className="control">
        Repos
        <select multiple value={filters.repos} onChange={onRepoChange}>
          {repos.map((r) => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
        </select>
      </label>

      <label className="control">
        From
        <input type="date" value={filters.from || ""}
          onChange={(e) => update({ from: e.target.value })} />
      </label>

      <label className="control">
        To
        <input type="date" value={filters.to || ""}
          onChange={(e) => update({ to: e.target.value })} />
      </label>

      <label className="control">
        Bucket
        <select value={filters.bucket} onChange={(e) => update({ bucket: e.target.value })}>
          <option value="week">Week (ISO)</option>
          <option value="month">Month</option>
        </select>
      </label>
    </header>
  );
}
