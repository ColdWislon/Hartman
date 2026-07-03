// User-configurable zones, persisted in localStorage.
// A file joins the FIRST zone whose dir list matches any segment of its
// full path (repo name included); unmatched files fall into "Other".
export const DEFAULT_ZONES = [
  { name: "IP", dirs: ["ip"] },
  { name: "Blocks", dirs: ["block"] },
  { name: "Verification", dirs: ["verif", "tests", "tb", "uvm"] },
  { name: "Software", dirs: ["src", "drivers", "rtos", "hal", "app"] },
  { name: "Infra", dirs: ["constraints", "ld", "arch", "migrations", "cmd", "internal", "pkg"] },
  { name: "Docs", dirs: ["docs", "content", "themes"] },
];

const KEY = "activity-monitor.zones";

export function loadZones() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ZONES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    /* corrupted storage → defaults */
  }
  return DEFAULT_ZONES;
}

export function saveZones(zones) {
  try {
    localStorage.setItem(KEY, JSON.stringify(zones));
  } catch (e) {
    /* storage full/blocked — zones stay in-memory */
  }
}

// Stable index for a zone name → palette slot ("Other"/"Unlinked" get the
// slot after the configured zones so colors don't shift as zones are edited).
export function zoneIndex(zones, name) {
  const names = zones.map((z) => z.name);
  const i = names.indexOf(name);
  return i < 0 ? names.length : i;
}
