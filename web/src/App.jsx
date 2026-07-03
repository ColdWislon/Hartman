import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import TopBar from "./components/TopBar.jsx";
import GitActivity from "./pages/GitActivity.jsx";
import Trackers from "./pages/Trackers.jsx";

export default function App() {
  const [repos, setRepos] = useState([]);
  const [tab, setTab] = useState("git");
  const [filters, setFilters] = useState({
    repos: [],       // empty = all
    from: "",
    to: "",
    bucket: "week",
  });

  useEffect(() => {
    api.repos().then(setRepos).catch(() => setRepos([]));
  }, []);

  return (
    <div className="app">
      <TopBar repos={repos} filters={filters} setFilters={setFilters} />

      <nav className="tabs">
        <button className={tab === "git" ? "active" : ""} onClick={() => setTab("git")}>
          Git activity
        </button>
        <button className={tab === "trackers" ? "active" : ""} onClick={() => setTab("trackers")}>
          Trackers
        </button>
      </nav>

      {tab === "git" ? (
        <GitActivity filters={filters} />
      ) : (
        <Trackers filters={filters} />
      )}
    </div>
  );
}
