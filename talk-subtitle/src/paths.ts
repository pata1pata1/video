// Where things live inside talk-subtitle and inside one project.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { UserError } from "./cli.ts";

export const TOOL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECTS_DIR = path.join(TOOL_ROOT, "projects");
export const SHARED_DIR = path.join(TOOL_ROOT, "_shared");
export const SHARED_GLOSSARY = path.join(SHARED_DIR, "glossary.json");
export const SUBTITLE_PRESETS_DIR = path.join(SHARED_DIR, "subtitle-presets");

export const PROJECT_SUBDIRS = ["input", "audio", "intermediate", "review", "output"] as const;

/** kebab-case: lowercase letters / digits separated by single hyphens. */
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertValidId(id: string): string {
  if (!ID_RE.test(id) || id.length > 64) {
    throw new UserError(`動画ID「${id}」は使えません。小文字英数字とハイフン（例：sample-video-01）で指定してください。`);
  }
  return id;
}

export type ProjectPaths = ReturnType<typeof projectPaths>;

export function projectPaths(id: string) {
  const root = path.join(PROJECTS_DIR, assertValidId(id));
  const input = path.join(root, "input");
  const audio = path.join(root, "audio");
  const intermediate = path.join(root, "intermediate");
  const review = path.join(root, "review");
  const output = path.join(root, "output");
  return {
    id,
    root,
    projectJson: path.join(root, "project.json"),
    input,
    audio,
    intermediate,
    review,
    output,
    glossary: path.join(input, "glossary.json"),
    decisions: path.join(input, "decisions.json"),
    /** Posts / texts read aloud on camera: ground truth for those subtitles (human-provided). */
    quotes: path.join(input, "quotes.json"),
    settings: path.join(input, "settings.json"),
    audioWav: path.join(audio, "source-16k.wav"),
    probe: path.join(intermediate, "probe.json"),
    loudness: path.join(intermediate, "loudness.json"),
    silences: path.join(intermediate, "silences.json"),
    proxy: path.join(intermediate, "review-proxy.mp4"),
    transcript: path.join(intermediate, "transcript.json"),
    termCandidates: path.join(intermediate, "term-candidates.json"),
    transcriptCorrected: path.join(intermediate, "transcript.corrected.json"),
    cutCandidates: path.join(intermediate, "cut-candidates.json"),
    reviewHtml: path.join(review, "review.html"),
    /** Phase 2: light cut preview (checked by the user before the final cut). */
    cutPreview: path.join(intermediate, "cut-preview.mp4"),
    /** Phase 2: full-quality cut (input to subtitles / render; not output/final.mp4). */
    cutFinal: path.join(intermediate, "cut.mp4"),
    timemap: path.join(intermediate, "timemap.json"),
    quoteAlignment: path.join(intermediate, "quote-alignment.json"),
    /** Phase 3: subtitle draft (generated, cut.mp4 time). */
    subtitlesDraft: path.join(intermediate, "subtitles.draft.json"),
    /** Phase 3: the user's subtitle edits and approval (written via npm run subtitles). */
    subtitles: path.join(input, "subtitles.json"),
    subtitlesHtml: path.join(review, "subtitles.html"),
  };
}
