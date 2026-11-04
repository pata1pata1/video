// claude-course's caption display rules for captions.vtt (viewers): the display
// wording of captions.json (overrides) with the same row breaks as the video
// (src/components/captionLayout.ts: 25 full-width per row, 2 rows, 「、」 dropped).
// narration.srt keeps the spoken wording. Writing the files (SRT / WebVTT) is the
// shared engine's (core/subtitles).

import fs from "node:fs";
import { MAX_ROW_WIDTH, splitCaption } from "../../src/components/captionLayout.ts";

const NEWLINE = String.fromCharCode(10);

/** Reads captions.json overrides ({} when the file is absent). */
export function loadCaptionOverrides(file) {
  if (!fs.existsSync(file)) return {};
  const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
  return data.overrides ?? {};
}

/** Cues with the caption as shown in the video: display wording, no 「、」, same row breaks. */
export function displayCues(lines, overrides) {
  return lines.map((l) => ({
    ...l,
    caption: splitCaption(overrides[l.id] ?? l.caption, MAX_ROW_WIDTH).join(NEWLINE),
  }));
}
