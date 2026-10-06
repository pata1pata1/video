// Prints YouTube chapters (0:00 タイトル ...) from narration.json.
//   node scripts/chapters.mjs --script=<id>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = process.argv.find((a) => a.startsWith("--script="))?.split("=")[1];
if (!id) throw new Error("Usage: node scripts/chapters.mjs --script=<id>");
const script = JSON.parse(fs.readFileSync(path.join(ROOT, "script", `${id}.json`), "utf8"));
const narration = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "audio", id, "narration.json"), "utf8"));

// Same lead as the video (scenes appear 0.4 s before their first line).
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
script.scenes.forEach((scene, i) => {
  const start = i === 0 ? 0 : Math.max(0, narration.scenes[i].start - 0.4);
  const label = scene.kind === "opening" ? "オープニング" : scene.kind === "ending" ? "エンディング" : `${scene.number}. ${scene.heading}`;
  console.log(`${clock(start)} ${label}`);
});
