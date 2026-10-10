// Round-2 cut candidates: restarts / retakes / corrections that the first
// detector (candidates.ts, per whisper segment) missed. Works on "phrases" of
// the whole transcript — words split at punctuation and at pauses — so a
// restart that crosses a whisper segment boundary is still found.
//
// Patterns:
//   prefix-restart   a phrase is (almost) the beginning of a phrase a few seconds later
//                    → the first was abandoned; keep the second (the complete one)
//   similar-repeat   two phrases/sentences within a few seconds are very similar → keep the later
//   correction       「〜、いや」「〜じゃなくて」「違う」… between two attempts → review
//
// Only proposes. Never changes existing candidates or decisions (see appendCutCandidates).

import type { CutCandidate } from "./candidates.ts";
import { levelOf, type Pcm } from "./audioLevel.ts";
import { normalizeForCompare, round3, similarity } from "./text.ts";
import type { Transcript, TranscriptWord } from "./transcript.ts";

export type RetakeDetail = {
  pattern: "prefix-restart" | "similar-repeat" | "correction";
  /** The attempt proposed for removal / the attempt kept. */
  first: string;
  second: string;
  similarity: number;
  keep: "second" | "first";
};

export type RetakeDraft = Omit<CutCandidate, "id" | "duration"> & { detail: RetakeDetail };

type Phrase = { text: string; norm: string; start: number; end: number; sentenceEnd: boolean; words: TranscriptWord[] };

const PAUSE = 0.35;
const LOOKAHEAD_SECONDS = 6;
const FILLER = /^(えー+と?|えっと|あの+ー*|その+ー*|まあ|うーん|んー|あー|え+)$/;
/** Interjections / backchannels: repeating them is not a restart. */
const INTERJECTION = /^(はい|うん|ね|ねえ|おー|へー|ほう|あ|お)+$/;
/** Mean word probability below this: likely invented by whisper on silence; never compared. */
const MIN_PROBABILITY = 0.5;
const REDUPLICATION = ["めちゃめちゃ", "どんどん", "いろいろ", "だんだん", "まあまあ", "なかなか", "そろそろ", "ますます", "ちょいちょい", "たまたま", "ぎりぎり", "ばらばら", "わざわざ", "ほとんど"];
const CORRECTION = /(^|、)(いや|いやいや|じゃなくて|じゃなく|違う|ちがう|違います|間違えた|間違えました|訂正|っていうか|というか)(、|$)/;

function phrases(t: Transcript): Phrase[] {
  const words = t.segments.flatMap((s) => s.words);
  const out: Phrase[] = [];
  let cur: TranscriptWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text).join("");
    out.push({ text, norm: normalizeForCompare(text), start: cur[0].start, end: cur[cur.length - 1].end, sentenceEnd: /[。！？!?]$/.test(text), words: cur });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length && w.start - cur[cur.length - 1].end >= PAUSE) flush();
    cur.push(w);
    if (/[、。，．,.!?！？]$/.test(w.text)) flush();
  }
  flush();
  return out.filter((p) => p.norm.length > 0);
}

const isFiller = (p: Phrase) => FILLER.test(p.norm);
const meanProbability = (p: Phrase) => {
  const ps = p.words.map((w) => w.probability).filter((x): x is number => x !== null);
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 1;
};
const usable = (p: Phrase) => !INTERJECTION.test(p.norm) && meanProbability(p) >= MIN_PROBABILITY;

export function detectRetakes(t: Transcript): RetakeDraft[] {
  const ps = phrases(t);
  const out: RetakeDraft[] = [];
  const ctx = (i: number, j: number) => ({
    before: ps.slice(Math.max(0, i - 2), i).map((p) => p.text).join(""),
    after: ps.slice(j, j + 3).map((p) => p.text).join(""),
  });

  for (let i = 0; i < ps.length; i++) {
    const a = ps[i];
    if (a.norm.length < 3 || isFiller(a) || !usable(a)) continue;

    // Correction marker right after this phrase: 「A、いや、B」
    const next = ps[i + 1];
    if (next && CORRECTION.test(next.norm) && next.norm.length <= 8) {
      const b = ps[i + 2];
      if (b && b.start - next.end < 3) {
        const sim = similarity(a.text, b.text);
        out.push({
          kind: "correction-marker",
          start: round3(a.start),
          end: round3(Math.max(next.end, b.start - 0.05)),
          confidence: Math.round(Math.min(0.9, 0.4 + sim / 2) * 100) / 100,
          suggestion: sim >= 0.35 ? "cut" : "review",
          reason: `「${a.text}」の後に訂正の言葉「${next.text}」があり、「${b.text}」と言い直している`,
          text: a.text + next.text,
          context: ctx(i, i + 2),
          segmentIds: [],
          detail: { pattern: "correction", first: a.text + next.text, second: b.text, similarity: round3(sim), keep: "second" },
        });
        continue;
      }
    }

    for (let j = i + 1; j < ps.length && j <= i + 4; j++) {
      const b = ps[j];
      if (b.start - a.end > LOOKAHEAD_SECONDS) break;
      if (!usable(b)) continue;
      // Anything between the two attempts must be filler / very short.
      const between = ps.slice(i + 1, j);
      if (between.some((p) => !isFiller(p) && p.norm.length > 4)) break;

      // Compare A with the same length of what follows from B.
      const following = ps.slice(j, j + 3).map((p) => p.norm).join("");
      const head = following.slice(0, a.norm.length + 2);
      const exactPrefix = following.startsWith(a.norm);
      const prefixSim = a.norm.length <= 4 ? (exactPrefix ? 1 : 0) : similarity(a.norm, head);
      const fullSim = similarity(a.text, b.text);

      // Reduplicated words and plain repeated short words that are normal speech.
      if (REDUPLICATION.some((r) => (a.norm + b.norm).startsWith(r))) continue;

      let pattern: RetakeDetail["pattern"] | null = null;
      let sim = 0;
      // Long phrases need a closer match: "A と戦って、A と絡みまくって" is a list, not a restart.
      const prefixNeeded = a.norm.length > 8 ? 0.75 : 0.6;
      if (prefixSim >= prefixNeeded && b.norm.length + 1 >= a.norm.length) {
        pattern = "prefix-restart";
        sim = prefixSim;
      } else if (a.norm.length >= 6 && b.norm.length >= 6 && fullSim >= 0.55 && !(/て、?$/.test(a.text) && /て、?$/.test(b.text))) {
        // (two te-form clauses in a row — 「A と戦って、A と絡みまくって」 — are a list, not a retake)
        pattern = "similar-repeat";
        sim = fullSim;
      }
      if (!pattern) continue;

      const incomplete = !a.sentenceEnd;
      const reason =
        pattern === "prefix-restart"
          ? exactPrefix
            ? `「${a.text}」と言いかけて、${(b.start - a.end).toFixed(1)}秒後に同じ言葉から言い直している${incomplete ? "（1回目は文が完結していない）" : ""}`
            : `「${a.text}」と、${(b.start - a.end).toFixed(1)}秒後の「${b.text}」の書き出しがよく似ている（途中で止めて言い直し）`
          : `${(b.start - a.end).toFixed(1)}秒以内に似た内容を言い直している（「${a.text}」→「${b.text}」）`;
      out.push({
        kind: pattern === "prefix-restart" && a.norm.length <= 6 ? "restart" : "retake",
        start: round3(Math.max(0, a.start - 0.03)),
        end: round3(Math.max(a.end, b.start - 0.05)),
        confidence: Math.round(Math.min(0.95, sim) * 100) / 100,
        suggestion: "cut",
        reason,
        text: [a, ...between].map((p) => p.text).join(""),
        context: ctx(i, j),
        segmentIds: [],
        detail: { pattern, first: [a, ...between].map((p) => p.text).join(""), second: ps.slice(j, j + 2).map((p) => p.text).join(""), similarity: round3(sim), keep: "second" },
      });
      break;
    }
  }
  return out;
}

/**
 * Pauses and speech hidden inside word timestamps. Whisper often stretches a
 * word over a pause or over a dropped false start (e.g. one character spanning
 * 7 s), so word gaps miss them. This scans the audio itself in 50 ms frames:
 *   - a quiet run ≥ minGapSeconds (brief blips ≤ 100 ms tolerated) → silence, cut proposed
 *   - inside an over-long word, voiced audio not explained by its characters ≥ 0.4 s → unclear, review
 */
export function detectHiddenPauses(
  t: Transcript,
  pcm: Pcm,
  speechDb: number,
  opts: { minGapSeconds: number; keepPaddingSeconds: number; quietMarginDb: number },
): RetakeDraftLike[] {
  const out: RetakeDraftLike[] = [];
  const quietDb = speechDb - opts.quietMarginDb;
  const words = t.segments.flatMap((s) => s.words);
  const FRAME = 0.05;
  const end = pcm.samples.length / pcm.sampleRate;
  const textAround = (s: number, e: number) => ({
    before: words.filter((w) => w.end <= s + 0.3).slice(-10).map((w) => w.text).join(""),
    after: words.filter((w) => w.start >= e - 0.3).slice(0, 10).map((w) => w.text).join(""),
  });

  // 1) quiet runs anywhere
  let runStart: number | null = null;
  let loud = 0;
  for (let x = 0; x < end; x += FRAME) {
    const q = levelOf(pcm, x, x + FRAME).rmsDb < quietDb;
    if (q) {
      if (runStart === null) runStart = x;
      loud = 0;
    } else if (runStart !== null) {
      loud += FRAME;
      if (loud > 0.1 + 1e-9) {
        const runEnd = x - loud + FRAME;
        if (runEnd - runStart >= opts.minGapSeconds) {
          const s = runStart + opts.keepPaddingSeconds;
          const e = runEnd - opts.keepPaddingSeconds;
          const inside = words.filter((w) => w.start < e && w.end > s);
          out.push({
            kind: "silence",
            start: round3(s),
            end: round3(e),
            confidence: 0.8,
            suggestion: "cut",
            reason: `${(runEnd - runStart).toFixed(1)}秒の無音（音量で検出。文字起こしでは「${inside.map((w) => w.text).join("") || "（なし）"}」の時刻に含まれていて、単語の隙間からは見つからなかった）。前後 ${opts.keepPaddingSeconds}秒は残す`,
            text: "",
            context: textAround(s, e),
            segmentIds: [],
          });
        }
        runStart = null;
        loud = 0;
      }
    }
  }

  // 2) voiced audio hidden in over-long words
  for (const w of words) {
    const chars = Array.from(w.text.replace(/[、。，．,.!?！？]/g, "")).length || 1;
    const d = w.end - w.start;
    if (d < 0.6 || d / chars < 0.4) continue;
    const spanEnd = w.end - chars * 0.15; // the word itself is usually at the end of its span
    let vStart: number | null = null;
    let best: [number, number] | null = null;
    for (let x = w.start; x < spanEnd; x += FRAME) {
      const voiced = levelOf(pcm, x, x + FRAME).rmsDb >= quietDb;
      if (voiced && vStart === null) vStart = x;
      if ((!voiced || x + FRAME >= spanEnd) && vStart !== null) {
        const e = voiced ? x + FRAME : x;
        if (!best || e - vStart > best[1] - best[0]) best = [vStart, e];
        vStart = null;
      }
    }
    if (best && best[1] - best[0] >= 0.4) {
      out.push({
        kind: "unclear",
        start: round3(best[0]),
        end: round3(best[1]),
        confidence: 0.4,
        suggestion: "review",
        reason: `「${w.text}」の時刻（${d.toFixed(1)}秒）の中に、文字になっていない声が ${(best[1] - best[0]).toFixed(1)}秒ある。Whisper が省いた言いかけ・言い直し・フィラーの可能性`,
        text: "",
        context: textAround(best[0], best[1]),
        segmentIds: [],
      });
    }
  }
  return out;
}

type RetakeDraftLike = Omit<CutCandidate, "id" | "duration"> & { detail?: RetakeDetail };
