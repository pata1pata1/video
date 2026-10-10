// Proper-noun glossary in two layers:
//   _shared/glossary.json                      terms used across videos
//   projects/<id>/input/glossary.json          this video only (wins on the same surface)
// Used twice: as whisper's --prompt before transcription, and for
// correction candidates after it (terms.ts).

import crypto from "node:crypto";
import fs from "node:fs";
import { UserError } from "./cli.ts";
import { SHARED_GLOSSARY } from "./paths.ts";
import { readJson, writeJsonAtomic } from "./project.ts";
import { isKanaReading, normalizeReading } from "./text.ts";

export const GLOSSARY_KINDS = ["person", "company", "store", "product", "place", "term", "english", "other"] as const;
export type GlossaryKind = (typeof GLOSSARY_KINDS)[number];

export const KIND_LABELS: Record<GlossaryKind, string> = {
  person: "人物名",
  company: "会社名",
  store: "店名",
  product: "商品名",
  place: "地名",
  term: "専門用語",
  english: "英語表記",
  other: "その他",
};

export type GlossaryEntry = {
  id: string;
  /** Official spelling, e.g. 北岡大樹 / Claude Code. */
  surface: string;
  /** Readings in hiragana without spaces, e.g. きたおかだいき. */
  readings: string[];
  /** false until a human confirmed the reading; unconfirmed readings never produce candidates. */
  readingConfirmed: boolean;
  kind: GlossaryKind;
  /** Other correct spellings (never "corrected"). */
  aliases: string[];
  /** Wrong spellings actually seen and confirmed by a human. */
  misrecognitions: string[];
  /** Words that make this entry likely nearby (shown only in Phase 1). */
  contextHints: string[];
  /** suggest-only: candidates always start undecided. */
  matchPolicy: "auto" | "suggest-only";
  /**
   * true: only propose a correction where the text is used as a name — followed by a
   * title (選手・さん・君…) or with a contextHints word nearby. For readings that are
   * also common words (Hikari ＝ ひかり).
   */
  nameContextOnly?: boolean;
  note?: string;
  source: "user-instruction" | "manual" | "learned-from-review";
  addedAt: string;
};

export type GlossaryFile = { version: 1; entries: GlossaryEntry[] };
export type Layer = "project" | "shared";
export type MergedEntry = GlossaryEntry & { layer: Layer };

export function emptyGlossary(): GlossaryFile {
  return { version: 1, entries: [] };
}

export function loadGlossaryFile(file: string): GlossaryFile {
  if (!fs.existsSync(file)) return emptyGlossary();
  const data = readJson<GlossaryFile>(file);
  if (data.version !== 1 || !Array.isArray(data.entries)) {
    throw new UserError(`${file} の形式が不正です（version: 1 と entries 配列が必要）。`);
  }
  data.entries = data.entries.map((e, i) => validateEntry(e, `${file} の entries[${i}]`));
  return data;
}

function validateEntry(raw: Partial<GlossaryEntry>, where: string): GlossaryEntry {
  if (!raw.surface || typeof raw.surface !== "string") throw new UserError(`${where}: surface（正式表記）がありません。`);
  const kind = (raw.kind ?? "other") as GlossaryKind;
  if (!GLOSSARY_KINDS.includes(kind)) throw new UserError(`${where}: kind「${raw.kind}」は使えません（${GLOSSARY_KINDS.join("|")}）。`);
  const readings = (raw.readings ?? []).map(normalizeReading).filter(Boolean);
  for (const r of readings) {
    if (!isKanaReading(r)) throw new UserError(`${where}: 読み「${r}」はひらがな／カタカナで書いてください。`);
  }
  return {
    id: raw.id || makeId(kind, raw.surface),
    surface: raw.surface.trim(),
    readings: [...new Set(readings)],
    readingConfirmed: raw.readingConfirmed ?? readings.length > 0,
    kind,
    aliases: uniq(raw.aliases),
    misrecognitions: uniq(raw.misrecognitions),
    contextHints: uniq(raw.contextHints),
    matchPolicy: raw.matchPolicy === "suggest-only" ? "suggest-only" : "auto",
    ...(raw.nameContextOnly ? { nameContextOnly: true } : {}),
    ...(raw.note ? { note: raw.note } : {}),
    source: raw.source ?? "manual",
    addedAt: raw.addedAt ?? new Date().toISOString(),
  };
}

const uniq = (xs: string[] | undefined) => [...new Set((xs ?? []).map((x) => x.trim()).filter(Boolean))];

export function makeId(kind: string, surface: string): string {
  const ascii = surface.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (ascii && /^[\x00-\x7f]+$/.test(surface)) return `${kind}-${ascii}`;
  return `${kind}-${crypto.createHash("sha1").update(surface).digest("hex").slice(0, 8)}`;
}

/** Project entries first; a shared entry with the same surface is dropped. */
export function mergeGlossaries(project: GlossaryFile, shared: GlossaryFile): MergedEntry[] {
  const seen = new Set(project.entries.map((e) => e.surface));
  return [
    ...project.entries.map((e) => ({ ...e, layer: "project" as const })),
    ...shared.entries.filter((e) => !seen.has(e.surface)).map((e) => ({ ...e, layer: "shared" as const })),
  ];
}

export function loadMergedGlossary(projectGlossaryFile: string | null): MergedEntry[] {
  return mergeGlossaries(
    projectGlossaryFile ? loadGlossaryFile(projectGlossaryFile) : emptyGlossary(),
    loadGlossaryFile(SHARED_GLOSSARY),
  );
}

export type EntryInput = {
  surface: string;
  readings?: string[];
  readingConfirmed?: boolean;
  kind?: string;
  aliases?: string[];
  misrecognitions?: string[];
  contextHints?: string[];
  matchPolicy?: string;
  nameContextOnly?: boolean;
  note?: string;
  source?: GlossaryEntry["source"];
};

/** Adds a new entry, or (update=true) merges lists into the existing one with the same surface. */
export function upsertEntry(
  file: GlossaryFile,
  input: EntryInput,
  options: { update: boolean },
): { entry: GlossaryEntry; before: GlossaryEntry | null } {
  const idx = file.entries.findIndex((e) => e.surface === input.surface.trim());
  const before = idx >= 0 ? file.entries[idx] : null;
  if (before && !options.update) {
    throw new UserError(`「${input.surface}」はすでに登録されています。追記するなら update を使ってください。`);
  }
  if (!before && options.update) {
    throw new UserError(`「${input.surface}」は登録されていません。新しく登録するなら add を使ってください。`);
  }
  const entry = validateEntry(
    {
      ...(before ?? {}),
      surface: input.surface,
      kind: (input.kind ?? before?.kind ?? "other") as GlossaryKind,
      readings: [...(before?.readings ?? []), ...(input.readings ?? [])],
      readingConfirmed: input.readingConfirmed ?? (before ? before.readingConfirmed : undefined),
      aliases: [...(before?.aliases ?? []), ...(input.aliases ?? [])],
      misrecognitions: [...(before?.misrecognitions ?? []), ...(input.misrecognitions ?? [])],
      contextHints: [...(before?.contextHints ?? []), ...(input.contextHints ?? [])],
      matchPolicy: (input.matchPolicy ?? before?.matchPolicy) as GlossaryEntry["matchPolicy"],
      nameContextOnly: input.nameContextOnly ?? before?.nameContextOnly,
      note: input.note ?? before?.note,
      source: before?.source ?? input.source ?? "manual",
      addedAt: before?.addedAt,
    },
    `「${input.surface}」`,
  );
  // A misrecognition that is itself a correct spelling would "correct" right text.
  for (const m of entry.misrecognitions) {
    if (m === entry.surface || entry.aliases.includes(m)) {
      throw new UserError(`「${m}」は正式表記／別表記と同じなので、誤認識には登録できません。`);
    }
  }
  if (before) file.entries[idx] = entry;
  else file.entries.push(entry);
  return { entry, before };
}

export function removeEntry(file: GlossaryFile, key: string): GlossaryEntry {
  const idx = file.entries.findIndex((e) => e.id === key || e.surface === key);
  if (idx < 0) throw new UserError(`「${key}」は登録されていません。`);
  return file.entries.splice(idx, 1)[0];
}

export function saveGlossaryFile(file: string, data: GlossaryFile): void {
  writeJsonAtomic(file, data);
}

/**
 * whisper's initial prompt: official spellings joined with "、", project
 * entries first, cut at maxChars. Whisper tends to copy prompt style, so
 * it is kept to plain names.
 */
export function whisperPrompt(entries: MergedEntry[], maxChars: number): { prompt: string; used: string[]; dropped: string[] } {
  const used: string[] = [];
  const dropped: string[] = [];
  let length = 0;
  for (const e of entries) {
    const add = e.surface.length + (used.length ? 1 : 0);
    if (length + add + 1 > maxChars) {
      dropped.push(e.surface);
      continue;
    }
    used.push(e.surface);
    length += add;
  }
  return { prompt: used.length ? `${used.join("、")}。` : "", used, dropped };
}

export function describeEntry(e: GlossaryEntry | MergedEntry): string {
  const layer = "layer" in e ? (e.layer === "shared" ? "[共通] " : "[案件] ") : "";
  const parts = [
    `${layer}${e.surface}（${KIND_LABELS[e.kind]}）`,
    `読み: ${e.readings.length ? e.readings.join("／") : "なし"}${e.readings.length && !e.readingConfirmed ? "（未確認）" : ""}`,
  ];
  if (e.aliases.length) parts.push(`別表記: ${e.aliases.join("／")}`);
  if (e.misrecognitions.length) parts.push(`誤認識: ${e.misrecognitions.join("／")}`);
  if (e.contextHints.length) parts.push(`文脈: ${e.contextHints.join("／")}`);
  if (e.matchPolicy === "suggest-only") parts.push("提案のみ");
  if (e.nameContextOnly) parts.push("人名の文脈のみ");
  if (e.note) parts.push(`補足: ${e.note}`);
  return `${parts.join("  ")}  [id: ${e.id}]`;
}
