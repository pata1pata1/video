// Step 4: cut candidates. Only proposes; nothing is cut here and every
// candidate starts undecided. Built from the raw transcript (not the
// glossary-corrected one) so glossary edits never renumber cut candidates.
// The rules are first guesses meant to be tuned on real footage.

import type { Settings } from "./config.ts";
import { levelOf, levelOfRanges, type Pcm } from "./audioLevel.ts";
import type { Transcript, TranscriptSegment } from "./transcript.ts";
import { fingerprint } from "./project.ts";
import { escapeRegExp, indexSegment, normalizeForCompare, round3, similarity, spanTime } from "./text.ts";

export type CutKind = "silence" | "filler" | "restart" | "retake" | "correction-marker" | "unclear";

export const CUT_KIND_LABELS: Record<CutKind, string> = {
  silence: "無音・間",
  filler: "フィラー",
  restart: "言い直し（語句の繰り返し）",
  retake: "撮り直し（文の言い直し）",
  "correction-marker": "訂正の言葉",
  unclear: "不明瞭",
};

export type CutCandidate = {
  id: string;
  kind: CutKind;
  start: number;
  end: number;
  duration: number;
  /** 0–1, how sure the rule is that this should go. */
  confidence: number;
  /** cut: proposed for removal. review: look at it, removal not proposed. */
  suggestion: "cut" | "review";
  reason: string;
  /** The words inside the range ("" for silence). */
  text: string;
  context: { before: string; after: string };
  segmentIds: number[];
  /** Detection round: absent = 1 (first run); 2+ = appended later (appendCutCandidates). */
  round?: number;
  /** Retake / restart details (round 2+): the two attempts, their similarity, which one is kept. */
  detail?: import("./retakes.ts").RetakeDetail;
};

export type CutCandidatesJson = {
  version: 1;
  createdAt: string;
  inputs: { sourceSha256: string; transcriptFingerprint: string; audioFingerprint: string; settingsFingerprint: string };
  /** Speaker level used to tell quiet pauses from audible ones (dBFS RMS over word spans). */
  speechDb: number;
  durationSeconds: number;
  /** Appended detection rounds (round 1 = the original items, never changed afterwards). */
  rounds?: { round: number; addedAt: string; detector: string; ids: string[]; previousFingerprint: string }[];
  fingerprint: string;
  items: CutCandidate[];
};

type Draft = Omit<CutCandidate, "id" | "duration">;

const segSpan = (seg: TranscriptSegment) =>
  seg.words.length > 0
    ? { start: seg.words[0].start, end: seg.words[seg.words.length - 1].end }
    : { start: seg.start, end: seg.end };

function neighbours(segs: TranscriptSegment[], i: number) {
  return { before: segs[i - 1]?.text ?? "", after: segs[i + 1]?.text ?? "" };
}

/**
 * Pauses = gaps between consecutive words (plus the head and tail), not
 * ffmpeg silencedetect: on real footage small noises (clicks, breathing)
 * break up "silence", so silencedetect misses most pauses. Each gap is then
 * classified by its loudness relative to the speaker's own level:
 *   quiet (rms <= speech - quietMarginDb)  → silence, cut proposed (keep padding)
 *   audible                                → unclear, review only (missed words? noise?)
 */
function pauseCandidates(transcript: Transcript, pcm: Pcm, speechDb: number, duration: number, s: Settings["candidates"]): Draft[] {
  const words = transcript.segments.flatMap((seg) => seg.words.map((w) => ({ ...w, seg: seg.id })));
  const out: Draft[] = [];
  const quietDb = speechDb - s.quietMarginDb;
  const gaps: { from: number; to: number; edge: "head" | "tail" | null; i: number }[] = [];
  if (words.length === 0) return out;
  gaps.push({ from: 0, to: words[0].start, edge: "head", i: 0 });
  for (let i = 1; i < words.length; i++) gaps.push({ from: words[i - 1].end, to: words[i].start, edge: null, i });
  gaps.push({ from: words[words.length - 1].end, to: duration, edge: "tail", i: words.length });

  for (const g of gaps) {
    const length = g.to - g.from;
    if (length < s.minGapSeconds) continue;
    const pad = g.edge ? s.edgePaddingSeconds : s.keepPaddingSeconds;
    const start = g.edge === "head" ? 0 : g.from + pad;
    const end = g.edge === "tail" ? duration : g.to - pad;
    if (end - start < 0.2) continue;
    const lv = levelOf(pcm, start, end);
    const quiet = lv.rmsDb <= quietDb;
    const where = g.edge === "head" ? "冒頭" : g.edge === "tail" ? "末尾" : `${length.toFixed(1)}秒の間`;
    const before = words.slice(Math.max(0, g.i - 10), g.i).map((w) => w.text).join("");
    const after = words.slice(g.i, g.i + 10).map((w) => w.text).join("");
    const segIds = [...new Set([words[g.i - 1]?.seg, words[g.i]?.seg].filter((x): x is number => x !== undefined))];
    out.push(
      quiet
        ? {
            kind: "silence",
            start: round3(start),
            end: round3(end),
            confidence: Math.min(0.95, 0.6 + 0.05 * length),
            suggestion: "cut",
            reason: `${where}（音量 ${lv.rmsDb}dB＝話し声 ${speechDb}dB より十分小さい）。${g.edge ? "" : `前後 ${pad}秒は残す`}`,
            text: "",
            context: { before, after },
            segmentIds: segIds,
          }
        : {
            kind: "unclear",
            start: round3(start),
            end: round3(end),
            confidence: 0.3,
            suggestion: "review",
            reason: `${where}に文字は無いが音がある（音量 ${lv.rmsDb}dB、最大 ${lv.peakDb}dB）。聞き落とした発言・小声・物音の可能性`,
            text: "",
            context: { before, after },
            segmentIds: segIds,
          },
    );
  }
  return out;
}

function fillerCandidates(segs: TranscriptSegment[], s: Settings["candidates"]): Draft[] {
  const out: Draft[] = [];
  const alt = (xs: string[]) => [...xs].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
  const edge = "(?<=^|[、。，．,.!?！？\\s])";
  const strong = new RegExp(`${edge}(?:${alt(s.strongFillers)})ー*[、,…\\s]*`, "g");
  const weak = new RegExp(`${edge}(?:${alt(s.weakFillers)})ー*(?:[、,…\\s]+|$)`, "g");
  segs.forEach((seg, i) => {
    const ix = indexSegment(seg);
    const claimed: [number, number][] = [];
    for (const [re, isStrong] of [[strong, true], [weak, false]] as const) {
      for (const m of ix.text.matchAll(re)) {
        const from = m.index!;
        const to = from + m[0].length;
        if (!m[0].trim() || claimed.some(([a, b]) => from < b && a < to)) continue;
        claimed.push([from, to]);
        const t = spanTime(ix, from, to);
        out.push({
          kind: "filler",
          start: round3(t.start),
          end: round3(t.end),
          confidence: isStrong ? 0.6 : 0.3,
          suggestion: isStrong ? "cut" : "review",
          reason: isStrong ? `フィラー「${m[0].trim()}」` : `「${m[0].trim()}」（普通の言葉の場合もあるので確認だけ）`,
          text: m[0],
          context: { before: ix.text.slice(Math.max(0, from - 15), from), after: ix.text.slice(to, to + 15) || neighbours(segs, i).after },
          segmentIds: [seg.id],
        });
      }
    }
  });
  return out;
}

function restartCandidates(segs: TranscriptSegment[]): Draft[] {
  const out: Draft[] = [];
  // 3+ characters repeated, or 2 characters repeated across a comma.
  const patterns = [/([^、。，．,.!?！？\s]{3,10}?)([、,…\s]*)\1/g, /([^、。，．,.!?！？\s]{2})([、,…\s]+)\1/g];
  segs.forEach((seg) => {
    const ix = indexSegment(seg);
    const claimed: [number, number][] = [];
    for (const re of patterns) {
      for (const m of ix.text.matchAll(re)) {
        const unit = m[1];
        if (new Set(Array.from(unit)).size === 1) continue; // "ーーー", "ははは"
        const from = m.index!;
        const to = from + unit.length + m[2].length; // the first occurrence + separator
        if (claimed.some(([a, b]) => from < b && a < to)) continue;
        claimed.push([from, to]);
        const t = spanTime(ix, from, to);
        out.push({
          kind: "restart",
          start: round3(t.start),
          end: round3(t.end),
          confidence: 0.5,
          suggestion: "cut",
          reason: `「${unit}」が繰り返されている。前の方を削る案`,
          text: ix.text.slice(from, to),
          context: { before: ix.text.slice(Math.max(0, from - 15), from), after: ix.text.slice(to, to + 20) },
          segmentIds: [seg.id],
        });
      }
    }
  });
  return out;
}

function retakeCandidates(segs: TranscriptSegment[], s: Settings["candidates"]): Draft[] {
  const out: Draft[] = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const a = segs[i];
    const na = normalizeForCompare(a.text);
    if (na.length < s.retakeMinChars) continue;
    // Compare with the next sentence, or the one after a very short one (e.g. "すみません").
    const targets = [i + 1];
    if (normalizeForCompare(segs[i + 1].text).length < s.retakeMinChars && segs[i + 2]) targets.push(i + 2);
    for (const j of targets) {
      const b = segs[j];
      const nb = normalizeForCompare(b.text);
      const sim = similarity(a.text, b.text);
      const abandoned = nb.length > na.length && nb.startsWith(na.slice(0, Math.max(4, Math.floor(na.length * 0.8))));
      if (sim < s.retakeSimilarity && !abandoned) continue;
      const span = segSpan(a);
      out.push({
        kind: "retake",
        start: round3(span.start),
        end: round3(Math.min(span.end, segSpan(segs[i + 1]).start)),
        confidence: Math.round(Math.max(sim, abandoned ? 0.7 : 0) * 100) / 100,
        suggestion: "cut",
        reason: abandoned
          ? `次の文「${b.text.slice(0, 20)}…」の言いかけ。後のテイクを残す案`
          : `次の文とよく似ている（類似度 ${sim.toFixed(2)}）。後のテイクを残す案`,
        text: a.text,
        context: { before: segs[i - 1]?.text ?? "", after: b.text },
        segmentIds: [a.id],
      });
      break;
    }
  }
  return out;
}

function markerCandidates(segs: TranscriptSegment[], s: Settings["candidates"]): Draft[] {
  const out: Draft[] = [];
  segs.forEach((seg, i) => {
    const hit = s.correctionMarkers.find((m) => seg.text.includes(m));
    if (!hit) return;
    const span = segSpan(seg);
    out.push({
      kind: "correction-marker",
      start: round3(span.start),
      end: round3(span.end),
      confidence: 0.3,
      suggestion: "review",
      reason: `「${hit}」を含む。この前後で言い直している可能性`,
      text: seg.text,
      context: neighbours(segs, i),
      segmentIds: [seg.id],
    });
  });
  return out;
}

function unclearCandidates(segs: TranscriptSegment[], s: Settings["candidates"]): Draft[] {
  const out: Draft[] = [];
  segs.forEach((seg, i) => {
    const ps = seg.words.map((w) => w.probability).filter((p): p is number => p !== null);
    if (ps.length === 0) return;
    const mean = ps.reduce((x, y) => x + y, 0) / ps.length;
    if (mean >= s.unclearProbability) return;
    const span = segSpan(seg);
    out.push({
      kind: "unclear",
      start: round3(span.start),
      end: round3(span.end),
      confidence: 0.2,
      suggestion: "review",
      reason: `文字起こしの確からしさが低い（平均 ${mean.toFixed(2)}）。聞き取り・誤認識の確認`,
      text: seg.text,
      context: neighbours(segs, i),
      segmentIds: [seg.id],
    });
  });

  return out;
}

export function buildCutCandidates(
  transcript: Transcript,
  pcm: Pcm,
  duration: number,
  settings: Settings["candidates"],
): { items: CutCandidate[]; fingerprint: string; speechDb: number } {
  const segs = transcript.segments;
  // The speaker's own level: RMS over every word span.
  const speechDb = levelOfRanges(pcm, segs.flatMap((seg) => seg.words));
  const drafts = [
    ...pauseCandidates(transcript, pcm, speechDb, duration, settings),
    ...fillerCandidates(segs, settings),
    ...restartCandidates(segs),
    ...retakeCandidates(segs, settings),
    ...markerCandidates(segs, settings),
    ...unclearCandidates(segs, settings),
  ]
    .filter((d) => d.end > d.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const items = drafts.map((d, i) => ({ id: `c${i + 1}`, ...d, duration: round3(d.end - d.start) }));
  return { items, fingerprint: fingerprint(items), speechDb };
}
