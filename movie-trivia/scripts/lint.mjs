// npm run lint: eslint src, then tsc (tsconfig.json) when the current video's data is here.
// src/current.ts and src/current-diagrams.ts (written by `node scripts/mt.mjs new|switch`)
// import one project folder's files; a fresh clone does not have that folder (project data is
// not in Git), so tsc would only report the missing imports. In that case tsc is skipped with
// the reason, nothing is generated and current*.ts are only read. eslint always runs, and any
// eslint or tsc failure fails the lint.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(APP_ROOT, "src");
const CURRENT_FILES = ["current.ts", "current-diagrams.ts"];
const RESOLVE_EXTS = ["", ".ts", ".tsx", ".js", ".mjs", ".json", "/index.ts", "/index.tsx"];

function run(script, args) {
  const r = spawnSync(process.execPath, [path.join(APP_ROOT, "node_modules", ...script.split("/")), ...args], {
    cwd: APP_ROOT,
    stdio: "inherit",
  });
  return r.status ?? 1;
}

/** Relative imports of current*.ts that do not resolve to a file. */
function missingCurrentImports() {
  const missing = [];
  for (const name of CURRENT_FILES) {
    const file = path.join(SRC, name);
    if (!fs.existsSync(file)) continue;
    for (const [, spec] of fs.readFileSync(file, "utf8").matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = path.resolve(SRC, spec);
      if (!RESOLVE_EXTS.some((ext) => fs.existsSync(target + ext))) {
        missing.push(`src/${name}: ${spec}`);
      }
    }
  }
  return missing;
}

if (run("eslint/bin/eslint.js", ["src"]) !== 0) process.exit(1);

const missing = missingCurrentImports();
if (missing.length) {
  console.log("lint: current.ts が参照している案件データがこのPCに存在しないため、TypeScript typecheck を省略しました。");
  for (const m of missing) console.log(`  無い: ${m}`);
  console.log("  `node scripts/mt.mjs switch --project=<id>` で実在案件へ切り替えると typecheck できます。");
  process.exit(0);
}
process.exit(run("typescript/bin/tsc", []));
