// Loudness of time ranges, read straight from audio/source-16k.wav
// (16 kHz mono 16-bit PCM written by analyze). Read-only; no ffmpeg call per range.

import fs from "node:fs";
import { UserError } from "./cli.ts";

export type Pcm = { sampleRate: number; samples: Int16Array };

export function readPcmWav(file: string): Pcm {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new UserError(`${file} は WAV ではありません。npm run analyze をやり直してください。`);
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === "data") {
      if (channels !== 1 || bits !== 16) throw new UserError(`${file}: モノラル16bitの WAV が必要です（${channels}ch／${bits}bit）。`);
      const len = Math.min(size, buf.length - body) >> 1;
      const samples = new Int16Array(len);
      for (let i = 0; i < len; i++) samples[i] = buf.readInt16LE(body + i * 2);
      return { sampleRate, samples };
    }
    offset = body + size + (size & 1);
  }
  throw new UserError(`${file} に音声データがありません。`);
}

export type Level = { rmsDb: number; peakDb: number };

const toDb = (v: number) => (v > 0 ? Math.round(20 * Math.log10(v) * 10) / 10 : -120);

/** RMS / peak of [start, end) seconds in dBFS. */
export function levelOf(pcm: Pcm, start: number, end: number): Level {
  const a = Math.max(0, Math.floor(start * pcm.sampleRate));
  const b = Math.min(pcm.samples.length, Math.ceil(end * pcm.sampleRate));
  if (b <= a) return { rmsDb: -120, peakDb: -120 };
  let sum = 0;
  let peak = 0;
  for (let i = a; i < b; i++) {
    const v = pcm.samples[i] / 32768;
    sum += v * v;
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
  }
  return { rmsDb: toDb(Math.sqrt(sum / (b - a))), peakDb: toDb(peak) };
}

/** RMS over many ranges together (e.g. every word = the speech level). */
export function levelOfRanges(pcm: Pcm, ranges: { start: number; end: number }[]): number {
  let sum = 0;
  let n = 0;
  for (const r of ranges) {
    const a = Math.max(0, Math.floor(r.start * pcm.sampleRate));
    const b = Math.min(pcm.samples.length, Math.ceil(r.end * pcm.sampleRate));
    for (let i = a; i < b; i++) {
      const v = pcm.samples[i] / 32768;
      sum += v * v;
    }
    n += Math.max(0, b - a);
  }
  return n ? toDb(Math.sqrt(sum / n)) : -120;
}
