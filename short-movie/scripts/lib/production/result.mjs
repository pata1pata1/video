// @ts-check
// content-ops へ返す制作の結果（content-ops の `production record-result --result=<file>` に渡す）。
// content-ops のファイルは書き換えない。結果は <id>/output/production-result.json（Git 管理外）に書く。

import fs from "node:fs";
import path from "node:path";
import { projectDir, projectsRoot } from "./paths.mjs";

export const RENDER_STATUSES = ["started", "rendered", "failed", "published"];

/**
 * @param {string} projectId
 * @param {{ renderStatus: string, startedAt: string, completedAt?: string | null, validationStatus?: string | null }} o
 */
export function buildResult(projectId, o) {
  if (!RENDER_STATUSES.includes(o.renderStatus)) throw new Error(`renderStatus は ${RENDER_STATUSES.join(" | ")} です`);
  const dir = projectDir(projectId);
  const rel = (/** @type {string} */ p) => (fs.existsSync(p) ? path.relative(path.dirname(projectsRoot()), p).split(path.sep).join("/") : null);
  const timeline = path.join(dir, "audio", "timeline.json");
  let durationSec = null;
  if (fs.existsSync(timeline)) {
    const d = JSON.parse(fs.readFileSync(timeline, "utf8")).duration;
    durationSec = typeof d === "number" ? Math.round(d * 100) / 100 : null;
  }
  return {
    productionId: projectId,
    startedAt: o.startedAt,
    completedAt: o.completedAt ?? null,
    scriptPath: rel(path.join(dir, "input", "script.json")),
    audioPath: rel(path.join(dir, "audio", "narration.wav")),
    subtitlePath: rel(path.join(dir, "audio", "narration.srt")),
    videoPath: rel(path.join(dir, "output", `${projectId}.mp4`)),
    durationSec,
    validationStatus: o.validationStatus ?? null,
    renderStatus: o.renderStatus,
  };
}

/** @param {string} projectId @param {any} result */
export function writeResult(projectId, result) {
  const file = path.join(projectDir(projectId), "output", "production-result.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  return file;
}
