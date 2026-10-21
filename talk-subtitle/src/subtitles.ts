// Phase 3: subtitle draft for intermediate/cut.mp4.
//
//   transcript.corrected.json (glossary fixes, word times on the source)
//   + timemap.json            (source time → cut.mp4 time; words inside cut ranges drop out)
//   + quotes (input/quotes.json + alignment) — read-aloud posts use the post text
//   → intermediate/subtitles.draft.json (cues in cut.mp4 time, with review flags)
//
// The user's changes live in input/subtitles.json (edits keyed by cue id, plus the
// cue's draft text so they survive a regenerated draft). Nothing is burned in here.

import fs from "node:fs";
import path from "node:path";
import type { ProbeJson } from "./analyze.ts";
import type { CutCandidatesJson } from "./candidates.ts";
import { UserError } from "./cli.ts";
import { DEFAULT_SETTINGS } from "./config.ts";
import { levelOf, type Pcm } from "./audioLevel.ts";
import { approvedCuts, type CutReport, type Timemap } from "./cut.ts";
import { loadDecisions, type By } from "./decisions.ts";
import { SUBTITLE_PRESETS_DIR, type ProjectPaths } from "./paths.ts";
import { fingerprint, readJson, readJsonIfExists, writeJsonAtomic } from "./project.ts";
import { alignQuotes, loadQuotes, type QuoteMatch } from "./quotes.ts";
import { round3 } from "./text.ts";
import type { CorrectedTranscript } from "./terms.ts";
import type { Transcript } from "./transcript.ts";

// ---------- preset ----------

export type SubtitlePreset = {
  name: string;
  font: { family: string; weight: number; sizeRatio: number; lineHeight: number; letterSpacingEm: number };
  color: string;
  stroke: { enabled: boolean; color: string; widthRatio: number; opacity: number };
  background: { enabled: boolean; color: string; opacity: number; paddingEm: [number, number]; radiusEm: number };
  shadow: { enabled: boolean; color: string; blurEm: number; opacity: number };
  position: { anchor: "bottom" | "top"; marginRatio: number; maxWidthRatio: number; align: "center" | "left" };
  layout: {
    maxLines: number;
    maxCharsPerLine: { landscape: number };
    minDisplaySeconds: number;
    maxDisplaySeconds: number;
    gapMergeSeconds: number;
    /** Optional: "space" turns a 、 inside a line into a full-width space (default), "keep" leaves it. */
    commaStyle?: "space" | "keep";
    /**
     * Optional: how the burned-in lines are laid out.
     * "chars" (default): the draft's line breaks (maxCharsPerLine).
     * "fit-width": one line whenever it fits position.maxWidthRatio at the font size; two lines
     * only when it does not (see layoutCues). The approved text itself is not changed.
     */
    lineBreak?: "chars" | "fit-width";
  };
};

/** _shared/subtitle-presets/default.json, overridden key by key by input/subtitle-style.json. */
export function loadPreset(paths: ProjectPaths): SubtitlePreset {
  const base = readJson<SubtitlePreset>(path.join(SUBTITLE_PRESETS_DIR, "default.json"));
  const over = readJsonIfExists<Partial<SubtitlePreset>>(path.join(paths.input, "subtitle-style.json"));
  return over ? mergePreset(base, over) : base;
}

/** Overrides a preset one level deep (font, stroke, position… are merged key by key). */
export function mergePreset(base: SubtitlePreset, over: Partial<SubtitlePreset>): SubtitlePreset {
  const merged: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    merged[k] = v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object" ? { ...b, ...v } : v;
  }
  return merged as SubtitlePreset;
}

// ---------- types ----------

export type CueFlag = {
  kind: "quote" | "quote-review" | "term" | "low-confidence" | "partly-cut" | "fast" | "split";
  /** true: a person should look at it before approval. */
  review: boolean;
  note: string;
};

export type Cue = {
  id: string;
  /** cut.mp4 time (s). */
  start: number;
  end: number;
  /** Source time (s) of the first / last word. */
  srcStart: number;
  srcEnd: number;
  /** Display text; "\n" separates lines. */
  text: string;
  /** Transcript text (glossary-corrected) of the words in the cue, for comparison. */
  heard: string;
  flags: CueFlag[];
  review: boolean;
  /** Filler words left out of the subtitle (still in the audio). */
  fillersRemoved?: string[];
};

export type SubtitleDraft = {
  version: 1;
  createdAt: string;
  /** Hash of the cues (ids, times, text): edits are made against this. */
  fingerprint: string;
  inputs: {
    sourceSha256: string;
    timemapDecisionsFingerprint: string;
    cutOutputSeconds: number;
    transcriptCorrectedAt: string | null;
    quotesFingerprint: string;
    preset: string;
    orientation: "landscape" | "portrait" | "square";
    maxCharsPerLine: number;
    maxLines: number;
  };
  cues: Cue[];
  /** Words not in any cue and why (cut range / filler). */
  dropped: { srcStart: number; srcEnd: number; text: string; reason: "cut" | "filler" }[];
};

export type SubtitleEdit = {
  /** Draft text this edit was made against (carry-over key when the draft is rebuilt). */
  origText: string;
  text?: string;
  deleted?: true;
  /** Reviewed and fine as is. */
  ok?: true;
  by: By;
  at: string;
};

export type SubtitlesJson = {
  version: 1;
  project: string;
  draftFingerprint: string | null;
  edits: Record<string, SubtitleEdit>;
  approved: null | { at: string; by: By; draftFingerprint: string };
};

// ---------- checks ----------

/** The timemap must come from the current approvals, and cut.mp4 (final) from that timemap. */
export function checkCutInputs(paths: ProjectPaths, sourceSha256: string): { timemap: Timemap; report: CutReport } {
  const timemap = readJsonIfExists<Timemap>(paths.timemap);
  if (!timemap) throw new UserError("timemap.json がありません。先に npm run cut -- --final を実行してください。");
  const cuts = readJson<CutCandidatesJson>(paths.cutCandidates);
  const decisions = loadDecisions(paths);
  if (fingerprint(approvedCuts(cuts, decisions)) !== timemap.decisionsFingerprint) {
    throw new UserError("timemap.json が今のカット承認と合っていません（承認を変えた後にカットを作り直していない）。npm run cut を実行し直してください。");
  }
  if (timemap.source.sha256 !== sourceSha256) throw new UserError("timemap.json が今の元動画から作られていません。");
  if (!fs.existsSync(paths.cutFinal)) throw new UserError("intermediate/cut.mp4 がありません。npm run cut -- --final を実行してください。");
  const report = readJsonIfExists<CutReport>(paths.cutFinal.replace(/\.mp4$/, ".report.json"));
  if (!report || report.quality !== "final") throw new UserError("cut.report.json（本番の確認結果）がありません。");
  if (report.actual.frames !== timemap.outputFrames || Math.abs(report.plannedSeconds - timemap.outputDurationSeconds) > 0.001) {
    throw new UserError(
      `intermediate/cut.mp4 が今の timemap.json と合っていません（cut.mp4 ${report.actual.frames} フレーム／timemap ${timemap.outputFrames} フレーム）。npm run cut -- --final で作り直してください。`,
    );
  }
  if (report.problems.length) throw new UserError("cut.mp4 の確認で問題が記録されています。");
  return { timemap, report };
}

// ---------- building ----------

type Unit = {
  text: string;
  srcStart: number;
  srcEnd: number;
  outStart: number;
  outEnd: number;
  probability: number | null;
  /** Kept share of the word's source span (1 = untouched by cuts). */
  kept: number;
  quote?: QuoteMatch;
  /** Words of a quote group that were cut away. */
  quoteCutWords?: string[];
  termFixes?: string[];
  /** Piece of a long unit split at its punctuation. */
  split?: true;
  /** The word before it (same sentence) was cut away: the subtitle may start mid-phrase. */
  afterCut?: string;
  /** Words right after it (same sentence) were cut away. */
  beforeCut?: string;
  /** Loudness (dB) of the cut-away part of a partly cut word; null when not measured. */
  cutLevelDb?: number | null;
  /** Whisper gave this word an over-long time span; its time was narrowed to the kept part next to the speech. */
  narrowed?: true;
};

const END_PUNCT = /[。！？!?]$/;
const TRAIL_PUNCT = /[、。，．,.！？!?…]+$/;
const strip = (s: string) => s.replace(/[\s、。，．,.!?！？…]/g, "");

/** Display width: half-width characters count as half. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ -~｡-ﾟ]/.test(ch) ? 0.5 : 1;
  return w;
}

const PARTICLE_AFTER = /(は|が|を|で|と|も|へ|の|から|まで|けど|ので|より|ば)$/;

/** One cue's text as display lines (≤ maxLines, each ≤ maxChars where possible). */
export function wrapLines(raw: string, maxChars: number, maxLines: number, commaStyle: "space" | "keep", boundaries?: Set<number>): { lines: string[]; overflow: boolean } {
  let text = raw.replace(/[、。，．,.]+$/, "").trim();
  let offset = 0; // characters of raw already moved to earlier lines
  const lines: string[] = [];
  while (textWidth(text) > maxChars && lines.length < maxLines - 1) {
    const chars = Array.from(text);
    let best = -1;
    let bestScore = Infinity;
    let acc = 0;
    const target = Math.min(maxChars, textWidth(text) / Math.ceil(textWidth(text) / maxChars));
    for (let i = 0; i < chars.length - 1; i++) {
      acc += textWidth(chars[i]);
      if (acc > maxChars) break;
      const head = chars.slice(0, i + 1).join("");
      const restW = textWidth(text) - acc;
      const a = chars[i];
      const b = chars[i + 1];
      const HIRA = /[ぁ-ゖ]/;
      const WORDY = /[ァ-ヶー一-龯々A-Za-z0-9]/;
      // hiragana → kanji/katakana is usually the start of a new phrase (…ながら|散歩), also inside a post line.
      // …but not after okurigana inside a compound (読み|込む, 取り|出す): kanji + one kana + kanji.
      const phraseStart = HIRA.test(a) && WORDY.test(b) && !(i > 0 && WORDY.test(chars[i - 1]));
      const atWord = !boundaries || boundaries.has(offset + i + 1) || phraseStart;
      const kind = /[、，,！？!?。]/.test(a) ? 0
        : PARTICLE_AFTER.test(head) && !/[ゃゅょっー]/.test(b) ? 1
        : !atWord ? 7
        : phraseStart ? 1
        : WORDY.test(a) && HIRA.test(b) ? 5 // 戻|って, 関わ|りたい: okurigana split
        : WORDY.test(a) && WORDY.test(b) ? 4
        : 3;
      // Prefer punctuation, then particles; prefer balanced lines; avoid leaving a too-long rest.
      const score = kind * 3 + Math.abs(acc - target) / 2 + (restW > maxChars * (maxLines - lines.length - 1) ? 50 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) best = Math.max(0, Math.floor(maxChars) - 1);
    lines.push(chars.slice(0, best + 1).join("").replace(/[、，,]$/, ""));
    offset += best + 1;
    text = chars.slice(best + 1).join("");
  }
  lines.push(text);
  const out = lines.map((l) => (commaStyle === "space" ? l.replace(/[、，,](?=.)/g, "　") : l));
  return { lines: out, overflow: out.length > maxLines || out.some((l) => textWidth(l) > maxChars) };
}

/** Cut-away words worth a look: not fillers, lone kana or punctuation. */
const FILLERS = new Set([...DEFAULT_SETTINGS.candidates.strongFillers, ...DEFAULT_SETTINGS.candidates.weakFillers]);
const meaningful = (t: string) => {
  const x = strip(t);
  return !!x && !FILLERS.has(x) && !/^[ぁ-ゖー]$/.test(x) && !/^ー+$/.test(x);
};
/** Interjections whose low whisper probability says nothing about the subtitle. */
const INTERJECTIONS = new Set(["はい", "ね", "ねえ", "まあ", "で", "あの", "その", "うん", "なんか", "もう", "ま"]);

function wordsWithOutTimes(corrected: CorrectedTranscript, timemap: Timemap, dropped: SubtitleDraft["dropped"], pcm: Pcm | null): Unit[] {
  const units: Unit[] = [];
  let lastSeg: number | null = null;
  for (const seg of corrected.segments) {
    const words = seg.words.length ? seg.words : [{ text: seg.text, start: seg.start, end: seg.end, probability: null }];
    const fixes = seg.corrections ?? [];
    let prevDropped: string | null = null;
    lastSeg = seg.id;
    for (const w of words) {
      let a = w.start;
      let b = Math.max(w.end, w.start + 0.001);
      const overlap = (x: number, y: number) =>
        timemap.segments.map((s) => ({ s, from: Math.max(x, s.srcStart), to: Math.min(y, s.srcEnd) })).filter((p) => p.to > p.from);
      let parts = overlap(a, b);
      let narrowed = false;
      // Whisper sometimes stretches one word over a pause (「元」 over 7.7 s). The voice is then at
      // the end (or start) of the span: judge the word by the kept part next to the following word.
      // (Not for glossary-merged words — probability null — whose long span is real.)
      if (b - a > 1.2 && parts.length && w.probability !== null) {
        const tail = overlap(b - 0.4, b);
        const head = overlap(a, a + 0.4);
        if (tail.length) {
          a = Math.max(tail[0].from, b - 0.6);
          narrowed = true;
        } else if (head.length) {
          b = Math.min(head[head.length - 1].to, a + 0.6);
          narrowed = true;
        }
        parts = overlap(a, b);
      }
      const keptSec = parts.reduce((n, p) => n + p.to - p.from, 0);
      const kept = keptSec / (b - a);
      if (!parts.length || kept < 0.5) {
        dropped.push({ srcStart: w.start, srcEnd: w.end, text: w.text, reason: "cut" });
        if (meaningful(w.text)) prevDropped = (prevDropped ?? "") + w.text;
        const last = units[units.length - 1];
        if (last && lastSeg === seg.id && !TRAIL_PUNCT.test(last.text) && meaningful(w.text)) last.beforeCut = (last.beforeCut ?? "") + w.text;
        continue;
      }
      const afterCut = prevDropped;
      prevDropped = null;
      const first = parts[0];
      const last = parts[parts.length - 1];
      // Loudness of the removed part: quiet means the cut only took whisper's padding around the word.
      let cutLevelDb: number | null = null;
      if (kept < 0.95 && pcm) {
        const gaps: [number, number][] = [];
        let t = a;
        for (const p of parts) {
          if (p.from > t) gaps.push([t, p.from]);
          t = p.to;
        }
        if (t < b) gaps.push([t, b]);
        const lv = gaps.filter(([x, y]) => y - x >= 0.02).map(([x, y]) => levelOf(pcm, x, y).rmsDb);
        cutLevelDb = lv.length ? Math.max(...lv) : null;
      }
      units.push({
        text: w.text,
        srcStart: a,
        srcEnd: b,
        outStart: first.s.outStart + (first.from - first.s.srcStart),
        outEnd: last.s.outStart + (last.to - last.s.srcStart),
        probability: w.probability ?? null,
        kept,
        termFixes: w.probability === null ? fixes.filter((f) => w.text.includes(f.to)).map((f) => `${f.from}→${f.to}`) : undefined,
        ...(afterCut && !TRAIL_PUNCT.test(afterCut) ? { afterCut } : {}),
        ...(narrowed ? { narrowed: true as const } : {}),
        ...(kept < 0.95 ? { cutLevelDb } : {}),
      });
    }
  }
  return units;
}

/** Replaces the words of each decided quote span with the post text (one unit per post line). */
function applyQuotes(units: Unit[], allWords: { text: string; srcStart: number; srcEnd: number }[], matches: QuoteMatch[]): Unit[] {
  let out = units;
  for (const m of matches) {
    if (m.coveredBy || m.state === "pending") continue;
    const inSpan = (a: number, b: number) => (a + b) / 2 >= m.start - 0.01 && (a + b) / 2 <= m.end + 0.01;
    const idx = out.map((u, i) => (inSpan(u.srcStart, u.srcEnd) && !u.quote ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const first = idx[0];
    const last = idx[idx.length - 1];
    const members = out.slice(first, last + 1);
    const lastText = members[members.length - 1].text;
    // Keep the spoken sentence end (、 / 。) when the post line has none of its own.
    const trail = /[、。！？!?]$/.test(m.line) ? "" : (lastText.match(TRAIL_PUNCT)?.[0] ?? "");
    const cutWords = allWords.filter((w) => inSpan(w.srcStart, w.srcEnd) && !members.some((u) => u.srcStart === w.srcStart && u.srcEnd === w.srcEnd)).map((w) => w.text);
    const group: Unit = {
      text: m.line + trail,
      srcStart: members[0].srcStart,
      srcEnd: members[members.length - 1].srcEnd,
      outStart: members[0].outStart,
      outEnd: members[members.length - 1].outEnd,
      probability: null,
      kept: Math.min(...members.map((u) => u.kept)),
      quote: m,
      quoteCutWords: cutWords.length ? cutWords : undefined,
    };
    out = [...out.slice(0, first), group, ...out.slice(last + 1)];
  }
  return out;
}

/** Splits a unit longer than one cue at its own punctuation (time shared by character count). */
function splitLong(u: Unit, maxCueWidth: number): Unit[] {
  if (textWidth(u.text) <= maxCueWidth) return [u];
  const pieces: string[] = [];
  let cur = "";
  for (const part of u.text.split(/(?<=[、。！？!?])/)) {
    if (cur && textWidth(cur + part) > maxCueWidth) {
      pieces.push(cur);
      cur = "";
    }
    cur += part;
  }
  if (cur) pieces.push(cur);
  const total = pieces.reduce((n, p) => n + textWidth(p), 0);
  let t = u.outStart;
  return pieces.map((p) => {
    const len = ((u.outEnd - u.outStart) * textWidth(p)) / total;
    const piece: Unit = { ...u, text: p, outStart: t, outEnd: t + len, split: true };
    t += len;
    return piece;
  });
}

export function buildDraft(input: {
  paths: ProjectPaths;
  sourceSha256: string;
  corrected: CorrectedTranscript;
  raw: Transcript;
  timemap: Timemap;
  probe: ProbeJson;
  preset: SubtitlePreset;
  /** 16 kHz source audio and the speaker's level: partly cut words are flagged only when the cut part had voice. */
  pcm: Pcm | null;
  speechDb: number | null;
  /** Glossary spellings: whisper's low token probability inside a confirmed name is not a reason to review. */
  glossarySurfaces: string[];
}): SubtitleDraft {
  const { corrected, raw, timemap, preset } = input;
  const orientation = input.probe.video?.orientation ?? "landscape";
  const maxChars = preset.layout.maxCharsPerLine.landscape;
  const maxLines = preset.layout.maxLines;
  const commaStyle = preset.layout.commaStyle ?? "space";
  const strongFillers = new Set(DEFAULT_SETTINGS.candidates.strongFillers);

  const quotes = loadQuotes(input.paths.quotes);
  const alignment = alignQuotes(corrected, raw, quotes, timemap);

  const dropped: SubtitleDraft["dropped"] = [];
  const allWords = corrected.segments.flatMap((s) => s.words.map((w) => ({ text: w.text, srcStart: w.start, srcEnd: Math.max(w.end, w.start + 0.001) })));
  let units = wordsWithOutTimes(corrected, timemap, dropped, input.pcm);
  units = applyQuotes(units, allWords, alignment.matches);

  // Strong fillers (えー・あのー…) stay in the audio but not in the subtitle.
  const fillerAt: { out: number; text: string }[] = [];
  units = units.filter((u) => {
    if (u.quote || !strongFillers.has(strip(u.text))) return true;
    dropped.push({ srcStart: u.srcStart, srcEnd: u.srcEnd, text: u.text, reason: "filler" });
    fillerAt.push({ out: u.outStart, text: strip(u.text) });
    return false;
  });
  units = units.flatMap((u) => splitLong(u, maxChars * maxLines));

  // ---- group units into cues ----
  const groups: Unit[][] = [];
  let cur: Unit[] = [];
  const width = (us: Unit[]) => textWidth(us.map((u) => u.text).join("").replace(/[、。，．,.]+$/, ""));
  const flush = () => {
    if (cur.length) groups.push(cur);
    cur = [];
  };
  for (const u of units) {
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const pause = u.outStart - prev.outEnd > 0.6;
      const sentenceEnd = END_PUNCT.test(prev.text);
      const quoteEdge = !!u.quote !== !!prev.quote || (u.quote && prev.quote && u.quote !== prev.quote);
      // A little slack below the hard limit so that the two lines can break at a natural point.
      const tooLong = width([...cur, u]) > maxChars * maxLines * 0.9;
      const tooSlow = u.outEnd - cur[0].outStart > preset.layout.maxDisplaySeconds;
      // A full line that ends at a comma: start the next cue there (one-line cues read faster).
      const softBreak = width(cur) >= maxChars * 0.6 && /[、，,]$/.test(prev.text) && width([...cur, u]) > maxChars;
      if (pause || sentenceEnd || quoteEdge || softBreak) flush();
      else if (tooLong || tooSlow) {
        // Never split inside a word: break after the last comma, else (too long only) after a particle.
        const at = (re: RegExp) => cur.map((x, k) => k < cur.length - 1 && re.test(x.text)).lastIndexOf(true);
        let k = at(/[、，,]$/);
        if (k < 0 && tooLong) k = at(PARTICLE_AFTER);
        if (/[、，,]$/.test(prev.text) || (k < 0 && tooLong && PARTICLE_AFTER.test(prev.text))) flush();
        else if (k >= 0) {
          const tail = cur.slice(k + 1);
          cur = cur.slice(0, k + 1);
          flush();
          cur = tail;
        } else if (tooLong) flush();
      }
    }
    cur.push(u);
  }
  flush();

  // ---- cues ----
  const cues: Cue[] = groups.map((g, i) => {
    const joined = g.map((u) => u.text).join("");
    const boundaries = new Set<number>();
    let pos = 0;
    for (const u of g) boundaries.add((pos += Array.from(u.text).length));
    const { lines, overflow } = wrapLines(joined, maxChars, maxLines, commaStyle, boundaries);
    const flags: CueFlag[] = [];
    for (const u of g) {
      if (u.quote) {
        const q = u.quote;
        const ref = `${q.author} の投稿 ${q.lineIndex + 1}行目`;
        if (q.state === "flagged") flags.push({ kind: "quote-review", review: true, note: `元投稿の表記を採用・要確認（${ref}）: ${q.decision?.flag ?? ""}` });
        else if (q.status !== "same") flags.push({ kind: "quote", review: false, note: `元投稿の表記（${ref}）。文字起こし「${q.heard}」` });
        else flags.push({ kind: "quote", review: false, note: `元投稿と一致（${ref}）` });
        if (u.quoteCutWords) flags.push({ kind: "partly-cut", review: true, note: `投稿行の一部がカット範囲にある（カットされた語: ${u.quoteCutWords.join("")}）。字幕は投稿の全文` });
      }
    }
    const fixes = [...new Set(g.flatMap((u) => u.termFixes ?? []))];
    if (fixes.length) flags.push({ kind: "term", review: false, note: `固有名詞を補正: ${fixes.join("、")}` });
    for (const u of g) if (u.beforeCut && !u.quote) flags.push({ kind: "partly-cut", review: true, note: `「${u.text}」の直後の「${u.beforeCut}」はカット済み。残った部分とのつながりを確認` });
    for (const u of g) if (u.afterCut) flags.push({ kind: "partly-cut", review: true, note: `直前の「${u.afterCut}」はカット済み。「${u.text}」から始まるつながりを確認` });
    if (g.some((u) => u.narrowed)) flags.push({ kind: "partly-cut", review: false, note: `文字起こしの時刻が長すぎる語の時刻を、残した区間に合わせて詰めた: ${g.filter((u) => u.narrowed).map((u) => `「${u.text}」`).join(" ")}` });
    const inName = (u: Unit) => input.glossarySurfaces.some((sf) => joined.includes(sf) && sf.includes(strip(u.text)));
    const low = g.filter((u) => !u.quote && u.probability !== null && u.probability < 0.3 && strip(u.text) && !INTERJECTIONS.has(strip(u.text)) && !inName(u));
    if (low.length) flags.push({ kind: "low-confidence", review: true, note: `聞き取りの確信度が低い語: ${low.map((u) => `「${u.text}」(${u.probability!.toFixed(2)})`).join(" ")}` });
    const voicedCut = (u: Unit) => u.cutLevelDb === null || u.cutLevelDb === undefined || input.speechDb === null || u.cutLevelDb > input.speechDb - 12;
    const partly = g.filter((u) => !u.quote && u.kept < 0.95 && (u.srcEnd - u.srcStart) * (1 - u.kept) > 0.1 && voicedCut(u));
    if (partly.length) flags.push({ kind: "partly-cut", review: true, note: `一部がカット範囲にかかる語: ${partly.map((u) => `「${u.text}」(${Math.round(u.kept * 100)}%残る${u.cutLevelDb != null ? `、切った部分 ${u.cutLevelDb.toFixed(0)}dB` : ""})`).join(" ")}` });
    if (g.some((u) => u.split)) flags.push({ kind: "split", review: true, note: "長い文を句読点で分けた（表示時間は文字数で按分。区切りの位置と時刻を確認）" });
    if (overflow) flags.push({ kind: "split", review: true, note: `${maxLines}行・1行${maxChars}文字に収まらない` });
    return {
      id: `s${String(i + 1).padStart(3, "0")}`,
      start: g[0].outStart,
      end: g[g.length - 1].outEnd,
      srcStart: round3(g[0].srcStart),
      srcEnd: round3(g[g.length - 1].srcEnd),
      text: lines.join("\n"),
      heard: g.map((u) => (u.quote ? u.quote.heard : u.text)).join(""),
      flags,
      review: flags.some((f) => f.review),
    };
  });

  // ---- timing: hold briefly after speech, close small gaps, keep a minimum display time ----
  const { minDisplaySeconds, gapMergeSeconds } = preset.layout;
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    const nextStart = cues[i + 1]?.start ?? timemap.outputDurationSeconds;
    let end = Math.min(nextStart - 0.04, c.end + 0.3);
    if (end - c.start < minDisplaySeconds) end = Math.min(nextStart - 0.04, c.start + minDisplaySeconds);
    if (nextStart - end <= gapMergeSeconds) end = nextStart;
    c.end = Math.max(c.end, Math.min(end, timemap.outputDurationSeconds));
    const cps = textWidth(c.text.replace(/\n/g, "")) / (c.end - c.start);
    if (cps > 12) c.flags.push({ kind: "fast", review: false, note: `表示時間に対して文字が多い（${cps.toFixed(1)} 文字/秒）` });
    const fillers = fillerAt.filter((f) => f.out >= c.start - 0.05 && f.out < c.end).map((f) => f.text);
    if (fillers.length) c.fillersRemoved = fillers;
    c.start = round3(c.start);
    c.end = round3(c.end);
  }

  const inputs: SubtitleDraft["inputs"] = {
    sourceSha256: input.sourceSha256,
    timemapDecisionsFingerprint: timemap.decisionsFingerprint,
    cutOutputSeconds: timemap.outputDurationSeconds,
    transcriptCorrectedAt: corrected.corrected?.at ?? null,
    quotesFingerprint: fingerprint(quotes),
    preset: preset.name,
    orientation,
    maxCharsPerLine: maxChars,
    maxLines,
  };
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    fingerprint: fingerprint({ inputs, cues: cues.map((c) => [c.id, c.start, c.end, c.text]) }),
    inputs,
    cues,
    dropped: dropped.map((d) => ({ ...d, srcStart: round3(d.srcStart), srcEnd: round3(d.srcEnd) })).sort((a, b) => a.srcStart - b.srcStart),
  };
}

// ---------- layout (lines as burned in) ----------

/**
 * The cue as one line: the draft's / editor's line breaks are removed. Where the speech had a
 * comma at the break (the comma was dropped at the line end), a full-width space is put back,
 * the same as a comma inside a line.
 */
export function flattenCue(text: string, heard: string): string {
  const lines = text.split("\n");
  let out = lines[0];
  for (const next of lines.slice(1)) {
    const a = Array.from(out).at(-1) ?? "";
    const b = Array.from(next)[0] ?? "";
    const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = a && b && !/[\s　]/.test(a) ? heard.match(new RegExp(`${esc(a)}([、，,。\\s]*)${esc(b)}`)) : null;
    out += (m && /[、，,]/.test(m[1]) ? "　" : "") + next;
  }
  return out;
}

export type CueLayout = {
  id: string;
  lines: string[];
  /** Width of the whole cue as one line, and the limit (px, outline included). */
  oneLinePx: number;
  maxPx: number;
  /** Why it has two lines (empty for one line). */
  reason: string;
};

/**
 * "fit-width" layout: one line when the cue fits the max width; otherwise two lines, keeping the
 * approved break when both lines fit, else re-wrapped. More than two lines is an error.
 * `measure` returns widths in em of the subtitle font (src/render.ts measureTextEm).
 */
export async function layoutCues(
  cues: { id: string; text: string; heard: string }[],
  px: { fontSize: number; strokeWidth: number; maxWidth: number },
  maxLines: number,
  measure: (texts: string[]) => Promise<number[]>,
): Promise<CueLayout[]> {
  const toPx = (em: number) => em * px.fontSize + 2 * px.strokeWidth;
  const flats = cues.map((c) => flattenCue(c.text, c.heard));
  const flatW = await measure(flats);
  const out: CueLayout[] = [];
  for (const [i, c] of cues.entries()) {
    const oneLinePx = toPx(flatW[i]);
    if (oneLinePx <= px.maxWidth) {
      out.push({ id: c.id, lines: [flats[i]], oneLinePx, maxPx: px.maxWidth, reason: "" });
      continue;
    }
    const over = `1行だと ${Math.round(oneLinePx)}px で最大幅 ${Math.round(px.maxWidth)}px を超える`;
    let lines = c.text.split("\n");
    let how = "承認済みの改行位置";
    if (lines.length !== 2 || (await measure(lines)).some((w) => toPx(w) > px.maxWidth)) {
      // Re-wrap by width: the character budget that fits, then check the real widths.
      const perChar = flatW[i] / textWidth(flats[i]);
      const budget = Math.floor((px.maxWidth - 2 * px.strokeWidth) / px.fontSize / perChar);
      lines = wrapLines(flats[i], budget, maxLines, "space").lines;
      how = "幅に合わせて改行し直し";
    }
    const ws = await measure(lines);
    if (lines.length > maxLines || ws.some((w) => toPx(w) > px.maxWidth)) {
      throw new Error(`${c.id} が${maxLines}行に収まりません（「${flats[i]}」）。字幕を分けるか文字を減らしてください。`);
    }
    out.push({ id: c.id, lines, oneLinePx, maxPx: px.maxWidth, reason: `${over}（${how}）` });
  }
  return out;
}

// ---------- edits (input/subtitles.json) ----------

export function loadSubtitleEdits(paths: ProjectPaths, project: string): SubtitlesJson {
  return readJsonIfExists<SubtitlesJson>(paths.subtitles) ?? { version: 1, project, draftFingerprint: null, edits: {}, approved: null };
}

export function saveSubtitleEdits(paths: ProjectPaths, s: SubtitlesJson): void {
  writeJsonAtomic(paths.subtitles, s);
}

/**
 * Re-keys edits onto a new draft: an edit stays on its cue id when that cue's
 * draft text is unchanged, otherwise it moves to the one cue with the same
 * draft text. Edits that fit nowhere are returned as lost (never silently dropped).
 */
export function carryEdits(s: SubtitlesJson, draft: SubtitleDraft): { carried: number; lost: { id: string; edit: SubtitleEdit }[] } {
  if (s.draftFingerprint === draft.fingerprint) return { carried: Object.keys(s.edits).length, lost: [] };
  const next: Record<string, SubtitleEdit> = {};
  const lost: { id: string; edit: SubtitleEdit }[] = [];
  for (const [id, e] of Object.entries(s.edits)) {
    const same = draft.cues.find((c) => c.id === id && c.text === e.origText);
    const byText = draft.cues.filter((c) => c.text === e.origText);
    const target = same ?? (byText.length === 1 ? byText[0] : null);
    if (target && !next[target.id]) next[target.id] = e;
    else lost.push({ id, edit: e });
  }
  s.edits = next;
  s.draftFingerprint = draft.fingerprint;
  if (s.approved && s.approved.draftFingerprint !== draft.fingerprint) s.approved = null;
  return { carried: Object.keys(next).length, lost };
}

/** Draft + edits → the cues that would be burned in. */
export function effectiveCues(draft: SubtitleDraft, s: SubtitlesJson): (Cue & { edited: boolean; ok: boolean })[] {
  return draft.cues
    .filter((c) => !s.edits[c.id]?.deleted)
    .map((c) => {
      const e = s.edits[c.id];
      return { ...c, text: e?.text ?? c.text, edited: e?.text !== undefined, ok: !!e?.ok || e?.text !== undefined };
    });
}
