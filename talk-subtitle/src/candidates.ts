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
  /** claude: a content judgment added by Claude (candidates --add-claude), not by a rule. */
  proposedBy?: "claude";
  claudeType?: import("./steps.ts").ClaudeContentType;
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
/** Room kept on each side of a cut pause: half the target pause, or the old fixed keepPaddingSeconds if a project sets it. */
export function pausePadding(s: Settings["candidates"], sentence: boolean): number {
  if (typeof s.keepPaddingSeconds === "number") return s.keepPaddingSeconds;
  return (sentence ? s.sentencePauseSeconds : s.phrasePauseSeconds) / 2;
}

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
    const prev = words[g.i - 1];
    // Sentence boundary = end of a whisper segment or 。！？ (the same as the style observer's "segment").
    const sentence = !g.edge && (prev.seg !== words[g.i].seg || /[。！？!?]$/.test(prev.text.trim()));
    const minGap = g.edge || sentence ? s.minGapSeconds : s.phraseMinGapSeconds;
    if (length < minGap) continue;
    const pad = g.edge ? s.edgePaddingSeconds : pausePadding(s, sentence);
    const start = g.edge === "head" ? 0 : g.from + pad;
    const end = g.edge === "tail" ? duration : g.to - pad;
    if (end - start < 0.2 - 1e-9) continue;
    const lv = levelOf(pcm, start, end);
    const quiet = lv.rmsDb <= quietDb;
    const where = g.edge === "head" ? "冒頭" : g.edge === "tail" ? "末尾" : `${sentence ? "文の区切りの" : "文の途中の"}${length.toFixed(1)}秒の間`;
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
            reason: `${where}（音量 ${lv.rmsDb}dB＝話し声 ${speechDb}dB より十分小さい）。${g.edge ? "" : `間を約${round3(pad * 2)}秒にする（前後 ${round3(pad)}秒ずつ残す）`}`,
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
  // Speech-style words (なんか) are part of how the speaker talks: never a filler candidate.
  const styleWords = new Set(s.speechStyleWords);
  const weakWords = s.weakFillers.filter((w) => !styleWords.has(w));
  const weak = weakWords.length ? new RegExp(`${edge}(?:${alt(weakWords)})ー*(?:[、,…\\s]+|$)`, "g") : null;
  segs.forEach((seg, i) => {
    const ix = indexSegment(seg);
    const claimed: [number, number][] = [];
    for (const [re, isStrong] of [[strong, true], [weak, false]] as const) {
      if (!re) continue;
      for (const m of ix.text.matchAll(re)) {
        const from = m.index!;
        const to = from + m[0].length;
        if (!m[0].trim() || claimed.some(([a, b]) => from < b && a < to)) continue;
        claimed.push([from, to]);
        const t = spanTime(ix, from, to);
        const word = m[0].trim().replace(/[、,…]+$/, "");
        // Sentence head: the start of a whisper segment or right after 。！？ (every match is at least at a clause head).
        const head = from === 0 || /[。．.!?！？]\s*$/.test(ix.text.slice(0, from));
        out.push({
          kind: "filler",
          start: round3(t.start),
          end: round3(t.end),
          confidence: isStrong ? 0.8 : head ? 0.4 : 0.3,
          suggestion: isStrong ? "cut" : "review",
          reason: isStrong
            ? `フィラー「${word}」（強いフィラーは原則削る）`
            : head && /^(あの|まあ)/.test(word)
              ? `文頭の「${word}」（削ることが多いが、普通の言葉の場合もあるので確認）`
              : `「${word}」（普通の言葉の場合もあるので確認だけ）`,
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

/**
 * Repeated connectives at a phrase head: 「で。で、あと」「でで、だから」「このこの」. Whisper often puts
 * each 「で」 in its own segment, so this works on the word stream of the whole transcript, not per
 * segment. Whole words only (「でですね」 is で＋ですね, 「ところでできる」 is not a phrase head).
 * The earlier copies are proposed for removal and the last one is kept.
 */
const MAX_REPEAT_GAP = 2.0;
/**
 * Whisper sometimes invents a run of 「この」 over noise with probability ≈ 0: such words are never used,
 * and the run must average at least MIN_RUN_PROBABILITY. (Real short 「で」 often scores only 0.15–0.4.)
 */
const MIN_REPEAT_PROBABILITY = 0.05;
const MIN_RUN_PROBABILITY = 0.25;
function connectiveRepeatCandidates(segs: TranscriptSegment[], s: Settings["candidates"]): Draft[] {
  const out: Draft[] = [];
  const words = segs.flatMap((seg) => seg.words.map((w, k) => ({ ...w, seg: seg.id, first: k === 0 })));
  const bare = (t: string) => t.replace(/[\s、。，．,.!?！？…]/g, "");
  /** How many copies of a connective one word is (「で」 1, 「でで」 2), or null. */
  const copiesIn = (w: TranscriptSegment["words"][number]): { unit: string; n: number } | null => {
    if (w.probability !== null && w.probability < MIN_REPEAT_PROBABILITY) return null;
    const b = bare(w.text);
    for (const unit of s.repeatedConnectives) {
      if (b.length && b.length % unit.length === 0 && b === unit.repeat(b.length / unit.length)) return { unit, n: b.length / unit.length };
    }
    return null;
  };
  for (let i = 0; i < words.length; i++) {
    const a = copiesIn(words[i]);
    if (!a) continue;
    const prev = words[i - 1];
    const atHead = !prev || words[i].first || /[、。，．,.!?！？…]$/.test(prev.text.trim()) || words[i].start - prev.end >= 0.3;
    if (!atHead) continue;
    let j = i;
    let copies = a.n;
    while (j + 1 < words.length && copiesIn(words[j + 1])?.unit === a.unit && words[j + 1].start - words[j].end <= MAX_REPEAT_GAP) {
      j++;
      copies += copiesIn(words[j])!.n;
    }
    if (copies < 2) continue;
    const ps = words.slice(i, j + 1).map((w) => w.probability ?? 1);
    if (ps.reduce((x, y) => x + y, 0) / ps.length < MIN_RUN_PROBABILITY) {
      i = j;
      continue;
    }
    // Keep the last copy: inside a multi-copy word, split its time evenly.
    const last = words[j];
    const n = copiesIn(last)!.n;
    const keepFrom = last.start + ((last.end - last.start) * (n - 1)) / n;
    const start = round3(Math.max(0, words[i].start - 0.03));
    const end = round3(Math.max(words[i].start, keepFrom - 0.05));
    const textAt = (from: number, to: number) => words.slice(Math.max(0, from), Math.max(0, to)).map((w) => w.text).join("");
    if (end - start >= 0.1) {
      out.push({
        kind: "restart",
        start,
        end,
        confidence: 0.6,
        suggestion: "cut",
        reason: `「${a.unit}」を${copies}回続けて言っている。最後の1回だけ残す案`,
        text: textAt(i, j + 1),
        context: { before: textAt(i - 8, i), after: textAt(j, j + 8) },
        segmentIds: [...new Set(words.slice(i, j + 1).map((w) => w.seg))],
      });
    }
    i = j;
  }
  return out;
}

/** Characters (normalized) an abandoned opening attempt may have before the speaker starts again. */
const MAX_ABANDONED_ATTEMPT = 40;
/** Interjections that often start a take: skipped when looking for the opening line. */
const OPENING_LEAD = /^(?:ん|はい|えー|えっと|あー|どうも|さあ)+/;

/**
 * Opening retakes: the speaker starts the video several times (「はい、今日はですね、…」「はい、今日はですね…」).
 * The first words of the first take are searched again in the first openingWindowSeconds; when they come
 * back, everything from the first word up to the last restart is proposed for removal (the last take is kept).
 * If an earlier attempt went on for a while (it may say something the last take does not), it is review only.
 */
function openingRetakeCandidates(segs: TranscriptSegment[], s: Settings["candidates"]): Draft[] {
  const chars: { c: string; start: number; end: number; segStart: boolean }[] = [];
  window: for (const seg of segs) {
    let first = true;
    for (const w of seg.words) {
      if (chars.length && w.start - chars[0].start > s.openingWindowSeconds) break window;
      const norm = Array.from(normalizeForCompare(w.text));
      norm.forEach((c, k) => {
        const a = w.start + ((w.end - w.start) * k) / norm.length;
        chars.push({ c, start: a, end: w.start + ((w.end - w.start) * (k + 1)) / norm.length, segStart: first && k === 0 });
      });
      if (norm.length) first = false;
    }
  }
  const text = chars.map((x) => x.c).join("");
  const lead = text.match(OPENING_LEAD)?.[0].length ?? 0;
  const KEY = 6;
  const key = text.slice(lead, lead + KEY);
  if (key.length < KEY) return [];
  // A take starts at a sentence head, right after a lead-in (「はい」…), or after a pause — never mid-sentence
  // (a topic word the talk keeps repeating mid-sentence, 「元〇〇選手の…」, is not a restart of 「〇〇の…」).
  const leadBefore = new RegExp(`(?:${OPENING_LEAD.source.slice(1)})$`);
  const takeStart = (p: number) => {
    const m = text.slice(Math.max(0, p - 6), p).match(leadBefore);
    const q = m ? p - m[0].length : p;
    // (a lone 「ん」 before it is usually the end of a word like 「なん」, not a lead-in)
    return q === 0 || chars[q].segStart || chars[q].start - chars[q - 1].end >= 0.5 || (!!m && m[0] !== "ん");
  };
  const hits: number[] = [];
  for (let p = text.indexOf(key, lead); p >= 0; p = text.indexOf(key, p + 1)) if (hits.length === 0 || takeStart(p)) hits.push(p);
  // Restarts follow each other with short, abandoned attempts in between. The first attempt that goes
  // on for a while is the real start of the talk (the key is then just a word the talk repeats, e.g. a
  // topic name), so counting stops there.
  const takes = [hits[0]];
  for (const h of hits.slice(1)) {
    if (h - takes[takes.length - 1] > MAX_ABANDONED_ATTEMPT) break;
    takes.push(h);
  }
  if (takes.length < 2) return [];
  // The last take starts at its own lead-in (「はい」 etc.) if there is one right before it.
  let last = takes[takes.length - 1];
  const before = text.slice(Math.max(0, last - 6), last).match(leadBefore);
  if (before) last -= before[0].length;
  const attempts = takes.slice(0, -1).map((h, k) => text.slice(k === 0 ? 0 : h, takes[k + 1]));
  const longest = Math.max(...attempts.map((x) => x.length));
  const lastTake = text.slice(last, last + 30);
  const start = round3(Math.max(0, chars[0].start - 0.03));
  const end = round3(Math.max(chars[0].start, chars[last].start - 0.05));
  // A longer abandoned attempt may say something the last take does not: review only.
  const careful = longest > 20;
  return [{
    kind: "retake",
    start,
    end,
    confidence: careful ? 0.5 : 0.8,
    suggestion: careful ? "review" : "cut",
    reason: careful
      ? `冒頭の撮り直し（同じ書き出し「${key}」で${takes.length}回始めている）。前のテイクが長い（最長 ${longest}字）ので、最後のテイクで内容が足りているか比べて確認`
      : `冒頭の撮り直し（同じ書き出し「${key}」で${takes.length}回始めている）。最後のテイクを残す案（内容が最後のテイクで足りているかも確認）`,
    text: text.slice(0, last),
    context: { before: "", after: lastTake },
    segmentIds: segs.filter((g) => g.end > start && g.start < end).map((g) => g.id),
    detail: { pattern: "opening-retake", first: text.slice(0, last), second: lastTake, similarity: 1, keep: "second" },
  }];
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
  const restarts = restartCandidates(segs);
  const drafts = [
    ...pauseCandidates(transcript, pcm, speechDb, duration, settings),
    ...fillerCandidates(segs, settings),
    ...restarts,
    // (skip a repeat the per-segment restart rule already found)
    ...connectiveRepeatCandidates(segs, settings).filter(
      (d) => !restarts.some((r) => Math.min(r.end, d.end) - Math.max(r.start, d.start) >= 0.5 * Math.min(r.end - r.start, d.end - d.start)),
    ),
    ...openingRetakeCandidates(segs, settings),
    ...retakeCandidates(segs, settings),
    ...markerCandidates(segs, settings),
    ...unclearCandidates(segs, settings),
  ]
    .filter((d) => d.end > d.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const items = drafts.map((d, i) => ({ id: `c${i + 1}`, ...d, duration: round3(d.end - d.start) }));
  return { items, fingerprint: fingerprint(items), speechDb };
}
