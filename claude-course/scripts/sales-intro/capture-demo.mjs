// Captures the opening-only demo page (public/sales-intro/demo/lumiere/index.html)
// as it renders in the installed Google Chrome (headless), 1920x1080 at
// device scale 2 -> public/sales-intro/demo/lumiere-hero.png (3840x2160).
// The page loads its fonts from Google Fonts, so this needs the network.
//
// Usage: node scripts/sales-intro/capture-demo.mjs

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE = path.join(ROOT, "public", "sales-intro", "demo", "lumiere", "index.html");
const OUT = path.join(ROOT, "public", "sales-intro", "demo", "lumiere-hero.png");
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => fs.existsSync(p));
if (!CHROME) throw new Error("Google Chrome was not found.");

await run(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--window-size=1920,1080",
  "--force-device-scale-factor=2",
  "--virtual-time-budget=10000",
  `--screenshot=${OUT}`,
  pathToFileURL(PAGE).href,
]);
console.log(`wrote ${path.relative(ROOT, OUT)}`);
