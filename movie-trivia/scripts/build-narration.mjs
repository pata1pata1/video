// Builds the narration for a script with the local VOICEVOX ENGINE.
//
//   node scripts/build-narration.mjs --script=<id> [--dry-run] [--line=<id>]
//
// --dry-run   print each line's reading and the engine's kana, write nothing
// --line=<id> synthesize one line to .cache/voicevox/preview/<id>.wav
//
// Output (public/audio/<script>/):
//   narration.wav   the whole voice track, 0 s = start of the video
//   narration.json  start/end seconds of every scene and line (the video uses this)
//   narration.srt   one cue per line
// Times come from actual sample counts, never from text length. Each line's
// synthesis is cached by reading + voice + engine version, so editing the
// script only re-synthesizes the changed lines.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadVideo } from "./lib/video.mjs";
import { parseWav, sameFormat, wavHeader } from "./wav.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const scriptId = opt("script");
if (!scriptId) throw new Error("Usage: node scripts/build-narration.mjs --script=<id> [--dry-run] [--line=<id>]");
const dryRun = args.includes("--dry-run");
const onlyLine = opt("line");

// voice (speaker, speedScale) and timing come from the pattern unless the script overrides them
const { script, voice, timing, engineUrl: ENGINE_URL } = loadVideo(scriptId);
const outDir = path.join(ROOT, "public", "audio", scriptId);
const cacheDir = path.join(ROOT, ".cache", "voicevox");

const rules = Object.entries(script.pronunciation ?? {}).sort((a, b) => b[0].length - a[0].length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const combined = rules.length ? new RegExp(rules.map(([from]) => escape(from)).join("|"), "g") : null;

/** Applies the pronunciation table in one pass (longest match first). */
function reading(text) {
  const replaced = combined ? text.replace(combined, (m) => script.pronunciation[m]) : text;
  return replaced.replace(/[「」『』]/g, "");
}

const caption = (text) => text.replace(/。$/u, "");

async function engine(pathAndQuery, init) {
  let res;
  try {
    res = await fetch(new URL(pathAndQuery, ENGINE_URL), { ...init, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    throw new Error(`VOICEVOX ENGINE (${ENGINE_URL}) に接続できません: ${err.message}\nVOICEVOXアプリを起動してから再実行して下さい。`);
  }
  if (!res.ok) throw new Error(`${pathAndQuery} -> HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function audioQuery(text) {
  const q = await (await engine(`/audio_query?speaker=${voice.speaker}&text=${encodeURIComponent(text)}`, { method: "POST" })).json();
  q.speedScale = voice.speedScale;
  return q;
}

async function synthesize(text, version) {
  const key = crypto
    .createHash("sha256")
    .update(JSON.stringify([text, voice, version]))
    .digest("hex")
    .slice(0, 24);
  const file = path.join(cacheDir, `${key}.wav`);
  if (fs.existsSync(file)) return parseWav(fs.readFileSync(file));
  const q = await audioQuery(text);
  const res = await engine(`/synthesis?speaker=${voice.speaker}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(q),
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, bytes);
  return parseWav(bytes);
}

function srtTime(s) {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

async function main() {
  const lines = script.scenes.flatMap((s) => s.lines.map((l) => ({ ...l, sceneId: s.id })));
  const ids = new Set();
  for (const l of lines) {
    if (ids.has(l.id)) throw new Error(`duplicate line id ${l.id}`);
    ids.add(l.id);
  }
  for (const s of script.scenes) {
    for (const p of s.points ?? []) if (!s.lines.some((l) => l.id === p.at)) throw new Error(`${s.id}: point "${p.text}" refers to unknown line ${p.at}`);
  }

  const version = await (await engine("/version")).json();
  console.log(`VOICEVOX ENGINE ${version} / speaker ${voice.speaker} (${voice.speakerName}) / speed ${voice.speedScale}`);

  if (dryRun) {
    let total = 0;
    for (const l of lines) {
      const q = await audioQuery(reading(l.text));
      const sec = q.accent_phrases.reduce(
        (acc, ap) => acc + ap.moras.reduce((a, m) => a + (m.consonant_length ?? 0) + m.vowel_length, 0) + (ap.pause_mora?.vowel_length ?? 0),
        0,
      ) / q.speedScale;
      total += sec;
      console.log(`${l.id.padEnd(6)} ${sec.toFixed(1).padStart(5)}s  ${l.text}\n${" ".repeat(14)}${q.kana}`);
    }
    console.log(`\n${lines.length} lines, speech only ≈ ${(total / 60).toFixed(1)} min`);
    return;
  }

  if (onlyLine) {
    const l = lines.find((x) => x.id === onlyLine);
    if (!l) throw new Error(`unknown line ${onlyLine}`);
    const wav = await synthesize(reading(l.text), version);
    const file = path.join(cacheDir, "preview", `${l.id}.wav`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat([wavHeader(wav.data.length, wav), wav.data]));
    console.log(`wrote ${path.relative(ROOT, file)}`);
    return;
  }

  const t = timing;
  let format = null;
  const chunks = [];
  let frames = 0;
  const silence = (sec) => {
    const n = Math.round(sec * format.sampleRate);
    chunks.push(Buffer.alloc(n * format.frameBytes));
    frames += n;
  };
  const out = { script: scriptId, engine: version, voice, scenes: [], lines: [] };

  for (const [si, scene] of script.scenes.entries()) {
    const sceneLines = [];
    for (const [li, l] of scene.lines.entries()) {
      const wav = await synthesize(reading(l.text), version);
      if (!format) {
        format = wav;
        silence(t.leadIn);
      } else if (!sameFormat(format, wav)) throw new Error("engine returned a different WAV format");
      if (li > 0) silence(t.linePause);
      else if (si > 0) silence(t.scenePause);
      const start = frames / format.sampleRate;
      chunks.push(wav.data);
      frames += wav.frames;
      const end = frames / format.sampleRate;
      const entry = { id: l.id, sceneId: scene.id, start: +start.toFixed(4), end: +end.toFixed(4), caption: caption(l.caption ?? l.text) };
      out.lines.push(entry);
      sceneLines.push(entry);
      process.stdout.write(`\r${out.lines.length}/${lines.length}`);
    }
    out.scenes.push({ id: scene.id, start: sceneLines[0].start, end: sceneLines.at(-1).end });
  }
  silence(t.tailOut);
  out.sampleRate = format.sampleRate;
  out.durationSeconds = +(frames / format.sampleRate).toFixed(4);

  fs.mkdirSync(outDir, { recursive: true });
  const data = Buffer.concat(chunks);
  fs.writeFileSync(path.join(outDir, "narration.wav"), Buffer.concat([wavHeader(data.length, format), data]));
  fs.writeFileSync(path.join(outDir, "narration.json"), JSON.stringify(out, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "narration.srt"),
    out.lines.map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(l.end)}\n${l.caption}\n`).join("\n"),
  );
  const m = Math.floor(out.durationSeconds / 60);
  console.log(`\nwrote public/audio/${scriptId}/ (${m}:${(out.durationSeconds % 60).toFixed(1).padStart(4, "0")})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
