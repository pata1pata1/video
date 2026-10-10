// Step 3: proper-noun correction candidates from the glossary. Never a
// blind replace-all: each hit is a candidate with context, and only
// accepted ones (decisions.json, or a confirmed misrecognition by default)
// end up in transcript.corrected.json. Phase 1 matching is deliberately
// simple (see docs/design.md §5.3).

import type { Transcript, TranscriptSegment, TranscriptWord } from "./transcript.ts";
import type { MergedEntry } from "./glossary.ts";
import { fingerprint } from "./project.ts";
import { escapeRegExp, indexSegment, round3, spanTime, toKatakana } from "./text.ts";

export type TermCandidateKind = "misrecognition" | "case-variant" | "reading-kana";

export type TermCandidate = {
  id: string;
  kind: TermCandidateKind;
  entryId: string;
  layer: "project" | "shared";
  segmentId: number;
  /** Offsets in the segment's token text (see text.ts indexSegment). */
  charFrom: number;
  charTo: number;
  start: number;
  end: number;
  /** Text as transcribed → proposed spelling. */
  from: string;
  to: string;
  confidence: number;
  defaultDecision: "accept" | "pending";
  reason: string;
  context: { before: string; after: string };
};

export type TermCandidatesJson = {
  version: 1;
  createdAt: string;
  transcriptFingerprint: string;
  glossaryFingerprint: string;
  /** Hash of items: decisions made against other items are not applied. */
  fingerprint: string;
  /** Official spellings / aliases already transcribed correctly. */
  /** Correct spellings found. partOf: longer words that contain the spelling (e.g. 山田太 in 山田太郎), not counted. */
  found: { surface: string; count: number; partOf?: string[] }[];
  items: TermCandidate[];
};

type Hit = Omit<TermCandidate, "id">;

const LATIN = /[A-Za-z]/;
const KANA = /[ぁ-ゖァ-ヺー]/;
/** Single-kana particles / copula starts that normally sit right next to a name. */
const PARTICLES = new Set(Array.from("はがをにとでのもへやかねよさだ"));
/** A neighbouring kana that is not a particle suggests the match is inside a longer word. */
const gluedChar = (c: string | undefined) => !!c && KANA.test(c) && !PARTICLES.has(c);
/** A kanji / Latin letter right after a name usually means a longer name (山田太 → 山田太郎). */
const CONTINUES = /[一-鿿A-Za-z0-9]/;
/** Titles that may follow a name without making it a different name (山田太郎選手). */
const NAME_SUFFIXES = ["選手", "氏", "様", "君", "社長", "代表", "監督", "会長", "先生", "容疑者", "被告", "側", "陣営", "本人", "自身", "達", "戦", "軍"];
/** Text right after the match starts with a title, or a context hint is within 20 characters. */
function inNameContext(e: MergedEntry, text: string, r: [number, number]): boolean {
  const after = text.slice(r[1]);
  if (/^(選手|さん|さま|様|氏|君|くん|ちゃん|社長|代表|監督|陣営|側)/.test(after)) return true;
  const around = text.slice(Math.max(0, r[0] - 20), r[1] + 20);
  return e.contextHints.some((h) => around.includes(h));
}

function stripSuffixes(word: string, surface: string): string {
  let w = word;
  for (let changed = true; changed && w.length > surface.length; ) {
    changed = false;
    for (const suf of NAME_SUFFIXES) {
      if (w.endsWith(suf) && w.length - suf.length >= surface.length) {
        w = w.slice(0, -suf.length);
        changed = true;
      }
    }
  }
  return w;
}

function allMatches(text: string, re: RegExp): { index: number; text: string }[] {
  const out: { index: number; text: string }[] = [];
  for (const m of text.matchAll(re)) if (m[0]) out.push({ index: m.index!, text: m[0] });
  return out;
}

const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

export function findTermCandidates(transcript: Transcript, entries: MergedEntry[]): Omit<TermCandidatesJson, "createdAt" | "transcriptFingerprint" | "glossaryFingerprint"> {
  const hits: Hit[] = [];
  const found = new Map<string, number>();
  const partOf = new Map<string, Set<string>>();

  const misrecognitionList = entries
    .flatMap((e) => e.misrecognitions.map((m) => ({ e, m })))
    .sort((a, b) => b.m.length - a.m.length);
  const readingList = entries
    .filter((e) => e.readingConfirmed)
    .flatMap((e) => e.readings.filter((r) => r.length >= 3).map((reading) => ({ e, reading })))
    .sort((a, b) => b.reading.length - a.reading.length);
  // Every correct spelling: a longer word that is itself a known spelling (山田 inside 山田太郎) is not a warning.
  const knownSpellings = new Set(entries.flatMap((e) => [e.surface, ...e.aliases]));

  for (const seg of transcript.segments) {
    const ix = indexSegment(seg);
    const text = ix.text;
    // Correct spellings of every entry: never touched, and no other match may overlap them.
    const protectedRanges: [number, number][] = [];
    for (const e of entries) {
      // Longest first, so "タイムズカー" is counted once even with the alias "タイムズ".
      const mine: [number, number][] = [];
      for (const s of [e.surface, ...e.aliases].sort((a, b) => b.length - a.length)) {
        for (const m of allMatches(text, new RegExp(escapeRegExp(s), "g"))) {
          const r: [number, number] = [m.index, m.index + m.text.length];
          protectedRanges.push(r);
          if (mine.some((x) => overlaps(x, r))) continue;
          mine.push(r);
          const next = text[r[1]];
          if (next && CONTINUES.test(next) && /[一-鿿A-Za-z0-9]$/.test(s)) {
            // Show the longer word (up to the next kana / punctuation) instead of counting it as correct.
            const longer = text.slice(r[0]).match(/^[一-鿿A-Za-z0-9]+/)![0];
            const base = stripSuffixes(longer, s);
            if (base !== s) {
              // Another entry's spelling, or a registered misrecognition (handled as a candidate): no warning.
              const handled = [...knownSpellings].some((k) => k !== s && base.startsWith(k)) || entries.some((x) => x.misrecognitions.some((m) => base.startsWith(m)));
              if (!handled) partOf.set(e.surface, (partOf.get(e.surface) ?? new Set()).add(base));
              continue;
            }
          }
          found.set(e.surface, (found.get(e.surface) ?? 0) + 1);
        }
      }
    }
    const taken: [number, number][] = [];
    // A candidate may swallow a correct spelling whole (misrecognition "タイムズ化" ⊃ alias "タイムズ"),
    // but never sit inside or straddle one ("北岡" inside "北岡大樹").
    const free = (r: [number, number]) =>
      !protectedRanges.some((p) => overlaps(p, r) && !(r[0] <= p[0] && p[1] <= r[1] && r[1] - r[0] > p[1] - p[0])) &&
      !taken.some((t) => overlaps(t, r));

    const push = (e: MergedEntry, kind: TermCandidateKind, index: number, from: string, confidence: number, reason: string) => {
      const r: [number, number] = [index, index + from.length];
      if (!free(r)) return;
      if (e.nameContextOnly && !inNameContext(e, text, r)) return; // e.g. the common word さっき
      taken.push(r);
      const t = spanTime(ix, r[0], r[1]);
      hits.push({
        kind,
        entryId: e.id,
        layer: e.layer,
        segmentId: seg.id,
        charFrom: r[0],
        charTo: r[1],
        start: round3(t.start),
        end: round3(t.end),
        from,
        to: e.surface,
        confidence,
        defaultDecision: kind === "misrecognition" && e.matchPolicy === "auto" ? "accept" : "pending",
        reason,
        context: { before: text.slice(Math.max(0, r[0] - 15), r[0]), after: text.slice(r[1], r[1] + 15) },
      });
    };

    // Order matters: the most certain kind claims a range first, and within a
    // kind the longest pattern wins across all entries (八田太朗 → 山田太郎 before 八田 → 山田).
    for (const { e, m } of misrecognitionList) {
      for (const hit of allMatches(text, new RegExp(escapeRegExp(m), "g"))) {
        push(e, "misrecognition", hit.index, hit.text, 0.9, `確認済みの誤認識「${m}」と一致`);
      }
    }
    for (const e of entries) {
      if (!LATIN.test(e.surface)) continue;
      const parts = e.surface.split(/[\s\-・･_]+/).filter(Boolean).map(escapeRegExp);
      const re = new RegExp(parts.join("[\\s\\-・･_]*"), "gi");
      for (const hit of allMatches(text, re)) {
        if (hit.text === e.surface || e.aliases.includes(hit.text)) continue;
        // Inside a longer English word ("claudecodes") is not this term.
        if (/[A-Za-z0-9]/.test(text[hit.index - 1] ?? "") || /[A-Za-z0-9]/.test(text[hit.index + hit.text.length] ?? "")) continue;
        push(e, "case-variant", hit.index, hit.text, 0.8, "大文字小文字・空白・記号だけが違う");
      }
    }
    for (const { e, reading } of readingList) {
      {
        for (const form of new Set([reading, toKatakana(reading)])) {
          const re = new RegExp(Array.from(form).map(escapeRegExp).join("[\\s・･]?"), "g");
          for (const hit of allMatches(text, re)) {
            const glued = gluedChar(text[hit.index - 1]) || gluedChar(text[hit.index + hit.text.length]);
            push(
              e,
              "reading-kana",
              hit.index,
              hit.text,
              glued ? 0.4 : 0.7,
              glued ? `読み「${reading}」と一致（前後がかなに続いているので要確認）` : `読み「${reading}」がかなのまま出ている`,
            );
          }
        }
      }
    }
  }

  hits.sort((a, b) => a.start - b.start || a.charFrom - b.charFrom);
  const items = hits.map((h, i) => ({ id: `t${i + 1}`, ...h }));
  return {
    version: 1,
    fingerprint: fingerprint(items),
    found: [...new Set([...found.keys(), ...partOf.keys()])].map((surface) => ({
      surface,
      count: found.get(surface) ?? 0,
      ...(partOf.has(surface) ? { partOf: [...partOf.get(surface)!] } : {}),
    })),
    items,
  };
}

/** Which replacement (if any) is in effect for a candidate. */
export type TermDecision = { decision: "accept" | "reject"; replacement?: string };

export function effectiveReplacement(c: TermCandidate, d: TermDecision | undefined): string | null {
  if (d) return d.decision === "accept" ? (d.replacement ?? c.to) : null;
  return c.defaultDecision === "accept" ? c.to : null;
}

export type CorrectedSegment = TranscriptSegment & { corrections?: { termId: string; from: string; to: string }[] };
export type CorrectedTranscript = Omit<Transcript, "segments"> & {
  corrected: { termCandidatesFingerprint: string; applied: number; at: string };
  segments: CorrectedSegment[];
};

/**
 * Applies accepted replacements. Times are not changed: the replaced range
 * keeps the time span of the tokens it covered.
 */
export function applyTerms(
  transcript: Transcript,
  candidates: TermCandidatesJson,
  decisions: Record<string, TermDecision>,
): CorrectedTranscript {
  let applied = 0;
  const segments = transcript.segments.map((seg): CorrectedSegment => {
    const mine = candidates.items
      .filter((c) => c.segmentId === seg.id)
      .map((c) => ({ c, to: effectiveReplacement(c, decisions[c.id]) }))
      .filter((x): x is { c: TermCandidate; to: string } => x.to !== null)
      .sort((a, b) => b.c.charFrom - a.c.charFrom); // right to left keeps offsets valid
    if (mine.length === 0) return seg;

    if (seg.words.length === 0) {
      let text = seg.text;
      for (const { c, to } of mine) text = text.slice(0, c.charFrom) + to + text.slice(c.charTo);
      applied += mine.length;
      return { ...seg, text, corrections: mine.map(({ c, to }) => ({ termId: c.id, from: c.from, to })).reverse() };
    }

    let words: TranscriptWord[] = seg.words.map((w) => ({ ...w }));
    for (const { c, to } of mine) {
      // Character offset → word index.
      const owner: number[] = [];
      words.forEach((w, wi) => {
        for (let k = 0; k < w.text.length; k++) owner.push(wi);
      });
      const first = owner[c.charFrom];
      const last = owner[c.charTo - 1];
      if (first === undefined || last === undefined) continue;
      const startOfFirst = owner.indexOf(first);
      const startOfLast = owner.indexOf(last);
      const prefix = words[first].text.slice(0, c.charFrom - startOfFirst);
      const suffix = words[last].text.slice(c.charTo - startOfLast);
      const merged: TranscriptWord = {
        text: prefix + to + suffix,
        start: words[first].start,
        end: words[last].end,
        probability: null,
      };
      words = [...words.slice(0, first), merged, ...words.slice(last + 1)];
      applied++;
    }
    return {
      ...seg,
      text: words.map((w) => w.text).join(""),
      words,
      corrections: mine.map(({ c, to }) => ({ termId: c.id, from: c.from, to })).reverse(),
    };
  });
  return {
    ...transcript,
    text: segments.map((s) => s.text).join(transcript.language === "ja" || transcript.language === "zh" ? "" : " "),
    corrected: { termCandidatesFingerprint: candidates.fingerprint, applied, at: new Date().toISOString() },
    segments,
  };
}
