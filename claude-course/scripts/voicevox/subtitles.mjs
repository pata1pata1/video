// SRT / WebVTT writers. Cue times always come from narration.json (which is
// built from actual sample counts), never from text-length estimates.
//
// narration.srt keeps the spoken wording (a transcript of the audio).
// captions.vtt is for viewers, so it uses the same display text and row
// breaks as the video (lessons/lesson-XX/captions.json + captionLayout.ts).

import fs from "node:fs";
import { MAX_ROW_WIDTH, splitCaption } from "../../src/components/captionLayout.ts";

const NEWLINE = String.fromCharCode(10);

/** Reads lessons/lesson-XX/captions.json overrides ({} when the file is absent). */
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

function clock(seconds, sep) {
  const ms = Math.round(seconds * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(
    Math.floor(ms / 1000) % 60,
  )}${sep}${pad(ms % 1000, 3)}`;
}

/** @param {{start:number,end:number,caption:string}[]} cues */
export function toSrt(cues) {
  return cues
    .map((c, i) => `${i + 1}\n${clock(c.start, ",")} --> ${clock(c.end, ",")}\n${c.caption}\n`)
    .join("\n");
}

/** @param {{id:string,start:number,end:number,caption:string}[]} cues */
export function toVtt(cues) {
  const body = cues
    .map((c) => `${c.id}\n${clock(c.start, ".")} --> ${clock(c.end, ".")}\n${c.caption}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}
