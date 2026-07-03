// Tiny fetch wrapper. All requests go through /api (proxied to the API service).
const BASE = import.meta.env.VITE_API_BASE || "";

function qs(params) {
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) {
      if (v.length) sp.set(k, v.join(","));
    } else {
      sp.set(k, v);
    }
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function get(path, params) {
  const res = await fetch(`${BASE}/api${path}${qs(params)}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  repos: () => get("/repos"),
  trackers: () => get("/trackers"),
  tree: (p) => get("/activity/tree", p),
  contributors: (p) => get("/activity/contributors", p),
  timeseries: (p) => get("/activity/timeseries", p),
  mix: (p) => get("/activity/mix", p),
  punchcard: (p) => get("/activity/punchcard", p),
  codefrequency: (p) => get("/activity/codefrequency", p),
  topfiles: (p) => get("/activity/topfiles", p),
  backlog: (p) => get("/tickets/backlog", p),
  throughput: (p) => get("/tickets/throughput", p),
  cycletime: (p) => get("/tickets/cycletime", p),
  openTickets: (p) => get("/tickets/open", p),
  recentArtifacts: (p) => get("/tickets/recent", p),
  openByZone: (p) => get("/tickets/open_by_zone", p),
  ticketCommits: (id) => get(`/tickets/${id}/commits`),
  commitTickets: (sha) => get(`/commits/${encodeURIComponent(sha)}/tickets`),
};

// Serialize zones for query params (server classifies files itself).
export function zonesParam(zones) {
  return JSON.stringify((zones || []).map((z) => ({ name: z.name, dirs: z.dirs })));
}
