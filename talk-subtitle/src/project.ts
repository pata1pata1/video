// project.json, the source video record and safe JSON writes.
//
// Safety rules:
//   - the source video is only ever read (never opened for writing, moved or deleted)
//   - every write goes inside the project folder, via temp file + rename
//   - a locked project is never written to

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { UserError } from "./cli.ts";
import { PROJECT_SUBDIRS, projectPaths, type ProjectPaths } from "./paths.ts";

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts"];

export type SourceRecord = {
  /** Relative to the project folder, e.g. "input/talk.mp4". */
  file: string;
  sizeBytes: number;
  mtimeMs: number;
  sha256: string;
  registeredAt: string;
};

export type ProjectJson = {
  version: 1;
  tool: "talk-subtitle";
  /** remotion's video type name, kept for compatibility only. */
  type: "human-video-editor";
  id: string;
  created: string;
  status: "active" | "completed" | "archived";
  locked: boolean;
  source: SourceRecord | null;
  /**
   * production (default when absent): a video edited with this tool.
   * reference: a video the user edited elsewhere, kept only to learn their editing style
   * (input/reference/: source + final + optional SRT, all read-only; see docs/design.md §15).
   */
  kind?: ProjectKind;
  /** reference projects: the registered files (source is also recorded in `source`). */
  reference?: { source: SourceRecord; final: SourceRecord; srt: SourceRecord | null };
  /** Kept out of the editing-style learning (a trial / check project): style observe refuses it. */
  learning?: { exclude: true; reason: string };
};

export type ProjectKind = "production" | "reference";
export const projectKind = (json: ProjectJson): ProjectKind => json.kind ?? "production";

export type Project = { paths: ProjectPaths; json: ProjectJson };

export function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as T;
  } catch (err) {
    throw new UserError(`${file} を読めません: ${err instanceof Error ? err.message : err}`);
  }
}

export function readJsonIfExists<T>(file: string): T | null {
  return fs.existsSync(file) ? readJson<T>(file) : null;
}

/** Temp file + rename, so a crash never leaves a half-written JSON. */
export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function writeTextAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** Stable short hash of JSON-able data (key order independent). */
export function fingerprint(data: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]))
        : v;
  return crypto.createHash("sha256").update(JSON.stringify(stable(data))).digest("hex").slice(0, 16);
}

export function fileFingerprint(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file, { flags: "r" })
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

export function createProject(id: string, options: { dryRun?: boolean; kind?: ProjectKind } = {}): ProjectPaths {
  const paths = projectPaths(id);
  if (fs.existsSync(paths.root)) {
    throw new UserError(`案件 ${id} はすでにあります: ${paths.root}（上書きしません）`);
  }
  if (options.dryRun) return paths;
  for (const sub of PROJECT_SUBDIRS) fs.mkdirSync(path.join(paths.root, sub), { recursive: true });
  if (options.kind === "reference") fs.mkdirSync(paths.referenceDir, { recursive: true });
  const json: ProjectJson = {
    version: 1,
    tool: "talk-subtitle",
    type: "human-video-editor",
    id,
    created: new Date().toISOString(),
    status: "active",
    locked: false,
    source: null,
    ...(options.kind === "reference" ? { kind: "reference" as const } : {}),
  };
  writeJsonAtomic(paths.projectJson, json);
  return paths;
}

export function loadProject(id: string | undefined): Project {
  if (!id) throw new UserError("--project=<動画ID> を指定してください（例：--project=sample-video-01）。");
  const paths = projectPaths(id);
  if (!fs.existsSync(paths.projectJson)) {
    throw new UserError(`案件 ${id} がありません。先に npm run new -- --id=${id} で作ってください。`);
  }
  const json = readJson<ProjectJson>(paths.projectJson);
  if (json.tool !== "talk-subtitle" || json.id !== id) {
    throw new UserError(`${paths.projectJson} の tool／id が不正です。`);
  }
  return { paths, json };
}

export function assertWritable(project: Project): void {
  if (project.json.locked) {
    throw new UserError(`案件 ${project.json.id} は locked: true です。書き込みを中止しました。`);
  }
}

export function saveProjectJson(project: Project): void {
  assertWritable(project);
  writeJsonAtomic(project.paths.projectJson, project.json);
}

/** Video files placed directly in input/. */
export function listInputVideos(paths: ProjectPaths): string[] {
  if (!fs.existsSync(paths.input)) return [];
  return fs
    .readdirSync(paths.input)
    .filter((f) => VIDEO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .filter((f) => fs.statSync(path.join(paths.input, f)).isFile())
    .sort();
}

export function sourcePath(project: Project): string {
  const src = project.json.source;
  if (!src) throw new UserError(`元動画がまだ登録されていません。input/ に置いて npm run analyze -- --project=${project.json.id} を実行してください。`);
  return path.join(project.paths.root, src.file);
}

/**
 * Cheap check that the registered source is still the same file (size +
 * mtime). A full sha256 check is done by analyze and before any cut.
 */
export function assertSourceUnchanged(project: Project): string {
  const file = sourcePath(project);
  const src = project.json.source!;
  if (!fs.existsSync(file)) throw new UserError(`元動画が見つかりません: ${file}`);
  const st = fs.statSync(file);
  if (st.size !== src.sizeBytes || Math.round(st.mtimeMs) !== Math.round(src.mtimeMs)) {
    throw new UserError(
      `元動画 ${src.file} が登録時から変わっています（サイズまたは更新日時）。` +
        `差し替えた場合は npm run analyze -- --project=${project.json.id} --replace-source で登録し直してください。`,
    );
  }
  return file;
}
