// Loads and validates lessons/lesson-XX/lesson.json and the shared
// pronunciation dictionary, and derives each line's caption and reading.
// Pure apart from reading the two JSON files.

import fs from "node:fs";
import path from "node:path";

/** Subtitle limit: 2 rows x 22 full-width chars (ASCII counts as half). */
export const MAX_CAPTION_WIDTH = 44;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Not found: ${file}`);
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  try {
    return { raw, data: JSON.parse(raw) };
  } catch (err) {
    throw new Error(`Invalid JSON in ${file}: ${err.message}`);
  }
}

/** Display width: ASCII (incl. space) = 0.5, everything else = 1. */
export function captionWidth(text) {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) < 0x80 ? 0.5 : 1;
  return w;
}

/** Caption = the spoken text minus its final "。". */
export function captionText(text) {
  return text.replace(/。+$/u, "");
}

export function loadDictionary(file) {
  const { raw, data } = readJson(file);
  if (!Array.isArray(data.entries)) throw new Error(`${file}: "entries" must be an array.`);
  const rules = data.entries.map((e, i) => {
    if (typeof e.from !== "string" || typeof e.to !== "string" || !e.from) {
      throw new Error(`${file}: entries[${i}] needs string "from" and "to".`);
    }
    return {
      from: e.from,
      to: e.to,
      re: new RegExp(e.regex ? e.from : e.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    };
  });
  // Longest first, so "Claude Code" wins over "Claude".
  rules.sort((a, b) => b.from.length - a.from.length);
  const engineReads = data.engineReads ?? [];
  if (!Array.isArray(engineReads) || !engineReads.every((w) => typeof w === "string" && w)) {
    throw new Error(`${file}: "engineReads" must be an array of words.`);
  }
  return { raw, rules, engineReads };
}

/**
 * Applies the dictionary in one left-to-right pass, so a replacement is never
 * re-matched by a shorter rule (e.g. "GitHub" -> "ギットハブ" stays intact).
 */
export function toReading(text, rules) {
  const combined = new RegExp(rules.map((r) => `(${r.re.source})`).join("|"), "g");
  return text.replace(combined, (match) => {
    const rule = rules.find((r) => new RegExp(`^(?:${r.re.source})$`).test(match));
    return match.replace(new RegExp(rule.re.source), rule.to);
  });
}

/** Videos outside the numbered lessons (free trial, sales page intro). */
export const STANDALONE_VIDEOS = ["free-trial", "sales-intro"];

/** Values accepted by --lesson=: a two-digit course lesson, or a standalone video. */
export const LESSON_KEY_HELP = `--lesson=NN (two digits) or --lesson=${STANDALONE_VIDEOS.join("|")}`;

/**
 * Where a lesson's script and generated audio live.
 *   NN           lessons/lesson-NN/    public/lessons/lesson-NN/audio/
 *   free-trial   lessons/free-trial/   public/free-trial/audio/
 *   sales-intro  lessons/sales-intro/  public/sales-intro/audio/
 * Throws for anything else.
 */
export function lessonPaths(projectRoot, key) {
  let scriptDir;
  let audioDir;
  let previewSubdir;
  if (/^\d{2}$/.test(key ?? "")) {
    scriptDir = path.join(projectRoot, "lessons", `lesson-${key}`);
    audioDir = path.join(projectRoot, "public", "lessons", `lesson-${key}`, "audio");
    previewSubdir = "";
  } else if (STANDALONE_VIDEOS.includes(key)) {
    scriptDir = path.join(projectRoot, "lessons", key);
    audioDir = path.join(projectRoot, "public", key, "audio");
    previewSubdir = key;
  } else {
    throw new Error(`Unknown lesson "${key}". Use ${LESSON_KEY_HELP}.`);
  }
  return {
    key,
    scriptDir,
    lessonFile: path.join(scriptDir, "lesson.json"),
    captionsFile: path.join(scriptDir, "captions.json"),
    audioDir,
    previewSubdir,
  };
}

/**
 * Returns { lesson, raw, lines, errors, warnings }. `lines` is the flat list
 * of spoken lines with chapter/scene ids, caption and reading attached.
 */
export function loadLesson(projectRoot, lessonNo, dictionary) {
  const file = lessonPaths(projectRoot, lessonNo).lessonFile;
  const { raw, data: lesson } = readJson(file);
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const lines = [];

  const checkId = (id, where) => {
    if (typeof id !== "string" || !ID_PATTERN.test(id)) errors.push(`${where}: invalid id "${id}"`);
    else if (seen.has(id)) errors.push(`${where}: duplicate id "${id}"`);
    else seen.add(id);
  };

  if (lesson.schemaVersion !== 1) errors.push(`schemaVersion must be 1 (got ${lesson.schemaVersion})`);
  if (lesson.lesson !== lessonNo) errors.push(`"lesson" is "${lesson.lesson}", expected "${lessonNo}"`);
  if (!Number.isInteger(lesson.voice?.speaker)) errors.push("voice.speaker must be an integer style ID");
  for (const key of ["leadInSeconds", "linePauseSeconds", "scenePauseSeconds", "tailOutSeconds"]) {
    const v = lesson.timing?.[key];
    if (typeof v !== "number" || v < 0 || v > 10) errors.push(`timing.${key} must be a number 0-10`);
  }
  if (!Array.isArray(lesson.chapters) || lesson.chapters.length === 0) errors.push("chapters is empty");

  for (const chapter of lesson.chapters ?? []) {
    checkId(chapter.id, "chapter");
    if (!chapter.title) errors.push(`${chapter.id}: missing title`);
    if (!Array.isArray(chapter.scenes) || chapter.scenes.length === 0) errors.push(`${chapter.id}: no scenes`);
    for (const scene of chapter.scenes ?? []) {
      const where = `${chapter.id}/${scene.id}`;
      checkId(scene.id, where);
      if (typeof scene.layout !== "string" || !scene.layout) errors.push(`${where}: missing layout`);
      if (!Array.isArray(scene.lines)) {
        errors.push(`${where}: lines must be an array`);
        continue;
      }
      if (scene.lines.length === 0) {
        if (!(typeof scene.durationSeconds === "number" && scene.durationSeconds > 0)) {
          errors.push(`${where}: a scene without lines needs durationSeconds > 0`);
        }
      } else if (scene.durationSeconds !== undefined) {
        errors.push(`${where}: durationSeconds is only for scenes without lines (length comes from audio)`);
      }
      for (const line of scene.lines) {
        const lw = `${where}/${line.id}`;
        checkId(line.id, lw);
        if (typeof line.text !== "string" || !line.text.trim()) {
          errors.push(`${lw}: empty text`);
          continue;
        }
        const caption = captionText(line.text.trim());
        const width = captionWidth(caption);
        if (width > MAX_CAPTION_WIDTH) {
          errors.push(`${lw}: caption too long (${width} > ${MAX_CAPTION_WIDTH}); split the line`);
        }
        const reading = typeof line.yomi === "string" && line.yomi.trim() ? line.yomi.trim() : toReading(line.text.trim(), dictionary.rules);
        // Words in engineReads are left as-is on purpose (verified by ear).
        const latin = dictionary.engineReads
          .reduce((s, w) => s.replace(new RegExp(`(?<![A-Za-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`, "g"), ""), reading)
          .match(/[A-Za-z][A-Za-z.]*/g);
        if (latin) {
          errors.push(`${lw}: reading still has Latin letters (${[...new Set(latin)].join(", ")}); add them to pronunciation.json or set "yomi"`);
        }
        lines.push({
          id: line.id,
          chapterId: chapter.id,
          sceneId: scene.id,
          text: line.text.trim(),
          caption,
          reading,
          width,
        });
      }
    }
  }
  if (lines.length === 0) errors.push("no spoken lines");
  return { lesson, raw, file, lines, errors, warnings };
}
