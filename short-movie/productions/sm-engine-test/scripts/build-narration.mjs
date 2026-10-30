// Builds the narration and the card timeline with the local VOICEVOX ENGINE.
//
//   node scripts/build-narration.mjs [--dry-run]
//
// Each sentence is synthesized whole (natural intonation). Card boundaries inside a
// sentence come from VOICEVOX's own mora lengths: the mora count of the text up to the
// boundary is looked up in the whole sentence's audio_query, and the raw mora times are
// scaled to the real sample count of the synthesized sentence.
//
// card.image is a file name in public/images/ (zoom and panel overrides are read by src/Short.tsx from script.json).
//
// Output: public/audio/narration.wav, public/audio/timeline.json, public/audio/narration.srt

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "http://127.0.0.1:50021";
const script = JSON.parse(fs.readFileSync(path.join(ROOT, "script.json"), "utf8"));
const { speaker, speedScale } = script.voice;
const dryRun = process.argv.includes("--dry-run");

const rules = Object.entries(script.pronunciation).sort((a, b) => b[0].length - a[0].length);
const reading = (text) => {
  let s = text;
  for (const [from, to] of rules) s = s.split(from).join(to);
  return s.replace(/[「」『』]/g, "");
};
// subtitles never show 、 or 。 (? and ! stay)
const caption = (card) => (card.caption ?? card.text).replace(/[、。]/g, "");

async function engine(p, init) {
  const res = await fetch(ENGINE + p, init);
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status} ${await res.text()}`);
  return res;
}
const query = async (text) => {
  const q = await (await engine(`/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`, { method: "POST" })).json();
  q.speedScale = speedScale;
  return q;
};

/** Raw (unscaled) start time of every spoken mora, plus total raw length. */
function moraTimes(q) {
  let t = q.prePhonemeLength;
  const starts = [];
  for (const ap of q.accent_phrases) {
    for (const m of ap.moras) {
      starts.push(t);
      t += (m.consonant_length ?? 0) + m.vowel_length;
    }
    if (ap.pause_mora) t += ap.pause_mora.vowel_length;
  }
  return { starts, total: t + q.postPhonemeLength };
}
const moraCount = (q) => q.accent_phrases.reduce((n, ap) => n + ap.moras.length, 0);

function parseWav(buf) {
  let off = 12;
  let fmt;
  while (off < buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") return { ...fmt, data: buf.subarray(off + 8, off + 8 + size) };
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}
function wavHeader(f, dataBytes) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii"); h.writeUInt32LE(36 + dataBytes, 4); h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii"); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(f.channels, 22);
  h.writeUInt32LE(f.rate, 24); h.writeUInt32LE((f.rate * f.channels * f.bits) / 8, 28);
  h.writeUInt16LE((f.channels * f.bits) / 8, 32); h.writeUInt16LE(f.bits, 34);
  h.write("data", 36, "ascii"); h.writeUInt32LE(dataBytes, 40);
  return h;
}

const pcm = [];
let fmt;
let clock = 0;
const cards = [];
for (const [si, sentence] of script.sentences.entries()) {
  const full = sentence.cards.map((c) => c.text).join("");
  const q = await query(reading(full));
  console.log(`S${si + 1} ${q.kana}`);
  if (dryRun) continue;

  const wav = parseWav(Buffer.from(await (await engine(`/synthesis?speaker=${speaker}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(q),
  })).arrayBuffer()));
  fmt ??= wav;
  const bytesPerSec = (wav.rate * wav.channels * wav.bits) / 8;
  const dur = wav.data.length / bytesPerSec;
  const { starts, total } = moraTimes(q);
  const scale = dur / total;

  // mora index where each card starts
  let prefix = "";
  const firstMora = [0];
  for (const c of sentence.cards.slice(0, -1)) {
    prefix += c.text;
    firstMora.push(moraCount(await query(reading(prefix))));
  }
  sentence.cards.forEach((c, i) => {
    const start = i === 0 ? 0 : starts[Math.min(firstMora[i], starts.length - 1)] * scale;
    cards.push({ sentence: si, text: caption(c), image: c.image, start: clock + start });
  });
  pcm.push(wav.data);
  clock += dur;
  const gapBytes = Math.round(script.sentenceGap * wav.rate) * wav.channels * (wav.bits / 8);
  if (si < script.sentences.length - 1) {
    pcm.push(Buffer.alloc(gapBytes));
    clock += gapBytes / bytesPerSec;
  }
}
if (dryRun) process.exit(0);

// a card lasts until the next one starts; the last one until the end of the audio
cards.forEach((c, i) => (c.end = i + 1 < cards.length ? cards[i + 1].start : clock));
// carry the current image forward
let img;
for (const c of cards) c.image = img = c.image ?? img;

const outDir = path.join(ROOT, "public", "audio");
fs.mkdirSync(outDir, { recursive: true });
const data = Buffer.concat(pcm);
fs.writeFileSync(path.join(outDir, "narration.wav"), Buffer.concat([wavHeader(fmt, data.length), data]));
fs.writeFileSync(path.join(outDir, "timeline.json"), JSON.stringify({ duration: clock, cards }, null, 2));
const ts = (s) => new Date(Math.round(s * 1000)).toISOString().slice(11, 23).replace(".", ",");
fs.writeFileSync(
  path.join(outDir, "narration.srt"),
  cards.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n"),
);
console.log(`duration ${clock.toFixed(2)} s, ${cards.length} cards`);
