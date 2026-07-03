// Categorical palette (repos & zones) — colorblind-aware, index-stable.
export const PALETTE = ["#5b8cff", "#12b3a6", "#e0a34e", "#b07cf0", "#ec6f9e", "#4cc0e0"];

export const AMBER = "#e0a34e";

// Tracker colors keyed by tracker name (fallback: palette by index).
export function trackerColor(name, idx = 0) {
  const n = (name || "").toLowerCase();
  if (n.includes("bug")) return "#ec6f9e";
  if (n.includes("task")) return "#4cc0e0";
  if (n.includes("stor")) return "#b07cf0";
  return PALETTE[idx % PALETTE.length];
}

export function hexToRgb(h) {
  h = h.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Lightness ramp of a base color; amt in [-1, 1].
export function shade(hex, amt) {
  let [r, g, b] = hexToRgb(hex);
  if (amt >= 0) {
    r = r + (255 - r) * amt;
    g = g + (255 - g) * amt;
    b = b + (255 - b) * amt;
  } else {
    r = r * (1 + amt);
    g = g * (1 + amt);
    b = b * (1 + amt);
  }
  return (
    "#" +
    [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")
  );
}

// Ticket age bands: ≤7d green · 8–30d accent · 31–90d amber · >90d red.
export function ageBand(age) {
  if (age <= 7) return { label: "≤ 7d", color: "var(--green)", key: "le7" };
  if (age <= 30) return { label: "8–30d", color: "var(--accent)", key: "le30" };
  if (age <= 90) return { label: "31–90d", color: AMBER, key: "le90" };
  return { label: "> 90d", color: "var(--red)", key: "gt90" };
}

// Status → indicator color. Status vocabularies differ per tracker, so match
// on common keywords and fall back to muted.
export function statusColor(status) {
  const s = (status || "").toLowerCase();
  if (s.includes("progress") || s.includes("doing")) return "var(--accent)";
  if (s.includes("review")) return "#b07cf0";
  if (s.includes("confirmed") || s.includes("new")) return "var(--red)";
  if (s.includes("ready") || s.includes("done") || s.includes("fixed") || s.includes("accepted") || s.includes("closed"))
    return "var(--green)";
  return "var(--muted)";
}

export const AGE_BANDS = [
  { label: "≤ 7d", lo: 0, hi: 7, color: "var(--green)" },
  { label: "8–30d", lo: 8, hi: 30, color: "var(--accent)" },
  { label: "31–90d", lo: 31, hi: 90, color: AMBER },
  { label: "> 90d", lo: 91, hi: Infinity, color: "var(--red)" },
];
