// Character diff between a subtitle draft and the user's edit, and what kind of
// change it is (line break only, punctuation, proper noun, filler removed…).

import type { SubtitleEditCategory } from "./observation.ts";

export type DiffOp = { op: "=" | "-" | "+"; text: string };

/** LCS diff over characters (subtitles are short: O(n·m) is fine). */
export function charDiff(a: string, b: string): DiffOp[] {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = x.length;
  const m = y.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = x[i] === y[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const ops: DiffOp[] = [];
  const push = (op: DiffOp["op"], c: string) => {
    const last = ops.at(-1);
    if (last?.op === op) last.text += c;
    else ops.push({ op, text: c });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push("=", x[i]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) push("-", x[i++]);
    else push("+", y[j++]);
  }
  while (i < n) push("-", x[i++]);
  while (j < m) push("+", y[j++]);
  return ops;
}

const BREAK = /^[\n\s　]+$/;
const PUNCT = /^[\n\s　、。，．,.!?！？「」『』（）()・…〜~ー]+$/;

/**
 * Categories of one edit. surfaces: glossary spellings (and aliases); quoteLines:
 * post lines the subtitle may take its text from; fillers: the tool's filler words.
 */
export function classifyEdit(
  orig: string,
  edited: string,
  ctx: { surfaces: string[]; quoteLines: string[]; fillers: string[] },
): { categories: SubtitleEditCategory[]; ops: DiffOp[]; charsRemoved: number; charsAdded: number } {
  const ops = charDiff(orig, edited);
  const changed = ops.filter((o) => o.op !== "=");
  const removed = changed.filter((o) => o.op === "-").map((o) => o.text);
  const added = changed.filter((o) => o.op === "+").map((o) => o.text);
  const count = (t: string[]) => t.reduce((n, s) => n + Array.from(s.replace(/[\n\s　]/g, "")).length, 0);
  const cats = new Set<SubtitleEditCategory>();
  if (changed.length > 0 && changed.every((o) => BREAK.test(o.text))) cats.add("line-break");
  else {
    const flat = (s: string) => s.replace(/[\n\s　]/g, "");
    if (flat(orig) !== flat(edited) && changed.every((o) => PUNCT.test(o.text))) cats.add("punctuation");
    if (orig.includes("\n") !== edited.includes("\n") || changed.some((o) => o.text.includes("\n"))) cats.add("line-break");
    const inEdited = (s: string) => edited.includes(s) && !orig.includes(s);
    if (ctx.surfaces.some(inEdited)) cats.add("term");
    if (ctx.quoteLines.some((l) => added.some((a) => Array.from(a).length >= 3 && l.includes(a)))) cats.add("quote");
    const content = changed.filter((o) => !PUNCT.test(o.text));
    if (content.some((o) => o.op === "-" && ctx.fillers.includes(o.text.replace(/[、。\s　]/g, "")))) cats.add("filler-removed");
    const onlyRemoved = content.length > 0 && content.every((o) => o.op === "-");
    const onlyAdded = content.length > 0 && content.every((o) => o.op === "+");
    if (onlyRemoved && !cats.has("filler-removed")) cats.add("deletion");
    else if (onlyAdded) cats.add("insertion");
    else if (content.some((o) => o.op === "-") && content.some((o) => o.op === "+") && !cats.has("term") && !cats.has("quote")) cats.add("replacement");
  }
  return { categories: [...cats], ops, charsRemoved: count(removed), charsAdded: count(added) };
}
