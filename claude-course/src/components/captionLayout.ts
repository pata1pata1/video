// Caption line-breaking. Pure (no Remotion / React imports) so it can also be
// run from Node to check every caption: `node scripts/check-captions.mjs`.
//
// Rules, in order:
// - "、" is never shown; it only hints where a break reads naturally.
// - "|" in a caption forces the break there.
// - A caption that fits one row stays on one row.
// - Otherwise break only at a phrase boundary (see isBoundary): after "、",
//   "」", "・" or a full-width space, before "「", or after hiragana when the
//   next character starts a new word (kanji, katakana, Latin, digit). Never
//   inside a Latin run such as "Claude Code" / "Windows", never inside a kanji
//   or katakana word, never between two hiragana (so "ます" / "です" never
//   split off), never right before "下さい" / "欲しい", and the second row
//   never starts with a particle or small kana.
// - Among allowed breaks prefer the script's own pauses (、 」 ・ space), then
//   the most even pair of rows; a row shorter than MIN_ROW_SHARE of the
//   caption is only used if nothing else fits.

/**
 * One subtitle row holds about this many full-width characters. Shared by the
 * video (theme/tokens.ts), captions.vtt and the checker, so they break alike.
 */
export const MAX_ROW_WIDTH = 25;

/** Estimated display width in full-width characters. Latin in Noto Sans JP runs ~0.6. */
export const widthOf = (s: string): number =>
  [...s].reduce((w, ch) => w + (ch.charCodeAt(0) < 0x80 ? 0.6 : 1), 0);

/**
 * Caption rule: 「、」 is never shown. Row-edge spaces (\s includes the
 * full-width space) and a 「・」 left at a row edge by a break are dropped.
 */
export const clean = (row: string): string => row.replace(/、/g, "").replace(/^[\s・]+|[\s・]+$/g, "");

const FORCED_BREAK = "|";
const IDEOGRAPHIC_SPACE = String.fromCharCode(0x3000);
const MIN_ROW_SHARE = 0.35;
/** Breaking at a script pause (、 」 ・ space) outweighs this much row imbalance (x2). */
const STRONG_BREAK_BONUS = 5;
/** A row may not start with these words (they belong to the word before). */
const NO_ROW_START_WORDS = ["下さ", "欲し"];
/** Characters a row may not start with. */
const NO_ROW_START = new Set([..."はがをにでとのへもやねよかなっゃゅょぁぃぅぇぉッャュョァィゥェォー」』）)。、！？!?・"]);

const HIRAGANA_FIRST = String.fromCharCode(0x3041);
const HIRAGANA_LAST = String.fromCharCode(0x309f);
const isHiragana = (c: string) => c >= HIRAGANA_FIRST && c <= HIRAGANA_LAST;
const isAsciiWord = (c: string) => /[A-Za-z0-9 .]/.test(c);
const isStrong = (prev: string) => prev === "、" || prev === "」" || prev === "・" || prev === IDEOGRAPHIC_SPACE;

/** Whether a row break is allowed between prev and next (rest = the text from next on). */
const isBoundary = (prev: string, next: string, rest: string): boolean => {
  if (NO_ROW_START.has(next) || NO_ROW_START_WORDS.some((w) => rest.startsWith(w))) return false;
  if (isStrong(prev)) return true;
  if (next === "「") return true;
  if (isAsciiWord(prev) && isAsciiWord(next)) return false;
  return isHiragana(prev) && !isHiragana(next);
};

export const captionWidth = (text: string): number => widthOf(clean(text.split(FORCED_BREAK).join("")));

/** Splits a caption into one or two display rows (see the rules above). */
export const splitCaption = (text: string, maxRowWidth: number): string[] => {
  if (text.includes(FORCED_BREAK)) return text.split(FORCED_BREAK).map(clean);
  const total = captionWidth(text);
  if (total <= maxRowWidth) return [clean(text)];

  const chars = [...text];
  type Option = { rows: string[]; score: number; short: boolean };
  const options: Option[] = [];
  for (let i = 1; i < chars.length; i++) {
    if (!isBoundary(chars[i - 1], chars[i], chars.slice(i).join(""))) continue;
    const rows = [clean(chars.slice(0, i).join("")), clean(chars.slice(i).join(""))];
    const [a, b] = rows.map(widthOf);
    if (!rows[0] || !rows[1] || a > maxRowWidth || b > maxRowWidth) continue;
    options.push({
      rows,
      score: Math.abs(a - b) / 2 - (isStrong(chars[i - 1]) ? STRONG_BREAK_BONUS : 0),
      short: Math.min(a, b) < total * MIN_ROW_SHARE,
    });
  }
  const pick = (list: Option[]) =>
    list.reduce<Option | null>((best, o) => (!best || o.score < best.score ? o : best), null);
  const best = pick(options.filter((o) => !o.short)) ?? pick(options);
  return best ? best.rows : [clean(text)];
};
