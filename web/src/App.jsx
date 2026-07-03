import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { isoDate } from "./lib/format.js";
import { loadZones, saveZones } from "./lib/zones.js";
import { TooltipProvider } from "./components/Tooltip.jsx";
import { icons } from "./components/ui.jsx";
import TopBar from "./components/TopBar.jsx";
import Drawer from "./components/Drawer.jsx";
import GitActivity from "./pages/GitActivity.jsx";
import Trackers from "./pages/Trackers.jsx";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const THEME_KEY = "activity-monitor.theme";

// Demo/batch data covers ~18 months; default the range to that window.
function defaultRange() {
  const now = new Date();
  return {
    from: isoDate(new Date(now.getTime() - 540 * 864e5)),
    to: isoDate(now),
  };
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "dark");
  const [page, setPage] = useState("git");
  const [metric, setMetric] = useState("commits");
  const [bucket, setBucket] = useState("month");
  const [repoList, setRepoList] = useState([]); // [{name, default_branch}]
  const [repos, setRepos] = useState(null); // selected names; null = not loaded yet
  const [range, setRange] = useState(defaultRange);
  const [drill, setDrill] = useState([]);
  const [groupBy, setGroupByRaw] = useState("repo");
  const [zones, setZonesRaw] = useState(loadZones);
  const [trackerList, setTrackerList] = useState([]); // [{tuleap_tracker_id, name}]
  const [trackers, setTrackers] = useState(null); // selected tuleap ids; null = not loaded
  const [drawer, setDrawer] = useState(null); // {type:'artifact'|'commit', id}

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    api.repos().then((rs) => {
      setRepoList(rs);
      setRepos((sel) => sel ?? rs.map((r) => r.name));
    }).catch(() => setRepoList([]));
    api.trackers().then((ts) => {
      setTrackerList(ts);
      setTrackers((sel) => sel ?? ts.map((t) => t.tuleap_tracker_id));
    }).catch(() => setTrackerList([]));
  }, []);

  // Editing zones resets drill; deselecting the drill-root repo resets drill.
  const setZones = (zs) => {
    setZonesRaw(zs);
    saveZones(zs);
    setDrill([]);
  };
  const setGroupBy = (g) => {
    setGroupByRaw(g);
    setDrill([]);
  };
  const toggleRepo = (name) => {
    setRepos((sel) => {
      const cur = sel || [];
      const next = cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name];
      if (groupBy === "repo" && drill.length && !next.includes(drill[0])) setDrill([]);
      return next;
    });
  };

  const app = useMemo(
    () => ({
      theme, setTheme,
      page, setPage,
      metric, setMetric,
      bucket, setBucket,
      repoList,
      repos: repos || [],
      reposLoaded: repos !== null,
      setRepos, toggleRepo,
      from: range.from, to: range.to,
      setRange: (patch) => setRange((r) => ({ ...r, ...patch })),
      drill, setDrill,
      groupBy, setGroupBy,
      zones, setZones,
      trackerList,
      trackers: trackers || [],
      setTrackers,
      drawer, setDrawer,
    }),
    [theme, page, metric, bucket, repoList, repos, range, drill, groupBy, zones, trackerList, trackers, drawer]
  );

  return (
    <AppCtx.Provider value={app}>
      <TooltipProvider>
        <TopBar />
        <div className="page">
          <nav className="tabs">
            <button className={"tab" + (page === "git" ? " active" : "")} onClick={() => setPage("git")}>
              {icons.git} Git activity
            </button>
            <button className={"tab" + (page === "trackers" ? " active" : "")} onClick={() => setPage("trackers")}>
              {icons.trackers} Trackers
            </button>
          </nav>
          <div key={page + metric + bucket} className="fade-rise">
            {page === "git" ? <GitActivity /> : <Trackers />}
          </div>
        </div>
        {drawer ? <Drawer /> : null}
      </TooltipProvider>
    </AppCtx.Provider>
  );
}
