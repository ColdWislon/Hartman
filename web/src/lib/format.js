// Number formatting: compact `1.4k` in chart context, full `8,004` in tooltips.
export function fmt(n) {
  n = Math.round(n);
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(0) + "k";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return "" + n;
}

export function fmtFull(n) {
  return Math.round(n).toLocaleString("en-US");
}

export function niceMax(m) {
  if (m <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(m)));
  const n = m / p;
  const s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return Math.ceil(m / (s * p)) * s * p;
}

export const METRIC_LABEL = {
  commits: "commits",
  churn: "lines churned",
  files: "files touched",
};

// "User Stories" + 2103 → "story #2103"
export function refLabel(trackerName, id) {
  const n = (trackerName || "").toLowerCase();
  let kind = n.replace(/s$/, "");
  if (n.includes("stor")) kind = "story";
  else if (n.includes("bug")) kind = "bug";
  else if (n.includes("task")) kind = "task";
  return `${kind} #${id}`;
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function bucketLabel(key, bucket) {
  const d = new Date(key + "T00:00:00Z");
  if (bucket === "month") return MONTHS[d.getUTCMonth()];
  return MONTHS[d.getUTCMonth()] + " " + d.getUTCDate();
}

// Contiguous list of bucket keys (ISO dates) covering [from, to].
// month → first-of-month; week → ISO Monday (matches Postgres date_trunc).
export function bucketRange(from, to, bucket) {
  if (!from || !to || from > to) return [];
  const out = [];
  if (bucket === "month") {
    let d = new Date(from + "T00:00:00Z");
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const end = new Date(to + "T00:00:00Z");
    while (d <= end && out.length < 600) {
      out.push({ key: isoDate(d), label: bucketLabel(isoDate(d), bucket) });
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
  } else {
    let d = new Date(from + "T00:00:00Z");
    const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
    d = new Date(d.getTime() - dow * 864e5);
    const end = new Date(to + "T00:00:00Z");
    while (d <= end && out.length < 600) {
      out.push({ key: isoDate(d), label: bucketLabel(isoDate(d), bucket) });
      d = new Date(d.getTime() + 7 * 864e5);
    }
  }
  return out;
}

// Fold API rows ({bucket: ISO timestamp, ...}) onto a contiguous bucket range.
export function alignSeries(buckets, rows, pick) {
  const byKey = new Map();
  (rows || []).forEach((r) => {
    if (r.bucket) byKey.set(r.bucket.slice(0, 10), r);
  });
  return buckets.map((b) => ({ ...b, ...pick(byKey.get(b.key)) }));
}
