// npm run subtitles -- retime: subtitle times from the audio of cut.mp4 (2026-11-23, an).
//
// whisper's word / token times drift (they run into silences and can be seconds off), so a
// subtitle placed by them shows too early or too late. Here the times come from the sound:
//   1. speech chunks: 10 ms frames of cut.mp4's audio louder than voiceDb, joined over short gaps
//   2. each chunk is transcribed on its own (the model loaded once); a chunk's start is exact
//   3. the subtitle texts (as they are now: split, corrected) are matched to the chunk texts
//      character by character (longest common subsequence; katakana/hiragana and digits unified)
//   4. a subtitle starts where its first character is heard; a change inside a chunk goes to the
//      nearest breath (a short dip) within snapSeconds
//   5. it stays until the next subtitle when the gap is short, otherwise tailSeconds after its last word
// Texts are never changed: only start / end. Fully local (core STT: whisper.cpp on Mac,
// faster-whisper on Windows).

import fs from "node:fs";
import path from "node:path";
import { readPcmWav, type Pcm } from "./audioLevel.ts";
import type { Settings } from "./config.ts";
import { extractAudio } from "./engine.ts";
import type { ProjectPaths } from "./paths.ts";
import { planTranscription, transcribeClipWavs, type SttPlan } from "./stt.ts";

export type RetimeCue = { id: string; text: string; start: number; end: number };
export type RetimeChunk = { start: number; end: number; text: string; dropped?: boolean };
export type RetimeResult = {
  voiceDb: number;
  breathDb: number;
  chunks: RetimeChunk[];
  plan: SttPlan;
  cues: (RetimeCue & { newStart: number; newEnd: number; matched: number; snapped: boolean })[];
  /** Heard but in no subtitle (2+ characters): left-over restarts, words the subtitles dropped, noise. */
  unheard: { start: number; end: number; text: string }[];
  matchedRatio: number;
};

const FRAME = 0.01;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** For matching only: no punctuation / spaces, katakana → hiragana, full-width → half-width, lower case. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[、。，．,.!?！？\s「」『』…・ー〜~|｜"'“”()（）]/g, "")
    .toLowerCase();
}

function frameDb(pcm: Pcm): number[] {
  const hop = Math.round(pcm.sampleRate * FRAME);
  const out: number[] = [];
  for (let i = 0; i + hop <= pcm.samples.length; i += hop) {
    let sum = 0;
    for (let k = i; k < i + hop; k++) {
      const v = pcm.samples[k] / 32768;
      sum += v * v;
    }
    out.push(sum > 0 ? 10 * Math.log10(sum / hop) : -120);
  }
  return out;
}

export function speechChunks(db: number[], voiceDb: number, s: Settings["retime"]): { start: number; end: number }[] {
  const raw: [number, number][] = [];
  let st = -1;
  for (let i = 0; i <= db.length; i++) {
    const v = i < db.length && db[i] > voiceDb;
    if (v && st < 0) st = i;
    if (!v && st >= 0) {
      raw.push([st, i]);
      st = -1;
    }
  }
  const joined: [number, number][] = [];
  for (const r of raw) {
    const last = joined[joined.length - 1];
    if (last && (r[0] - last[1]) * FRAME < s.joinGapSeconds) last[1] = r[1];
    else joined.push([...r]);
  }
  return joined.filter(([a, b]) => (b - a) * FRAME >= s.minChunkSeconds).map(([a, b]) => ({ start: r3(a * FRAME), end: r3(b * FRAME) }));
}

function writeWav16(file: string, pcm: Pcm, start: number, end: number) {
  const a = Math.max(0, Math.floor(start * pcm.sampleRate));
  const b = Math.min(pcm.samples.length, Math.ceil(end * pcm.sampleRate));
  const n = Math.max(0, b - a);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(pcm.sampleRate, 24);
  buf.writeUInt32LE(pcm.sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(pcm.samples[a + i], 44 + i * 2);
  fs.writeFileSync(file, buf);
}

/**
 * About how long a (normalized) character takes to say, in morae: a digit is read as several
 * (4800 → よんせんはっぴゃく), a kanji ≈ 2, small kana fold into the one before.
 */
export function spokenWeight(c: string): number {
  if (/[0-9]/.test(c)) return 2.5;
  if (/[ぁぃぅぇぉゃゅょゎ]/.test(c)) return 0.3;
  if (/[ぁ-ゖ]/.test(c)) return 1;
  if (/[一-鿿々]/.test(c)) return 2;
  if (/[a-z]/.test(c)) return 0.8;
  return 1;
}

/**
 * Maps a fraction (0..1) of a chunk's speech to a time, counting only frames louder than voiceDb,
 * so pauses and dips inside the chunk take no share of the characters.
 */
export function voicedClock(db: number[], start: number, end: number, voiceDb: number): (fraction: number) => number {
  const a = Math.max(0, Math.round(start / FRAME));
  const b = Math.min(db.length, Math.max(a + 1, Math.round(end / FRAME)));
  const voiced: number[] = [];
  for (let f = a; f < b; f++) if (db[f] > voiceDb) voiced.push(f);
  if (voiced.length < 2) return (x) => start + (end - start) * x;
  return (x) => {
    const pos = Math.min(voiced.length - 1, Math.max(0, x * voiced.length));
    const i = Math.floor(pos);
    if (x >= 1) return Math.min(end, (voiced[voiced.length - 1] + 1) * FRAME);
    return (voiced[i] + (pos - i)) * FRAME;
  };
}

/** Longest common subsequence: for each index of a, the matched index of b (or -1). */
export function lcsMap(a: string[], b: string[]): number[] {
  const n = a.length;
  const m = b.length;
  // About 1 byte per pair: a 4-minute talk is ~1.4 M; stop well before memory runs out (≈ a 60-minute talk).
  if ((n + 1) * (m + 1) > 250_000_000) throw new Error(`字幕と声の文字が多すぎて対応づけできません（${n}×${m}）。動画を分けてください。`);
  // Row-by-row lengths with a direction table (n·m bytes; ~1–2 M for a 4-minute talk).
  const dir = new Uint8Array((n + 1) * (m + 1));
  let prev = new Uint16Array(m + 1);
  let cur = new Uint16Array(m + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        dir[i * (m + 1) + j] = 1;
      } else if (prev[j] >= cur[j - 1]) {
        cur[j] = prev[j];
        dir[i * (m + 1) + j] = 2;
      } else {
        cur[j] = cur[j - 1];
        dir[i * (m + 1) + j] = 3;
      }
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  const map = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const d = dir[i * (m + 1) + j];
    if (d === 1) {
      map[i - 1] = j - 1;
      i--;
      j--;
    } else if (d === 2) i--;
    else j--;
  }
  return map;
}

export async function retimeSubtitles(
  paths: ProjectPaths,
  cues: RetimeCue[],
  settings: Settings,
  log: (s: string) => void = () => {},
): Promise<RetimeResult> {
  const s = settings.retime;
  const work = path.join(paths.intermediate, "retime");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  try {
    const wav = path.join(work, "cut-16k.wav");
    await extractAudio(paths.cutFinal, wav, { sampleRate: 16000, channels: 1, overwrite: true });
    const pcm = readPcmWav(wav);
    const db = frameDb(pcm);
    const sorted = [...db].sort((x, y) => x - y);
    const loud = sorted[Math.floor(sorted.length * 0.95)] ?? -20;
    const voiceDb = s.voiceDb ?? Math.min(-35, Math.max(-55, Math.round(loud - 25)));
    const breathDb = s.breathDb ?? voiceDb + 7;
    const found = speechChunks(db, voiceDb, s);
    log(`声のかたまり ${found.length} 個（声とみなす音量 ${voiceDb}dB、息つぎ ${breathDb}dB）`);

    // Each chunk on its own, the model loaded once.
    const clipFiles = found.map((c, i) => {
      const f = path.join(work, `clip-${String(i).padStart(4, "0")}.wav`);
      writeWav16(f, pcm, c.start - s.clipPaddingSeconds, c.end + s.clipPaddingSeconds);
      return f;
    });
    const plan = planTranscription(settings.transcribe, "");
    log(`かたまりごとに文字起こし中（${plan.backend}、${plan.reason}）…`);
    let lastPct = -1;
    const texts = await transcribeClipWavs(clipFiles, plan, settings.transcribe, (r) => {
      const pct = Math.floor(r * 10) * 10;
      if (pct > lastPct) {
        lastPct = pct;
        log(`  ${pct}%`);
      }
    });
    const junk = new Set(s.hallucinations.map(normalizeForMatch));
    const chunks: RetimeChunk[] = found.map((c, i) => ({ ...c, text: texts[i] ?? "", dropped: junk.has(normalizeForMatch(texts[i] ?? "")) || !normalizeForMatch(texts[i] ?? "") }));

    // Heard characters with times, spread over their chunk by how long each takes to say (spokenWeight)
    // and over the voiced frames only (2026-11-24, ua: even spreading put 「4800円とか」 0.7 s late —
    // 「4800」 is 4 characters but a second of speech, and dips inside a chunk counted as speech time).
    const heard: { c: string; start: number; end: number; chunk: number }[] = [];
    chunks.forEach((c, k) => {
      if (c.dropped) return;
      const chars = Array.from(normalizeForMatch(c.text));
      const at = voicedClock(db, c.start, c.end, voiceDb);
      const weights = chars.map(spokenWeight);
      const total = weights.reduce((a, b) => a + b, 0) || 1;
      let acc = 0;
      chars.forEach((ch, i) => {
        const a = acc / total;
        acc += weights[i];
        heard.push({ c: ch, start: at(a), end: at(acc / total), chunk: k });
      });
    });
    // Subtitle characters.
    const subChars: { c: string; cue: number }[] = [];
    const spans = cues.map((cue, k) => {
      const from = subChars.length;
      for (const ch of Array.from(normalizeForMatch(cue.text))) subChars.push({ c: ch, cue: k });
      return { from, to: subChars.length };
    });
    const map = lcsMap(subChars.map((x) => x.c), heard.map((x) => x.c));
    const known = map.map((v, i) => (v >= 0 ? i : -1)).filter((i) => i >= 0);
    const tStart = (i: number): number => {
      if (map[i] >= 0) return heard[map[i]].start;
      let p = -1;
      let q = -1;
      for (const k of known) {
        if (k < i) p = k;
        else {
          q = k;
          break;
        }
      }
      if (p < 0 && q < 0) return 0;
      if (p < 0) return heard[map[q]].start;
      if (q < 0) return heard[map[p]].end;
      const a = heard[map[p]].end;
      const b = heard[map[q]].start;
      return a + ((b - a) * (i - p)) / (q - p);
    };
    const tEnd = (i: number) => (map[i] >= 0 ? heard[map[i]].end : tStart(i));

    const chunkStarts = chunks.filter((c) => !c.dropped).map((c) => c.start);
    const matchedHeard = new Set(map.filter((v) => v >= 0));
    /**
     * A subtitle whose first characters were heard spelled differently (けっこう / 結構, 4800 / 1800):
     * it starts at the unmatched heard characters just before its first matched one, in the same
     * chunk and at most leadMaxSeconds earlier — not at a point interpolated from the previous
     * subtitle (2026-11-24, ua: that moved 「けっこう…」 2 s early and 「4800円とか」 late).
     */
    const leadMaxSeconds = 1.2;
    const startOf = (from: number, to: number): number => {
      let fm = from;
      while (fm < to && map[fm] < 0) fm++;
      if (fm === from || fm >= to) return tStart(from);
      const h0 = map[fm];
      let h = h0;
      while (h - 1 >= 0 && !matchedHeard.has(h - 1) && heard[h - 1].chunk === heard[h0].chunk && heard[h0].start - heard[h - 1].start <= leadMaxSeconds) h--;
      return h < h0 ? heard[h].start : tStart(from);
    };
    const out = cues.map((cue, k) => {
      const { from, to } = spans[k];
      if (to <= from) return { ...cue, newStart: cue.start, newEnd: cue.end, matched: 0, snapped: false };
      let start = startOf(from, to);
      let snapped = false;
      // Inside a chunk: the nearest breath (end of a dip) within snapSeconds.
      if (!chunkStarts.some((a) => Math.abs(a - start) < 0.02)) {
        const est = Math.round(start / FRAME);
        let best = -1;
        const minDip = Math.max(1, Math.round(s.breathMinSeconds / FRAME));
        for (let f = Math.max(1, est - Math.round(s.snapSeconds / FRAME)); f < Math.min(db.length - 1, est + Math.round(s.snapSeconds / FRAME)); f++) {
          if (!(db[f] < breathDb && db[f + 1] >= breathDb)) continue;
          let dip = 0;
          while (f - dip >= 0 && db[f - dip] < breathDb) dip++;
          if (dip >= minDip && (best < 0 || Math.abs(f + 1 - est) < Math.abs(best - est))) best = f + 1;
        }
        if (best >= 0) {
          start = best * FRAME;
          snapped = true;
        }
      }
      const matched = Array.from({ length: to - from }, (_, i) => map[from + i] >= 0).filter(Boolean).length / (to - from);
      return { ...cue, newStart: start, newEnd: tEnd(to - 1), matched, snapped };
    });
    // Order kept: a start that would pass the next one falls back to the plain estimate.
    for (let k = 1; k < out.length; k++) {
      if (out[k].newStart <= out[k - 1].newStart + 0.05) {
        const plain = startOf(spans[k].from, spans[k].to);
        if (plain > out[k - 1].newStart + 0.05) {
          out[k].newStart = plain;
          out[k].snapped = false;
        }
      }
    }
    // Ends: hold until the next subtitle across a short gap, otherwise a short tail.
    const duration = pcm.samples.length / pcm.sampleRate;
    for (let k = 0; k < out.length; k++) {
      const next = out[k + 1];
      let e = out[k].newEnd + s.tailSeconds;
      if (next) e = next.newStart - out[k].newEnd < s.holdGapSeconds ? next.newStart : Math.min(e, next.newStart);
      out[k].newEnd = Math.min(Math.max(e, out[k].newStart + 0.2), next ? next.newStart : duration);
      out[k].newStart = r3(out[k].newStart);
      out[k].newEnd = r3(out[k].newEnd);
    }

    // Heard but in no subtitle. Characters between a subtitle's first and last matched character are
    // the same words spelled differently (雄二 / 勇児, ミコト / 美琴): not reported.
    const used = new Set(map.filter((v) => v >= 0));
    for (const { from, to } of spans) {
      const hit = map.slice(from, to).filter((v) => v >= 0);
      if (hit.length) for (let h = Math.min(...hit); h <= Math.max(...hit); h++) used.add(h);
    }
    const unheard: RetimeResult["unheard"] = [];
    let run: typeof heard = [];
    const flush = () => {
      if (run.length >= 2) unheard.push({ start: r3(run[0].start), end: r3(run[run.length - 1].end), text: run.map((x) => x.c).join("") });
      run = [];
    };
    heard.forEach((h, i) => {
      if (used.has(i)) flush();
      else {
        if (run.length && run[run.length - 1].chunk !== h.chunk) flush();
        run.push(h);
      }
    });
    flush();
    return { voiceDb, breathDb, chunks, plan, cues: out, unheard, matchedRatio: known.length / Math.max(1, subChars.length) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
