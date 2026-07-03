import React, { useEffect, useState } from "react";
import BacklogThroughput from "../components/BacklogThroughput.jsx";
import CycleTime from "../components/CycleTime.jsx";
import { api } from "../api.js";

export default function Trackers({ filters }) {
  const [trackers, setTrackers] = useState([]);
  const [selected, setSelected] = useState([]); // tuleap_tracker_id list; empty = all

  useEffect(() => {
    api.trackers().then(setTrackers).catch(() => setTrackers([]));
  }, []);

  const onSelect = (e) => {
    const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
    setSelected(vals);
  };

  return (
    <div className="grid">
      <div className="panel full">
        <label className="control" style={{ marginBottom: 10 }}>
          Trackers (empty = all monitored)
          <select multiple value={selected} onChange={onSelect}>
            {trackers.map((t) => (
              <option key={t.id} value={t.tuleap_tracker_id}>
                #{t.tuleap_tracker_id} {t.name || ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel full">
        <h3>Backlog &amp; throughput</h3>
        <div className="sub">open backlog trend + opened/closed per {filters.bucket}</div>
        <BacklogThroughput filters={filters} trackerIds={selected} />
      </div>

      <div className="panel full">
        <h3>Cycle time &amp; age (per assignee)</h3>
        <div className="sub">median time-to-close and median age of still-open artifacts</div>
        <CycleTime trackerIds={selected} />
      </div>
    </div>
  );
}
