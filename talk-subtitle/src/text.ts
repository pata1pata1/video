// Text helpers: kana normalization, character → time mapping over whisper
// tokens, and a simple similarity score.

import type { TranscriptSegment } from "./transcript.ts";

/** Katakana → hiragana (ー and other marks are kept). */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** Hiragana → katakana. */
export function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** Reading as stored in glossary.json: hiragana, no spaces / middle dots. */
export function normalizeReading(s: string): string {
  return toHiragana(s.normalize("NFKC")).replace(/[\s・･]/g, "");
}

export const isKanaReading = (s: string) => /^[ぁ-ゖー]+$/.test(s);

/** For similarity: drop punctuation and spaces, unify width and kana. */
export function normalizeForCompare(s: string): string {
  return toHiragana(s.normalize("NFKC").toLowerCase()).replace(/[\s、。，．,.!?！？「」『』（）()・…ー〜~]/g, "");
}

/** Dice coefficient over character bigrams (0–1). */
export function similarity(a: string, b: string): number {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let overlap = 0;
  for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) ?? 0);
  const total = Math.max(1, x.length - 1) + Math.max(1, y.length - 1);
  return (2 * overlap) / total;
}

/**
 * A segment's text rebuilt from its whisper tokens, with the time span of
 * every character. Cut / term candidates search this text so that a match
 * maps back to token times. Falls back to the segment text spread evenly
 * when there are no tokens.
 */
export type IndexedText = { text: string; charStart: number[]; charEnd: number[] };

export function indexSegment(seg: TranscriptSegment): IndexedText {
  const charStart: number[] = [];
  const charEnd: number[] = [];
  let text = "";
  if (seg.words.length > 0) {
    for (const w of seg.words) {
      for (const ch of Array.from(w.text)) {
        text += ch;
        // UTF-16 index alignment: one entry per code unit.
        for (let k = 0; k < ch.length; k++) {
          charStart.push(w.start);
          charEnd.push(w.end);
        }
      }
    }
  } else {
    text = seg.text;
    const n = Math.max(1, text.length);
    for (let i = 0; i < text.length; i++) {
      charStart.push(seg.start + ((seg.end - seg.start) * i) / n);
      charEnd.push(seg.start + ((seg.end - seg.start) * (i + 1)) / n);
    }
  }
  return { text, charStart, charEnd };
}

/** Time span of text[from, to) in an indexed segment. */
export function spanTime(ix: IndexedText, from: number, to: number): { start: number; end: number } {
  const last = Math.max(from, to - 1);
  return {
    start: ix.charStart[from] ?? ix.charStart[0] ?? 0,
    end: ix.charEnd[last] ?? ix.charEnd[ix.charEnd.length - 1] ?? 0,
  };
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;
