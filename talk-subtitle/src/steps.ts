// Pipeline steps after analyze, shared by the single-step scripts and
// `npm run phase1`. Each step checks that its inputs exist and refuses to
// silently invalidate approved decisions.

import fs from "node:fs";
import type { ProbeJson } from "./analyze.ts";
import { readPcmWav } from "./audioLevel.ts";
import { buildCutCandidates, pausePadding, type CutCandidate, type CutCandidatesJson } from "./candidates.ts";
import { UserError } from "./cli.ts";
import { loadSettings } from "./config.ts";
import { currentTermDecisions, loadDecisions, saveDecisions } from "./decisions.ts";
import { detectHiddenPauses, detectRetakes } from "./retakes.ts";
import { loadGlossaryFile, loadMergedGlossary, whisperPrompt } from "./glossary.ts";
import { SHARED_GLOSSARY } from "./paths.ts";
import { assertSourceUnchanged, assertWritable, fileFingerprint, fingerprint, readJson, readJsonIfExists, writeJsonAtomic, type Project } from "./project.ts";
import { writeReviewHtml } from "./review.ts";
import { planTranscription, transcribeWav, type SttPlan } from "./stt.ts";
import { applyTerms, findTermCandidates, type TermCandidatesJson } from "./terms.ts";
import type { Transcript, TranscriptFile } from "./transcript.ts";

type Log = (s: string) => void;

function need<T>(file: string, hint: string): T {
  if (!fs.existsSync(file)) throw new UserError(`${file} がありません。先に ${hint} を実行してください。`);
  return readJson<T>(file);
}

export function glossaryFingerprint(project: Project): string {
  return fingerprint([loadGlossaryFile(project.paths.glossary), loadGlossaryFile(SHARED_GLOSSARY)]);
}

export type TranscribeOptions = {
  force?: boolean;
  backend?: string;
  model?: string;
  language?: string;
  /** Show what would run (backend, prompt, settings) without transcribing or writing. */
  dryRun?: boolean;
  log?: Log;
};

export async function runTranscribe(project: Project, options: TranscribeOptions = {}): Promise<{ transcript: TranscriptFile | null; plan: SttPlan }> {
  const log = options.log ?? (() => {});
  const { paths } = project;
  const id = project.json.id;
  if (!options.dryRun) assertWritable(project);
  const settings = loadSettings(paths);
  const entries = loadMergedGlossary(paths.glossary);
  const { prompt, used, dropped } = whisperPrompt(entries, settings.transcribe.promptMaxChars);
  const plan = planTranscription(settings.transcribe, prompt, options);
  log(`backend: ${plan.backend}（${plan.reason}）  モデル: ${plan.model}  言語: ${plan.language}`);
  log(`  実行: ${plan.runner}  ${Object.entries(plan.details).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  log(prompt ? `Whisper prompt（固有名詞 ${used.length}語）: ${prompt}` : "Whisper prompt: なし（glossary が空）");
  if (dropped.length) log(`  文字数の上限で prompt に入らなかった語: ${dropped.join("、")}`);

  const blockers: string[] = [...plan.problems];
  if (!fs.existsSync(paths.probe) || !fs.existsSync(paths.audioWav)) blockers.push(`解析がまだです（npm run analyze -- --project=${id}）。`);
  else assertSourceUnchanged(project);
  if (fs.existsSync(paths.transcript) && !options.force) {
    blockers.push("文字起こしはすでにあります。やり直す場合は --force を付けてください（カット候補・承認は作り直しになります）。");
  }
  if (options.dryRun) {
    log(`[dry-run] 入力: ${paths.audioWav}`);
    log(`[dry-run] 出力: ${paths.transcript}${fs.existsSync(paths.transcript) ? "（既存あり）" : ""}`);
    log(blockers.length ? `[dry-run] このままでは実行できません:\n  ${blockers.join("\n  ")}` : "[dry-run] 実行できます（何も書き込んでいません）");
    return { transcript: null, plan };
  }
  if (blockers.length) throw new UserError(blockers.join("\n"));

  log(`文字起こし中（${plan.backend}、ローカル）…`);
  let last = -1;
  const transcript = await transcribeWav(paths.audioWav, plan, settings.transcribe, (r) => {
    const pct = Math.floor(r * 10) * 10;
    if (pct > last) {
      last = pct;
      log(`  進捗 ${pct}%`);
    }
  });
  const out: TranscriptFile = {
    ...transcript,
    talkSubtitle: {
      sourceFile: project.json.source!.file,
      sourceSha256: project.json.source!.sha256,
      prompt,
      glossaryFingerprint: glossaryFingerprint(project),
    },
  };
  writeJsonAtomic(paths.transcript, out);
  return { transcript: out, plan };
}

/** Rewrites transcript.corrected.json from the current term decisions. */
export function writeCorrected(project: Project): { applied: number; stale: boolean } {
  const { paths } = project;
  const transcript = readJsonIfExists<Transcript>(paths.transcript);
  const terms = readJsonIfExists<TermCandidatesJson>(paths.termCandidates);
  if (!transcript || !terms) return { applied: 0, stale: false };
  const { items, stale } = currentTermDecisions(loadDecisions(paths), terms);
  const corrected = applyTerms(transcript, terms, items);
  writeJsonAtomic(paths.transcriptCorrected, corrected);
  return { applied: corrected.corrected.applied, stale };
}

export function runTerms(project: Project, options: { force?: boolean } = {}) {
  assertWritable(project);
  const { paths } = project;
  const transcript = need<Transcript>(paths.transcript, `npm run transcribe -- --project=${project.json.id}`);
  const entries = loadMergedGlossary(paths.glossary);
  const result = findTermCandidates(transcript, entries);
  const prev = readJsonIfExists<TermCandidatesJson>(paths.termCandidates);
  const decisions = loadDecisions(paths);
  // Glossary edits renumber the candidates. Decisions follow their candidate when the
  // same hit still exists (same segment, position, text, entry); otherwise stop.
  let carried: { from: string; to: string }[] = [];
  const hasDecisions = Object.keys(decisions.terms.items).length > 0;
  if (prev && prev.fingerprint !== result.fingerprint && hasDecisions && decisions.terms.candidatesFingerprint === prev.fingerprint) {
    const key = (c: { segmentId: number; charFrom: number; from: string; entryId: string }) => `${c.segmentId}|${c.charFrom}|${c.from}|${c.entryId}`;
    const byKey = new Map(result.items.map((c) => [key(c), c.id]));
    const moved: typeof decisions.terms.items = {};
    const lost: string[] = [];
    for (const [oldId, d] of Object.entries(decisions.terms.items)) {
      const old = prev.items.find((c) => c.id === oldId);
      const newId = old ? byKey.get(key(old)) : undefined;
      if (newId) {
        moved[newId] = d;
        if (newId !== oldId) carried.push({ from: oldId, to: newId });
      } else lost.push(`${oldId}（${old?.from ?? "?"}）`);
    }
    if (lost.length && !options.force) {
      throw new UserError(`辞書の変更で、次の承認済み補正に対応する候補が無くなります: ${lost.join("、")}。作り直してよければ --force を付けてください（その分は承認し直し）。`);
    }
    decisions.terms = { candidatesFingerprint: result.fingerprint, items: moved };
    decisions.history.push({
      at: new Date().toISOString(),
      by: "cli",
      summary: `固有名詞の候補を作り直し（辞書の変更）。承認 ${Object.keys(moved).length} 件を引き継ぎ${carried.length ? `（番号の変更: ${carried.map((c) => `${c.from}→${c.to}`).join(", ")}）` : ""}${lost.length ? `、破棄: ${lost.join("、")}` : ""}`,
    });
    decisions.updatedAt = new Date().toISOString();
    saveDecisions(paths, decisions);
  } else if (prev && prev.fingerprint !== result.fingerprint && hasDecisions && !options.force) {
    throw new UserError("固有名詞の承認が今の候補に対応していません。作り直してよければ --force を付けてください（承認し直しが必要）。");
  }
  const json: TermCandidatesJson = {
    ...result,
    version: 1,
    createdAt: new Date().toISOString(),
    transcriptFingerprint: fileFingerprint(paths.transcript)!,
    glossaryFingerprint: glossaryFingerprint(project),
  };
  writeJsonAtomic(paths.termCandidates, json);
  const corrected = writeCorrected(project);
  return { json, entries, corrected, carried };
}

export function runCandidates(project: Project, options: { force?: boolean } = {}) {
  assertWritable(project);
  const { paths } = project;
  const id = project.json.id;
  const probe = need<ProbeJson>(paths.probe, `npm run analyze -- --project=${id}`);
  if (!fs.existsSync(paths.audioWav)) throw new UserError(`音声がありません。npm run analyze -- --project=${id} をやり直してください。`);
  const transcript = need<Transcript>(paths.transcript, `npm run transcribe -- --project=${id}`);
  assertSourceUnchanged(project);
  const settings = loadSettings(paths);
  const duration = probe.durationSeconds ?? transcript.source.durationSeconds ?? 0;
  const { items, fingerprint: fp, speechDb } = buildCutCandidates(transcript, readPcmWav(paths.audioWav), duration, settings.candidates);

  const prev = readJsonIfExists<CutCandidatesJson>(paths.cutCandidates);
  const decisions = loadDecisions(paths);
  if (prev && prev.fingerprint !== fp && decisions.cuts.candidatesFingerprint === prev.fingerprint && Object.keys(decisions.cuts.items).length > 0 && !options.force) {
    throw new UserError(
      `カット候補が前回と変わります。承認済みのカット（${Object.keys(decisions.cuts.items).length}件）は今の候補に対応しなくなります。` +
        "作り直してよければ --force を付けてください（そのあと承認し直しが必要です）。",
    );
  }
  const json: CutCandidatesJson = {
    version: 1,
    createdAt: new Date().toISOString(),
    inputs: {
      sourceSha256: project.json.source!.sha256,
      transcriptFingerprint: fileFingerprint(paths.transcript)!,
      audioFingerprint: fileFingerprint(paths.audioWav)!,
      settingsFingerprint: fingerprint(settings.candidates),
    },
    durationSeconds: duration,
    speechDb,
    fingerprint: fp,
    items,
  };
  writeJsonAtomic(paths.cutCandidates, json);
  return json;
}

export function runReview(project: Project): string {
  assertWritable(project);
  if (!fs.existsSync(project.paths.cutCandidates)) {
    throw new UserError(`カット候補がありません。先に npm run candidates -- --project=${project.json.id} を実行してください。`);
  }
  return writeReviewHtml(project);
}

/**
 * Appends round-2 retake candidates to cut-candidates.json without touching
 * the existing items or their decisions: the old items are kept byte-for-byte,
 * new ones get the next IDs and start undecided, and decisions.json is moved to
 * the new fingerprint only after checking the old items are unchanged.
 */
/** One content proposal by Claude (npm run candidates -- --add-claude=<file>). */
export type ClaudeProposal = {
  start: number;
  end: number;
  /** retake: an earlier take of what is said again later. abandoned: a phrase left unfinished. repeat: the same point made twice. tangent: off-topic talk. other. */
  type: ClaudeContentType;
  suggestion: "cut" | "review";
  reason: string;
  /** For retake / repeat: what is kept instead (shown in the review). */
  kept?: string;
};
export type ClaudeContentType = "retake" | "abandoned" | "repeat" | "tangent" | "other";
const CLAUDE_TYPES: ClaudeContentType[] = ["retake", "abandoned", "repeat", "tangent", "other"];

/** Validates Claude's proposals and fills in text / context from the transcript. */
function claudeDrafts(transcript: Transcript, cuts: CutCandidatesJson, proposals: ClaudeProposal[]) {
  const words = transcript.segments.flatMap((s) => s.words);
  const mid = (w: { start: number; end: number }) => (w.start + w.end) / 2;
  return proposals.map((p, i) => {
    const where = `提案 ${i + 1}（${p.start}–${p.end}）`;
    if (!(Number.isFinite(p.start) && Number.isFinite(p.end) && p.start >= 0 && p.end > p.start && p.end <= cuts.durationSeconds + 1e-6)) throw new UserError(`${where}: 範囲が正しくありません。`);
    if (!CLAUDE_TYPES.includes(p.type)) throw new UserError(`${where}: type は ${CLAUDE_TYPES.join("|")} のどれかです。`);
    if (p.suggestion !== "cut" && p.suggestion !== "review") throw new UserError(`${where}: suggestion は cut か review です。`);
    if (!p.reason?.trim()) throw new UserError(`${where}: reason が必要です。`);
    const inside = words.filter((w) => mid(w) >= p.start && mid(w) < p.end);
    return {
      kind: (p.type === "abandoned" ? "restart" : "retake") as CutCandidate["kind"],
      start: Math.round(p.start * 1000) / 1000,
      end: Math.round(p.end * 1000) / 1000,
      confidence: p.suggestion === "cut" ? 0.7 : 0.5,
      suggestion: p.suggestion,
      reason: `[Claude] ${p.reason}${p.kept ? `（残す：「${p.kept}」）` : ""}`,
      text: inside.map((w) => w.text).join(""),
      context: {
        before: words.filter((w) => mid(w) < p.start).slice(-10).map((w) => w.text).join(""),
        after: words.filter((w) => mid(w) >= p.end).slice(0, 10).map((w) => w.text).join(""),
      },
      segmentIds: [...new Set(transcript.segments.filter((s) => s.words.some((w) => inside.includes(w))).map((s) => s.id))],
      proposedBy: "claude" as const,
      claudeType: p.type,
    };
  });
}

export function appendRetakeCandidates(project: Project, options: { dryRun?: boolean; claude?: ClaudeProposal[] } = {}) {
  if (!options.dryRun) assertWritable(project);
  const { paths } = project;
  const cuts = need<CutCandidatesJson>(paths.cutCandidates, `npm run candidates -- --project=${project.json.id}`);
  const transcript = need<Transcript>(paths.transcript, `npm run transcribe -- --project=${project.json.id}`);
  const decisions = loadDecisions(paths);
  if (fingerprint(cuts.items) !== cuts.fingerprint) throw new UserError("cut-candidates.json の内容が指紋と一致しません。停止しました。");
  if (Object.keys(decisions.cuts.items).length && decisions.cuts.candidatesFingerprint !== cuts.fingerprint) {
    throw new UserError("decisions.json が今のカット候補に対応していません。停止しました。");
  }
  const round = Math.max(1, ...(cuts.rounds ?? []).map((r) => r.round)) + 1;

  // What is already going to be removed (approved cuts), to skip candidates that add nothing.
  const approved = cuts.items
    .filter((c) => decisions.cuts.items[c.id]?.decision === "cut")
    .map((c) => ({ start: decisions.cuts.items[c.id].start ?? c.start, end: decisions.cuts.items[c.id].end ?? c.end }));
  const uncovered = (s: number, e: number) => {
    // seconds of [s, e) not already inside an approved cut
    let covered = 0;
    for (const r of unionRanges(approved)) covered += Math.max(0, Math.min(e, r.end) - Math.max(s, r.start));
    return e - s - covered;
  };
  // Claude's content proposals are taken as given (checked in claudeDrafts); otherwise run the round-2 detectors.
  const drafts = options.claude
    ? claudeDrafts(transcript, cuts, options.claude)
    : round2Drafts(transcript, readPcmWav(paths.audioWav), cuts.speechDb, loadSettings(paths).candidates, cuts.items, uncovered);
  const detector = options.claude
    ? "claude content review (abandoned / last take / repeated talk / tangent; proposedBy: claude)"
    : "retakes v1 (phrase prefix / similar repeat / correction) + hidden pauses/speech in word spans (audio)";
  let next = Math.max(0, ...cuts.items.map((c) => Number(c.id.slice(1)) || 0)) + 1;
  const added = drafts.map((d) => ({ id: `c${next++}`, ...d, duration: Math.round((d.end - d.start) * 1000) / 1000, round }));
  const items = [...cuts.items, ...added];
  const updated: CutCandidatesJson = {
    ...cuts,
    items,
    fingerprint: fingerprint(items),
    rounds: [
      ...(cuts.rounds ?? []),
      { round, addedAt: new Date().toISOString(), detector, ids: added.map((a) => a.id), previousFingerprint: cuts.fingerprint },
    ],
  };
  const uncoveredSeconds = added.map((a) => Math.round(uncovered(a.start, a.end) * 100) / 100);
  if (options.dryRun || added.length === 0) return { added, uncoveredSeconds, written: false };

  writeJsonAtomic(paths.cutCandidates, updated);
  // The first cuts.items.length items are unchanged (verified by fingerprint), so existing decisions stay valid.
  if (fingerprint(updated.items.slice(0, cuts.items.length)) !== cuts.fingerprint) throw new Error("既存の候補が変わっています（内部エラー）");
  decisions.cuts.candidatesFingerprint = updated.fingerprint;
  decisions.history.push({
    at: new Date().toISOString(),
    by: "cli",
    summary: `カット候補を追加（round ${round}: ${added.map((a) => a.id).join(",")}、未決定）。既存 ${cuts.items.length} 件と承認は変更なし（旧指紋 ${cuts.fingerprint}）`,
  });
  decisions.updatedAt = new Date().toISOString();
  saveDecisions(paths, decisions);
  writeReviewHtml(project);
  return { added, uncoveredSeconds, written: true };
}

/**
 * Round-2 detectors (phrase retakes + hidden pauses / speech in word spans), minus what adds
 * nothing: less than 0.15 s outside what is already cut (`uncovered`), or the same thing as an
 * existing candidate of the same family (≥ 50 % overlap). Shared by appendRetakeCandidates and
 * the evaluation (src/style/evaluate.ts), so both see the same candidates.
 */
export function round2Drafts(
  transcript: Transcript,
  pcm: ReturnType<typeof readPcmWav>,
  speechDb: number,
  settings: ReturnType<typeof loadSettings>["candidates"],
  existing: { kind: string; start: number; end: number }[],
  uncovered: (s: number, e: number) => number,
) {
  const speechKinds = new Set(["filler", "restart", "retake", "correction-marker"]);
  const found = [
    ...detectRetakes(transcript),
    // Hidden pauses have no sentence/phrase information: keep the (longer) sentence-boundary room.
    ...detectHiddenPauses(transcript, pcm, speechDb, { ...settings, keepPaddingSeconds: pausePadding(settings, true) }),
  ].sort((a, b) => a.start - b.start);
  return found.filter((d) => {
    if (uncovered(d.start, d.end) < 0.15) return false; // already cut
    // Same thing as an existing candidate of the same family (≥ 50 % overlap).
    const family = (k: string) => (speechKinds.has(k) ? "speech" : k);
    return !existing.some((c) => family(c.kind) === family(d.kind) && Math.min(c.end, d.end) - Math.max(c.start, d.start) >= 0.5 * Math.min(c.end - c.start, d.end - d.start));
  });
}

export function unionRanges(ranges: { start: number; end: number }[]) {
  const out: { start: number; end: number }[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}
