// Read-aloud quotes (posts the speaker reads on camera). For those scenes the
// original post text is the ground truth for subtitles, not whisper's guess —
// except where the speaker skipped or changed words, and nothing that was not
// read aloud is ever added.
//
// input/quotes.json (per project, human-provided):
//   { "version": 1, "quotes": [ { "id": "sample-person-post", "author": "sample-person", "source": "…", "lines": ["…", …] } ] }
//
// alignQuotes() finds where each line is read in the (glossary-corrected)
// transcript and lists every difference for review. Phase 3 uses the result:
// a line marked "use-quote" replaces the transcript text of its span.

import fs from "node:fs";
import { UserError } from "./cli.ts";
import type { Timemap } from "./cut.ts";
import { readJson, writeJsonAtomic } from "./project.ts";
import { indexSegment, round3, toHiragana } from "./text.ts";
import type { Transcript } from "./transcript.ts";

export type Quote = { id: string; author: string; source?: string; lines: string[] };
/**
 * The user's decision for one post line (keyed by the line text so it survives
 * reordering). use "post": the subtitle uses the post text for the matched span.
 * flag: the post text is used but the line stays 要確認 (e.g. the speaker may have
 * said 最後に where the post has 最後は) — Phase 3 shows it in the subtitle review.
 * at: source seconds of one occurrence when a short line is read several times.
 */
export type QuoteDecision = { quoteId: string; line: string; use: "post"; flag?: string; at?: number; decidedAt: string; by: "chat" | "html" };
export type QuotesFile = { version: 1; quotes: Quote[]; decisions?: QuoteDecision[] };

export function loadQuotes(file: string): QuotesFile {
  if (!fs.existsSync(file)) return { version: 1, quotes: [] };
  const q = readJson<QuotesFile>(file);
  if (q.version !== 1 || !Array.isArray(q.quotes)) throw new UserError(`${file} の形式が不正です。`);
  return q;
}

export function saveQuotes(file: string, q: QuotesFile): void {
  writeJsonAtomic(file, q);
}

/** Comparison form: no punctuation / spaces, NFKC, katakana → hiragana. Kanji kept. */
const PUNCT = /[\p{Extended_Pictographic}️\s、。，．,.!?！？「」『』（）()・…〜~ー－-]/u;
function norm(s: string): string {
  return Array.from(toHiragana(s.normalize("NFKC").toLowerCase())).filter((c) => !PUNCT.test(c)).join("");
}

function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let o = 0;
  for (const [g, n] of ga) o += Math.min(n, gb.get(g) ?? 0);
  return (2 * o) / (Math.max(1, a.length - 1) + Math.max(1, b.length - 1));
}

/** Character diff (LCS) as runs: "=" same, "-" only in the post, "+" only in the transcript. */
function diffRuns(post: string, heard: string): { op: "=" | "-" | "+"; text: string }[] {
  const a = Array.from(post);
  const b = Array.from(heard);
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const runs: { op: "=" | "-" | "+"; text: string }[] = [];
  const push = (op: "=" | "-" | "+", ch: string) => {
    const last = runs[runs.length - 1];
    if (last && last.op === op) last.text += ch;
    else runs.push({ op, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push("=", a[i++]);
      j++;
    } else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) push("+", b[j++]);
    else push("-", a[i++]);
  }
  return runs;
}

export type QuoteMatch = {
  quoteId: string;
  author: string;
  lineIndex: number;
  line: string;
  /** Transcript text of the matched span (glossary-corrected, original characters). */
  heard: string;
  start: number;
  end: number;
  /** Position in intermediate/cut.mp4 (null when the span was cut). */
  outStart: number | null;
  keptRatio: number;
  similarity: number;
  diff: { op: "=" | "-" | "+"; text: string }[];
  /** use-quote: only small differences (likely misrecognition) → subtitle uses the post text.
   *  review: words missing / added (skipped or paraphrased?) → a human decides.
   *  same: identical apart from punctuation. */
  status: "same" | "use-quote" | "review";
  notes: string[];
  /** Matched span lies inside a longer line's span (「たろうさん」 inside line 5): the longer line decides. */
  coveredBy?: { quoteId: string; lineIndex: number };
  decision?: { use: "post"; flag?: string };
  /** resolved: same, decided, or covered by a resolved line. flagged: post text is used but still 要確認. */
  state: "resolved" | "flagged" | "pending";
};

export type QuoteAlignment = {
  version: 1;
  createdAt: string;
  matches: QuoteMatch[];
  /** Lines not found in the transcript: not read aloud (or whisper lost them). Never added to subtitles. */
  notFound: { quoteId: string; lineIndex: number; line: string; bestSimilarity: number }[];
};

type Hay = { chars: { c: string; orig: string; start: number; end: number; boundaryBefore: boolean; boundaryAfter: boolean }[]; text: string };

/** One searchable string over the whole transcript; every kept character has a time and phrase-boundary flags. */
function buildHay(transcript: Transcript): Hay {
  const chars: Hay["chars"] = [];
  for (const seg of transcript.segments) {
    const ix = indexSegment(seg);
    let offset = 0;
    let segStart = true;
    for (const ch of Array.from(ix.text)) {
      const n = norm(ch);
      if (!n) {
        // punctuation: attach to the previous character and mark a boundary
        if (chars.length) {
          chars[chars.length - 1].orig += ch;
          chars[chars.length - 1].boundaryAfter = true;
        }
      } else {
        chars.push({ c: n, orig: ch, start: ix.charStart[offset], end: ix.charEnd[offset], boundaryBefore: segStart || (chars.length > 0 && chars[chars.length - 1].boundaryAfter), boundaryAfter: false });
        segStart = false;
      }
      offset += ch.length;
    }
    if (chars.length) chars[chars.length - 1].boundaryAfter = true;
  }
  return { chars, text: chars.map((x) => x.c).join("") };
}

type Window = { i: number; len: number; sim: number };

function search(hay: Hay, target: string): Window[] {
  const minLen = Math.max(2, Math.floor(target.length * 0.7));
  const maxLen = Math.ceil(target.length * 1.35) + 2;
  const found: Window[] = [];
  for (let i = 0; i < hay.text.length; i++) {
    let best = { len: 0, sim: 0 };
    for (let len = minLen; len <= maxLen && i + len <= hay.text.length; len++) {
      const sim = dice(target, hay.text.slice(i, i + len));
      if (sim > best.sim) best = { len, sim };
    }
    if (best.sim >= 0.5) found.push({ i, ...best });
  }
  found.sort((a, b) => b.sim - a.sim);
  const chosen: Window[] = [];
  for (const f of found) {
    if (chosen.some((c) => f.i < c.i + c.len && c.i < f.i + f.len)) continue;
    // Long lines are read once; a short line (「たろうさん」) may be read several times.
    if (chosen.length && (target.length >= 8 || f.sim < chosen[0].sim - 0.05)) break;
    chosen.push(f);
  }
  return chosen.map((w) => widen(hay, target, w));
}

/**
 * When the first / last characters of the post did not match (kanji vs kana:
 * 港町辺り ↔ みなとまちあたり, なんでも ↔ 何でも), stretch the window to the nearest
 * phrase boundary within (unmatched characters + 3).
 */
function widen(hay: Hay, target: string, w: Window): Window {
  const diff = diffRuns(target, hay.text.slice(w.i, w.i + w.len));
  const lead = diff[0]?.op === "-" ? diff[0].text.length : 0;
  const tail = diff[diff.length - 1]?.op === "-" ? diff[diff.length - 1].text.length : 0;
  let i = w.i;
  let end = w.i + w.len; // exclusive
  if (lead && !hay.chars[i].boundaryBefore) {
    for (let j = i - 1; j >= Math.max(0, w.i - (lead + 3)); j--) if (hay.chars[j].boundaryBefore) i = j;
  }
  if (tail && !hay.chars[end - 1].boundaryAfter) {
    for (let k = end; k < Math.min(hay.chars.length, w.i + w.len + tail + 3); k++) if (hay.chars[k].boundaryAfter) { end = k + 1; break; }
  }
  return { i, len: end - i, sim: w.sim };
}

/**
 * Aligns every quote line with the transcript. Both the glossary-corrected and
 * the raw transcript are searched (a glossary fix like たろう→太郎 can hide a
 * post spelling たろう); the better match wins.
 */
export function alignQuotes(corrected: Transcript, raw: Transcript, quotes: QuotesFile, timemap: Timemap | null): QuoteAlignment {
  const hays = [buildHay(corrected), buildHay(raw)];
  const outOf = (t: number) => {
    if (!timemap) return null;
    const s = timemap.segments.find((x) => t >= x.srcStart && t < x.srcEnd);
    return s ? round3(s.outStart + t - s.srcStart) : null;
  };
  const kept = (a: number, b: number) =>
    !timemap || b <= a ? 1 : timemap.segments.reduce((n, x) => n + Math.max(0, Math.min(b, x.srcEnd) - Math.max(a, x.srcStart)), 0) / (b - a);

  const matches: QuoteMatch[] = [];
  const notFound: QuoteAlignment["notFound"] = [];
  for (const q of quotes.quotes) {
    q.lines.forEach((line, lineIndex) => {
      const target = norm(line);
      if (target.length < 3) return;
      const results = hays.map((h) => ({ h, ws: search(h, target) }));
      const best = results.sort((a, b) => (b.ws[0]?.sim ?? 0) - (a.ws[0]?.sim ?? 0))[0];
      if (!best.ws.length) {
        let bestSimilarity = 0;
        for (const h of hays)
          for (let i = 0; i + target.length <= h.text.length; i++) bestSimilarity = Math.max(bestSimilarity, dice(target, h.text.slice(i, i + target.length)));
        notFound.push({ quoteId: q.id, lineIndex, line, bestSimilarity: round3(bestSimilarity) });
        return;
      }
      for (const w of best.ws) {
        const span = best.h.chars.slice(w.i, w.i + w.len);
        const heard = span.map((x) => x.orig).join("");
        const diff = diffRuns(target, best.h.text.slice(w.i, w.i + w.len));
        const missing = diff.filter((d) => d.op === "-").map((d) => d.text);
        const added = diff.filter((d) => d.op === "+").map((d) => d.text);
        const bigGap = missing.some((m) => m.length >= 3) || added.some((a) => a.length >= 3);
        const notes: string[] = [];
        if (missing.length) notes.push(`投稿にあって文字起こしに無い: 「${missing.join("」「")}」`);
        if (added.length) notes.push(`文字起こしにあって投稿に無い: 「${added.join("」「")}」`);
        if (bigGap) notes.push("3文字以上の違いがある。省略・言い換えか、聞き取りの誤り（漢字とかなの違いを含む）かを音声で確認");
        if (best.h === hays[1]) notes.push("補正前の文字起こしと照合（辞書の補正より投稿の表記が優先）");
        const start = span[0].start;
        const end = span[span.length - 1].end;
        matches.push({
          quoteId: q.id,
          author: q.author,
          lineIndex,
          line,
          heard,
          start: round3(start),
          end: round3(end),
          outStart: outOf(start),
          keptRatio: round3(kept(start, end)),
          similarity: round3(w.sim),
          diff,
          status: !missing.length && !added.length ? "same" : bigGap ? "review" : "use-quote",
          notes,
          state: "pending",
        });
      }
    });
  }
  // Lines whose spans overlap: say so (e.g. 「たろうさん」 inside a longer line).
  matches.sort((a, b) => a.start - b.start);
  for (const m of matches) {
    const other = matches.find((o) => o !== m && o.start < m.end && m.start < o.end);
    if (!other) continue;
    m.notes.push(`${other.author} ${other.lineIndex + 1}行目と重なる`);
    if (other.line.length > m.line.length && other.start <= m.start + 0.05 && m.end <= other.end + 0.05) m.coveredBy = { quoteId: other.quoteId, lineIndex: other.lineIndex };
  }
  for (const m of matches) {
    const d = (quotes.decisions ?? []).find((x) => x.quoteId === m.quoteId && x.line === m.line && (x.at === undefined || (x.at >= m.start - 0.5 && x.at <= m.end + 0.5)));
    if (d) m.decision = { use: d.use, ...(d.flag ? { flag: d.flag } : {}) };
  }
  const stateOf = (m: QuoteMatch): QuoteMatch["state"] => {
    if (m.decision) return m.decision.flag ? "flagged" : "resolved";
    if (m.status === "same") return "resolved";
    if (m.coveredBy) {
      const c = matches.find((o) => o.quoteId === m.coveredBy!.quoteId && o.lineIndex === m.coveredBy!.lineIndex && o.start <= m.start + 0.05 && m.end <= o.end + 0.05);
      if (c) return stateOf(c);
    }
    return "pending";
  };
  for (const m of matches) m.state = stateOf(m);
  return { version: 1, createdAt: new Date().toISOString(), matches, notFound };
}
