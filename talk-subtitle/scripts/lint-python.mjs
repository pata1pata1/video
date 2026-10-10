// Syntax check of python/*.py with the venv's Python (no extra linters installed).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const py = process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python";
if (!fs.existsSync(py)) {
  console.log("lint-python: .venv が無いので省略（npm run setup-faster-whisper）");
  process.exit(0);
}
const files = fs.readdirSync("python").filter((f) => f.endsWith(".py")).map((f) => path.join("python", f));
const code = "import ast,sys\nfor f in sys.argv[1:]: ast.parse(open(f,encoding='utf-8').read(), f)\nprint('lint-python OK:', len(sys.argv)-1, 'files')";
const r = spawnSync(py, ["-I", "-c", code, ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
