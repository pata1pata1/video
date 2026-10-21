// S2 of the editing-style learning: rebuild where the user cut, from the source
// video and the finished video they edited elsewhere (reference projects).
//
//   1. text   both transcripts are aligned character by character (LCS) → rough
//             offsets (source time − final time) along the final
//   2. audio  the final is split into 1 s windows (0.5 s hop); every window with
//             speech is placed in the source to the sample by cross-correlation,
//             trying the text offsets and the previous window's offset first and
//             the whole source (FFT) when those fail
//   3. windows with the same offset form kept segments; each cut between two
//             segments is put where the waveform error switches from one offset
//             to the other (5 ms frames; inside a pause the position is ambiguous
//             and the ambiguity is reported)
//   4. speed  long segments are measured at both ends: a speed change would make
//             the offset drift
//
// → intermediate/reconstruction.json, the same shape as timemap.json (segments /
// removed) plus match quality. Read-only for the videos; nothing else is changed.

import fs from "node:fs";
import type { ProbeJson } from "../analyze.ts";
import { readPcmWav } from "../audioLevel.ts";
import { UserError } from "../cli.ts";
import type { KeepSegment } from "../cut.ts";
import { fileFingerprint, readJson, writeJsonAtomic, type Project } from "../project.ts";
import { normalizeForCompare, round3 } from "../text.ts";
import type { Transcript } from "../transcript.ts";
import { AudioMatcher, type Match } from "./audioMatch.ts";
import { assertReference } from "../reference.ts";

const WINDOW = 1.0;
const HOP = 0.5;
/** A window counts as speech when this share of its 50 ms frames is this far above the room tone. */
const VOICED_SHARE = 0.3;
const VOICED_ABOVE_FLOOR_DB = 12;
const ACCEPT_NCC = 0.7;
const ACCEPT_GLOBAL_NCC = 0.6;
/** Second pass for short kept pieces: shorter windows, stricter acceptance. */
const SHORT_WINDOW = 0.4;
const ACCEPT_SHORT_NCC = 0.8;
/** Windows whose offsets differ by less than this belong to the same kept segment. */
const SAME_OFFSET = 0.004;
const BOUNDARY_FRAME = 0.005;
const QUALITY_FRAME = 0.01;
const SPEED_MIN_SEGMENT = 4;
/** Kept pauses: final audio this close to the room tone, at least this long. */
const PAUSE_ABOVE_FLOOR_DB = 6;
const MIN_AUDIO_PAUSE = 0.1;

export type ReconSegment = KeepSegment & {
  /** source time − final time (s). */
  offset: number;
  ncc: number;
  gain: number;
  windows: number;
  /** Width (s) of the range where the cut at each end could be (a pause: both sides match). */
  boundaryUncertainty: { start: number; end: number };
};

export type Reconstruction = {
  version: 1;
  kind: "reconstruction";
  createdAt: string;
  source: { file: string; sha256: string; durationSeconds: number; frames: number };
  final: { file: string; sha256: string; durationSeconds: number; fps: number | null };
  /** timemap.json compatibility: a reconstruction has no candidates / decisions. */
  candidatesFingerprint: null;
  decisionsFingerprint: null;
  frameSnapped: false;
  outputDurationSeconds: number;
  outputFrames: number;
  segments: ReconSegment[];
  /** speechSeconds: source audio inside the range louder than room tone + 12 dB (50 ms frames). */
  removed: { srcStart: number; srcEnd: number; candidateIds: string[]; seconds: number; speechSeconds: number }[];
  /**
   * Pauses heard in the finished video (final audio below room tone + PAUSE_ABOVE_FLOOR_DB for at least
   * MIN_AUDIO_PAUSE). atCut: the pause spans a cut (it was made by joining two kept parts).
   */
  pauses: { outStart: number; outEnd: number; seconds: number; atCut: boolean; edge?: "head" | "tail" }[];
  /** Final-video stretches with speech that match no source position. */
  unmatched: { outStart: number; outEnd: number }[];
  speed: {
    verdict: "unchanged" | "changed" | "unknown";
    /** final speed relative to the source (1 = unchanged), median over long segments. */
    ratio: number | null;
    checks: { segment: number; seconds: number; driftMs: number }[];
  };
  quality: {
    windows: { total: number; voiced: number; matched: number; byText: number; byPrevious: number; byGlobal: number; byShort: number };
    /** Share of the final's speech frames that the kept segments reproduce. */
    matchedSpeechRatio: number;
    speechSeconds: number;
    meanNcc: number;
    /** The final uses source parts out of order / twice. */
    reordered: boolean;
    overlaps: number;
    textAnchors: number;
  };
  stats: { cuts: number; cutsPerMinute: number; removedSeconds: number; keptRatio: number };
  inputs: { sourceTranscript: string | null; finalTranscript: string | null };
};

type Window = { outStart: number; seconds: number; match: Match; via: "text" | "previous" | "global" | "short" };

/** Characters (normalized) with their time, from word timestamps. */
function charsOf(t: Transcript): { c: string[]; t: number[] } {
  const c: string[] = [];
  const times: number[] = [];
  for (const seg of t.segments) {
    for (const w of seg.words) {
      const chars = Array.from(normalizeForCompare(w.text));
      chars.forEach((ch, i) => {
        c.push(ch);
        times.push(w.start + ((w.end - w.start) * (i + 0.5)) / chars.length);
      });
    }
  }
  return { c, t: times };
}

/** Up to this many DP cells (×4 bytes) the LCS is run over the whole transcripts at once. */
const FULL_LCS_CELLS = 40_000_000;
/** Longer videos: k-character sequences found exactly once in each transcript anchor the LCS. */
const SEED_CHARS = 8;

/**
 * LCS of S[i0, i1) and F[j0, j1) → matched index pairs, appended to out. Backtracking
 * from the end matches as late as possible in the source, which picks the last
 * take when a sentence was recorded several times (it is checked by audio anyway).
 */
function lcsPairs(S: string[], F: string[], i0: number, i1: number, j0: number, j1: number, out: [number, number][]): void {
  const n = i1 - i0;
  const m = j1 - j0;
  if (n <= 0 || m <= 0) return;
  const w = m + 1;
  const L = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = S[i0 + i] === F[j0 + j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  // Forward walk over the suffix table = latest-possible matching from the end, in order.
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (S[i0 + i] === F[j0 + j] && L[i * w + j] === L[(i + 1) * w + j + 1] + 1 && L[(i + 1) * w + j] < L[i * w + j]) {
      out.push([i0 + i, j0 + j]);
      i++;
      j++;
    } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) i++;
    else j++;
  }
}

/** Sequences of SEED_CHARS characters that occur exactly once in both, kept in order on both sides (longest chain). */
function uniqueSeeds(S: string[], F: string[]): [number, number][] {
  const once = (c: string[]) => {
    const m = new Map<string, number>();
    for (let i = 0; i + SEED_CHARS <= c.length; i++) {
      const k = c.slice(i, i + SEED_CHARS).join("");
      m.set(k, m.has(k) ? -1 : i);
    }
    return m;
  };
  const inS = once(S);
  const inF = once(F);
  const pairs: [number, number][] = [];
  for (const [k, j] of inF) {
    const i = inS.get(k);
    if (j >= 0 && i !== undefined && i >= 0) pairs.push([i, j]);
  }
  pairs.sort((a, b) => a[1] - b[1]);
  // Longest chain increasing in the source too (patience sorting).
  const tails: number[] = [];
  const prev = new Int32Array(pairs.length).fill(-1);
  for (let p = 0; p < pairs.length; p++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pairs[tails[mid]][0] < pairs[p][0]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[p] = tails[lo - 1];
    tails[lo] = p;
  }
  const chain: [number, number][] = [];
  for (let p = tails.length ? tails[tails.length - 1] : -1; p >= 0; p = prev[p]) chain.push(pairs[p]);
  chain.reverse();
  // Seeds must not overlap each other (a run of seeds along one shared phrase keeps every SEED_CHARS-th).
  const out: [number, number][] = [];
  for (const c of chain) {
    const last = out.at(-1);
    if (!last || (c[0] >= last[0] + SEED_CHARS && c[1] >= last[1] + SEED_CHARS)) out.push(c);
  }
  return out;
}

/**
 * Character alignment of the two transcripts → (srcT, outT) anchors. Short videos:
 * one LCS. Long ones (the DP table would not fit): unique seeds, then an LCS in each
 * stretch between two seeds; a stretch that is still too large gets no text anchors
 * (the audio search finds it from the previous window or the whole source).
 */
function textAnchors(source: Transcript, final: Transcript, log: (s: string) => void): { srcT: number; outT: number }[] {
  const S = charsOf(source);
  const F = charsOf(final);
  const n = S.c.length;
  const m = F.c.length;
  const pairs: [number, number][] = [];
  if ((n + 1) * (m + 1) <= FULL_LCS_CELLS) lcsPairs(S.c, F.c, 0, n, 0, m, pairs);
  else {
    const seeds = uniqueSeeds(S.c, F.c);
    let skipped = 0;
    let [pi, pj] = [0, 0];
    for (const [si, sj] of [...seeds, [n, m] as [number, number]]) {
      if ((si - pi + 1) * (sj - pj + 1) <= FULL_LCS_CELLS) lcsPairs(S.c, F.c, pi, si, pj, sj, pairs);
      else skipped += sj - pj;
      if (si < n) for (let k = 0; k < SEED_CHARS; k++) pairs.push([si + k, sj + k]);
      [pi, pj] = [si + SEED_CHARS, sj + SEED_CHARS];
    }
    log(`文字起こしが長いため、両方に1回だけ出る ${SEED_CHARS}文字の並び ${seeds.length}か所を目印に分けて対応づけ${skipped ? `（${skipped}文字分は文字の対応を省略）` : ""}`);
  }
  return pairs.map(([i, j]) => ({ srcT: S.t[i], outT: F.t[j] }));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

export function reconstructCuts(project: Project, log: (s: string) => void = () => {}): Reconstruction {
  assertReference(project);
  const { paths, json } = project;
  const ref = json.reference;
  if (!ref) throw new UserError(`input/reference/ の動画がまだ登録されていません（npm run reference -- analyze --project=${json.id}）。`);
  for (const f of [paths.audioWav, paths.finalWav, paths.probe, paths.finalProbe]) {
    if (!fs.existsSync(f)) throw new UserError(`${f} がありません。npm run reference -- analyze --project=${json.id} を実行してください。`);
  }
  const srcProbe = readJson<ProbeJson>(paths.probe);
  const finProbe = readJson<ProbeJson>(paths.finalProbe);
  if (srcProbe.source.sha256 !== ref.source.sha256 || finProbe.source.sha256 !== ref.final.sha256) {
    throw new UserError("解析結果が今の input/reference/ の動画と合っていません。npm run reference -- analyze をやり直してください。");
  }

  const srcPcm = readPcmWav(paths.audioWav);
  const finPcm = readPcmWav(paths.finalWav);
  const M = new AudioMatcher(srcPcm.samples, finPcm.samples);

  // 1. text anchors
  let anchors: { srcT: number; outT: number }[] = [];
  if (fs.existsSync(paths.transcript) && fs.existsSync(paths.finalTranscript)) {
    anchors = textAnchors(readJson<Transcript>(paths.transcript), readJson<Transcript>(paths.finalTranscript), log);
    log(`文字起こしの対応: ${anchors.length}文字`);
  } else log("文字起こしが無いため、音声だけで探します（遅くなります）");

  // 2. windows
  const frameDb = M.finalFrameDb(0.05);
  const floor = [...frameDb].sort((a, b) => a - b)[Math.floor(frameDb.length * 0.1)] ?? -90;
  const voicedFrame = (i: number) => frameDb[i] >= floor + VOICED_ABOVE_FLOOR_DB;
  const windows: Window[] = [];
  let total = 0;
  let voiced = 0;
  let prev: Match | null = null;
  for (let t = 0; t + WINDOW <= M.finalSeconds + 1e-9; t += HOP) {
    total++;
    const f0 = Math.floor(t / 0.05);
    const f1 = Math.floor((t + WINDOW) / 0.05);
    let v = 0;
    for (let i = f0; i < f1; i++) if (voicedFrame(i)) v++;
    if (v / Math.max(1, f1 - f0) < VOICED_SHARE) continue;
    voiced++;
    const near = anchors.filter((a) => a.outT >= t - 0.5 && a.outT <= t + WINDOW + 0.5).map((a) => a.srcT - a.outT);
    const textCands = [...new Set(near.map((d) => Math.round(d * 10) / 10))].slice(0, 6);
    let best: Window | null = null;
    const tryCand = (center: number, via: Window["via"]) => {
      const m = M.local(t, WINDOW, center, 0.35);
      if (m && (!best || m.ncc > best.match.ncc)) best = { outStart: t, seconds: WINDOW, match: m, via };
    };
    if (prev) tryCand(prev.offset, "previous");
    if (!best || (best as Window).match.ncc < ACCEPT_NCC) for (const c of textCands) tryCand(c, "text");
    if (!best || (best as Window).match.ncc < ACCEPT_NCC) {
      const g = M.global(t, WINDOW);
      if (g && g.ncc >= ACCEPT_GLOBAL_NCC && (!best || g.ncc > (best as Window).match.ncc)) best = { outStart: t, seconds: WINDOW, match: g, via: "global" };
    }
    const b = best as Window | null;
    if (b && b.match.ncc >= (b.via === "global" ? ACCEPT_GLOBAL_NCC : ACCEPT_NCC)) {
      windows.push(b);
      prev = b.match;
    }
  }
  log(`音声の窓: ${total}（話し声 ${voiced}、対応が取れた ${windows.length}）`);
  if (!windows.length) throw new UserError("完成動画の音声が元動画のどこにも見つかりません（別の動画か、音声を差し替え・加工している可能性）。");

  const fps = finProbe.video?.fps ?? null;
  const finalSeconds = M.finalSeconds;
  const fd = M.finalFrameDb(QUALITY_FRAME);
  const qFloor = [...fd].sort((a, b) => a - b)[Math.floor(fd.length * 0.1)] ?? -90;

  /** Windows → kept segments (3), cut positions (4) and how much speech they reproduce (5). */
  const assemble = (ws: Window[]) => {
    // 3. group windows into segments (same offset); drop a lone window between two equal neighbours
    type Group = { offset: number; ws: Window[] };
    let groups: Group[] = [];
    for (const w of [...ws].sort((a, b) => a.outStart - b.outStart)) {
      const g = groups.at(-1);
      if (g && Math.abs(w.match.offset - g.offset) <= SAME_OFFSET) g.ws.push(w);
      else groups.push({ offset: w.match.offset, ws: [w] });
    }
    for (let changed = true; changed; ) {
      changed = false;
      for (let i = 1; i + 1 < groups.length; i++) {
        if (groups[i].ws.length === 1 && groups[i].ws[0].via !== "short" && Math.abs(groups[i - 1].offset - groups[i + 1].offset) <= SAME_OFFSET) {
          groups[i - 1].ws.push(...groups[i + 1].ws);
          groups.splice(i, 2);
          changed = true;
          break;
        }
      }
    }
    groups = groups.map((g) => ({ ...g, offset: median(g.ws.map((w) => w.match.offset)) }));
    const gainOf = (g: Group) => median(g.ws.map((w) => w.match.gain));

    // 4. cut positions between neighbouring groups: where the waveform error switches sides
    const cutsAt: { at: number; lo: number; hi: number }[] = [];
    for (let i = 0; i + 1 < groups.length; i++) {
      const A = groups[i];
      const B = groups[i + 1];
      const lastA = A.ws.at(-1)!;
      const lo = Math.min(lastA.outStart, B.ws[0].outStart);
      const hi = Math.max(B.ws[0].outStart + B.ws[0].seconds, lastA.outStart + lastA.seconds);
      const ea = M.frameErrors(lo, hi, A.offset, gainOf(A), BOUNDARY_FRAME);
      const eb = M.frameErrors(lo, hi, B.offset, gainOf(B), BOUNDARY_FRAME);
      const K = ea.err.length;
      const cap = (e: number, en: number) => (Number.isFinite(e) ? e : 4 * en + 1e-6);
      const pa = new Float64Array(K + 1);
      const pb = new Float64Array(K + 1);
      for (let k = 0; k < K; k++) {
        pa[k + 1] = pa[k] + cap(ea.err[k], ea.energy[k]);
        pb[k + 1] = pb[k] + cap(eb.err[k], eb.energy[k]);
      }
      let min = Infinity;
      let arg = 0;
      const cost = (c: number) => pa[c] + (pb[K] - pb[c]);
      for (let c = 0; c <= K; c++) if (cost(c) < min) [min, arg] = [cost(c), c];
      const tol = 0.05 * min + 1e-9;
      let cLo = arg;
      let cHi = arg;
      for (let c = 0; c <= K; c++) if (cost(c) <= min + tol) [cLo, cHi] = [Math.min(cLo, c), Math.max(cHi, c)];
      const mid = Math.round((cLo + cHi) / 2);
      const c = cost(mid) <= min + tol ? mid : arg;
      cutsAt.push({ at: lo + c * BOUNDARY_FRAME, lo: lo + cLo * BOUNDARY_FRAME, hi: lo + cHi * BOUNDARY_FRAME });
    }

    const segs: ReconSegment[] = groups.map((g, i) => {
      const outStart = i === 0 ? 0 : cutsAt[i - 1].at;
      const outEnd = i === groups.length - 1 ? finalSeconds : cutsAt[i].at;
      return {
        index: i,
        srcStart: round3(Math.max(0, outStart + g.offset)),
        srcEnd: round3(Math.min(M.sourceSeconds, outEnd + g.offset)),
        outStart: round3(outStart),
        outEnd: round3(outEnd),
        frames: fps ? Math.round((outEnd - outStart) * fps) : 0,
        offset: Math.round(g.offset * 1e5) / 1e5,
        ncc: round3(median(g.ws.map((w) => w.match.ncc))),
        gain: round3(gainOf(g)),
        windows: g.ws.length,
        boundaryUncertainty: { start: i === 0 ? 0 : round3(cutsAt[i - 1].hi - cutsAt[i - 1].lo), end: i === groups.length - 1 ? 0 : round3(cutsAt[i].hi - cutsAt[i].lo) },
      };
    });
    // Tidy up: cuts in order, drop slivers (a stray short window), close the gap a dropped sliver
    // leaves, and join neighbours that turned out to continue each other in the source.
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].outStart < segs[i - 1].outStart) segs[i].outStart = segs[i - 1].outStart;
      segs[i - 1].outEnd = Math.min(segs[i - 1].outEnd, segs[i].outStart);
    }
    const kept = segs.filter((s) => s.outEnd - s.outStart >= 0.04);
    const segments: ReconSegment[] = [];
    for (const s of kept) {
      const prev = segments.at(-1);
      if (prev && prev.outEnd < s.outStart) {
        prev.outEnd = s.outStart;
        prev.srcEnd = round3(Math.min(M.sourceSeconds, prev.outEnd + prev.offset));
      }
      if (prev && Math.abs(prev.offset - s.offset) <= SAME_OFFSET) {
        prev.outEnd = s.outEnd;
        prev.srcEnd = round3(Math.min(M.sourceSeconds, s.outEnd + prev.offset));
        prev.ncc = Math.max(prev.ncc, s.ncc);
        prev.windows += s.windows;
        prev.boundaryUncertainty = { start: prev.boundaryUncertainty.start, end: s.boundaryUncertainty.end };
      } else segments.push({ ...s, srcStart: round3(Math.max(0, s.outStart + s.offset)) });
    }
    segments.forEach((s, index) => {
      s.index = index;
      s.frames = fps ? Math.round((s.outEnd - s.outStart) * fps) : 0;
    });

    // 5. quality: how much of the final's speech the segments reproduce
    let speech = 0;
    let good = 0;
    const unmatched: Reconstruction["unmatched"] = [];
    let runStart: number | null = null;
    const closeRun = (end: number) => {
      if (runStart !== null && end - runStart >= 0.15) unmatched.push({ outStart: round3(runStart), outEnd: round3(end) });
      runStart = null;
    };
    for (const s of segments) {
      const { err, energy } = M.frameErrors(s.outStart, s.outEnd, s.offset, s.gain, QUALITY_FRAME);
      for (let k = 0; k < err.length; k++) {
        const t = s.outStart + k * QUALITY_FRAME;
        if (fd[Math.floor(t / QUALITY_FRAME)] < qFloor + VOICED_ABOVE_FLOOR_DB) {
          closeRun(t);
          continue;
        }
        speech++;
        if (err[k] <= 0.5 * energy[k]) {
          good++;
          closeRun(t);
        } else if (runStart === null) runStart = t;
      }
      closeRun(s.outEnd);
    }
    return { segments, unmatched, speech, good };
  };

  let built = assemble(windows);
  // 5b. speech that matches no segment is often a short kept piece (< 1 s) that no 1 s window
  // covered cleanly: search it with short windows in the source between the neighbouring segments.
  const extra: Window[] = [];
  for (const u of built.unmatched) {
    const i = built.segments.findIndex((s) => u.outStart >= s.outStart - 1e-3 && u.outStart < s.outEnd);
    const srcLo = Math.max(0, (built.segments[i - 1]?.srcEnd ?? 0) - 0.5);
    const srcHi = Math.min(M.sourceSeconds, (built.segments[i + 1]?.srcStart ?? M.sourceSeconds) + 0.5);
    const len = Math.min(SHORT_WINDOW, Math.max(0.2, u.outEnd - u.outStart));
    for (let t = Math.max(0, u.outStart - 0.05); t + len <= Math.min(finalSeconds, u.outEnd + 0.05 + len / 2); t += len / 2) {
      const center = (srcLo + srcHi) / 2 - (t + len / 2);
      const m = M.local(t, len, center, (srcHi - srcLo) / 2 + 0.2);
      if (m && m.ncc >= ACCEPT_SHORT_NCC) extra.push({ outStart: t, seconds: len, match: m, via: "short" });
    }
  }
  if (extra.length) {
    const before = built.unmatched.length;
    built = assemble([...windows, ...extra]);
    windows.push(...extra);
    log(`短い窓での再検索: ${extra.length}窓を追加（元動画に見つからない話し声 ${before}か所 → ${built.unmatched.length}か所）`);
  }
  const { segments, unmatched, speech, good } = built;

  // 5c. pauses left in the finished video, measured on its audio (word times are too loose for this)
  const pauses: Reconstruction["pauses"] = [];
  const cutTimes = segments.slice(1).map((s) => s.outStart);
  let ps: number | null = null;
  for (let k = 0; k <= fd.length; k++) {
    const quiet = k < fd.length && fd[k] < qFloor + PAUSE_ABOVE_FLOOR_DB;
    if (quiet && ps === null) ps = k;
    if (!quiet && ps !== null) {
      const a = ps * QUALITY_FRAME;
      const b = k * QUALITY_FRAME;
      if (b - a >= MIN_AUDIO_PAUSE) {
        const edge = ps === 0 ? "head" : k >= fd.length ? "tail" : undefined;
        pauses.push({ outStart: round3(a), outEnd: round3(b), seconds: round3(b - a), atCut: cutTimes.some((t) => t >= a - 0.02 && t <= b + 0.02), ...(edge ? { edge } : {}) });
      }
      ps = null;
    }
  }

  // 6. speed: offset at both ends of long segments (a time-stretch makes it drift)
  const checks: Reconstruction["speed"]["checks"] = [];
  for (const s of segments) {
    if (s.outEnd - s.outStart < SPEED_MIN_SEGMENT) continue;
    const a = M.refine(s.outStart + 0.2, 1, s.offset, 30);
    const b = M.refine(s.outEnd - 1.2, 1, s.offset, 30);
    if (a && b && a.ncc >= ACCEPT_NCC && b.ncc >= ACCEPT_NCC) checks.push({ segment: s.index, seconds: round3(s.outEnd - s.outStart - 1.4), driftMs: round3((b.offset - a.offset) * 1000) });
  }
  // offset = src − out grows when the final runs faster than the source (src advances more per output second)
  const ratios = checks.map((c) => 1 + c.driftMs / 1000 / c.seconds);
  const ratio = ratios.length ? Math.round(median(ratios) * 1e5) / 1e5 : null;
  const speedVerdict = ratio === null ? "unknown" : Math.abs(ratio - 1) <= 0.002 ? "unchanged" : "changed";

  // 7. removed source ranges = source not covered by any kept segment
  const bySrc = [...segments].sort((a, b) => a.srcStart - b.srcStart);
  const reordered = segments.some((s, i) => i > 0 && s.srcStart < segments[i - 1].srcStart);
  let overlaps = 0;
  const removed: Reconstruction["removed"] = [];
  let cursor = 0;
  for (const s of bySrc) {
    if (s.srcStart > cursor + 1e-3) removed.push({ srcStart: round3(cursor), srcEnd: s.srcStart, candidateIds: [], seconds: round3(s.srcStart - cursor), speechSeconds: 0 });
    else if (s.srcStart < cursor - 0.05) overlaps++;
    cursor = Math.max(cursor, s.srcEnd);
  }
  if (M.sourceSeconds - cursor > 1e-3) removed.push({ srcStart: round3(cursor), srcEnd: round3(M.sourceSeconds), candidateIds: [], seconds: round3(M.sourceSeconds - cursor), speechSeconds: 0 });

  const srcDb = M.finalFrameDb(0.05, "source");
  const srcFloor = [...srcDb].sort((a, b) => a - b)[Math.floor(srcDb.length * 0.1)] ?? -90;
  for (const x of removed) {
    let n = 0;
    for (let i = Math.ceil(x.srcStart / 0.05); i < Math.floor(x.srcEnd / 0.05); i++) if (srcDb[i] >= srcFloor + VOICED_ABOVE_FLOOR_DB) n++;
    x.speechSeconds = round3(n * 0.05);
  }
  const removedSeconds = round3(removed.reduce((n, r) => n + r.seconds, 0));
  const cuts = Math.max(0, segments.length - 1);
  return {
    version: 1,
    kind: "reconstruction",
    createdAt: new Date().toISOString(),
    source: { file: ref.source.file, sha256: ref.source.sha256, durationSeconds: round3(M.sourceSeconds), frames: srcProbe.video?.fps ? Math.round(M.sourceSeconds * srcProbe.video.fps) : 0 },
    final: { file: ref.final.file, sha256: ref.final.sha256, durationSeconds: round3(finalSeconds), fps },
    candidatesFingerprint: null,
    decisionsFingerprint: null,
    frameSnapped: false,
    outputDurationSeconds: round3(finalSeconds),
    outputFrames: fps ? Math.round(finalSeconds * fps) : 0,
    segments,
    removed,
    pauses,
    unmatched,
    speed: { verdict: speedVerdict, ratio, checks },
    quality: {
      windows: {
        total,
        voiced,
        matched: windows.length,
        byText: windows.filter((w) => w.via === "text").length,
        byPrevious: windows.filter((w) => w.via === "previous").length,
        byGlobal: windows.filter((w) => w.via === "global").length,
        byShort: windows.filter((w) => w.via === "short").length,
      },
      matchedSpeechRatio: speech ? round3(good / speech) : 0,
      speechSeconds: round3(speech * QUALITY_FRAME),
      meanNcc: round3(windows.reduce((n, w) => n + w.match.ncc, 0) / windows.length),
      reordered,
      overlaps,
      textAnchors: anchors.length,
    },
    stats: { cuts, cutsPerMinute: round3(cuts / (finalSeconds / 60)), removedSeconds, keptRatio: round3(finalSeconds / M.sourceSeconds) },
    inputs: { sourceTranscript: fileFingerprint(paths.transcript), finalTranscript: fileFingerprint(paths.finalTranscript) },
  };
}

export function writeReconstruction(project: Project, r: Reconstruction): void {
  writeJsonAtomic(project.paths.reconstruction, r);
}
