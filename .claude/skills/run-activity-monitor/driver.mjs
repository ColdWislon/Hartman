// Smoke driver for the Git + Tuleap Activity Monitor.
// Usage:  node .claude/skills/run-activity-monitor/driver.mjs [webUrl] [apiUrl]
// Requires: db + api + web already running (see SKILL.md), and
//           `playwright` installed in web/ (devDependency) with chromium downloaded.
// Exits 0 with screenshots in web/.smoke/, exits 1 on any failure.
import { createRequire } from "module";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const WEB = process.argv[2] || "http://localhost:5173";
const API = process.argv[3] || "http://localhost:8000";
const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, "../../../web");
const outDir = path.join(webDir, ".smoke");
mkdirSync(outDir, { recursive: true });

// playwright lives in web/node_modules; resolve from there regardless of cwd
const require = createRequire(path.join(webDir, "package.json"));
const { chromium } = require("playwright");

let failed = false;
const fail = (msg) => { console.error("FAIL: " + msg); failed = true; };
const ok = (msg) => console.log("ok  : " + msg);

// --- 1. API smoke -----------------------------------------------------------
for (const ep of ["/api/repos", "/api/activity/tree?metric=commits", "/api/tickets/backlog?bucket=month"]) {
  try {
    const r = await fetch(API + ep);
    if (!r.ok) { fail(`${ep} -> HTTP ${r.status}`); continue; }
    const body = await r.json();
    const empty = Array.isArray(body) ? body.length === 0 : !body;
    if (empty) fail(`${ep} -> empty response (db not seeded? run ingest-all --seed-demo)`);
    else ok(ep);
  } catch (e) {
    fail(`${ep} -> ${e.message} (api not running?)`);
  }
}

// --- 2. Browser flow --------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

try {
  await page.goto(WEB, { waitUntil: "networkidle", timeout: 30000 });

  // Git activity page: treemap panel must render an SVG with data
  await page.waitForSelector(".tabs button", { timeout: 10000 });
  await page.waitForSelector(".panel svg", { timeout: 15000 });
  await page.screenshot({ path: path.join(outDir, "git-activity.png"), fullPage: true });
  ok("git activity page rendered -> web/.smoke/git-activity.png");

  // interact: switch metric to churn
  await page.click(".metric-toggle button:has-text('churn')");
  await page.waitForLoadState("networkidle");
  ok("metric toggle -> churn");

  // interact: switch to Trackers tab
  await page.click(".tabs button:has-text('Trackers')");
  await page.waitForSelector(".panel svg", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(outDir, "trackers.png"), fullPage: true });
  ok("trackers page rendered -> web/.smoke/trackers.png");
} catch (e) {
  fail(e.message);
  try { await page.screenshot({ path: path.join(outDir, "failure.png"), fullPage: true }); } catch {}
} finally {
  await browser.close();
}

if (errors.length) { errors.forEach((e) => fail(e)); }
console.log(failed ? "SMOKE FAILED" : "SMOKE PASSED");
process.exit(failed ? 1 : 0);
