// S1 of the editing-style learning: read one project made with talk-subtitle
// and record its editing decisions as events (style-data/observations/<id>.json).
//
// Read-only for the project: nothing in projects/<id>/ is written, and no
// candidate, setting or decision changes. See docs/design.md §15.

import fs from "node:fs";
import path from "node:path";
import type { ProbeJson } from "../analyze.ts";
import type { CutCandidate, CutCandidatesJson } from "../candidates.ts";
import { UserError } from "../cli.ts";
import { loadSettings } from "../config.ts";
import { approvedCuts, type Timemap } from "../cut.ts";
import { currentCutDecisions, currentTermDecisions, loadDecisions, type CutDecision } from "../decisions.ts";
import { loadMergedGlossary } from "../glossary.ts";
import { STYLE_OBSERVATIONS_DIR } from "../paths.ts";
import { fileFingerprint, fingerprint, projectKind, readJsonIfExists, type Project } from "../project.ts";
import { loadQuotes, type QuoteAlignment } from "../quotes.ts";
import { effectiveCues, loadPreset, loadSubtitleEdits, type SubtitleDraft } from "../subtitles.ts";
import type { TermCandidatesJson } from "../terms.ts";
import { indexSegment, round3 } from "../text.ts";
import type { Transcript, TranscriptWord } from "../transcript.ts";
import {
  OBSERVATION_VERSION,
  type Boundary,
  type CueEvent,
  type CutCandidateEvent,
  type CutRangeEvent,
  type FillerEvent,
  type Observation,
  type ObservationEvent,
  type PauseEvent,
  type Provenance,
  type QuoteEvent,
  type StyleScope,
  type SubtitleEditEvent,
  type TermEvent,
} from "./observation.ts";
import type { Reconstruction } from "./reconstruct.ts";
import { classifyEdit } from "./subtitleDiff.ts";

/** Gaps shorter than this between two kept words are ordinary speech rhythm, not recorded. */
const MIN_PAUSE_SECONDS = 0.3;
/** Weak fillers that count at a sentence head even without a 、 (あの／その at a head are usually demonstratives). */
const WEAK_AT_HEAD = ["なんか", "まあ"];

export function observationFile(id: string): string {
  return path.join(STYLE_OBSERVATIONS_DIR, `${id}.json`);
}

type Word = TranscriptWord & { seg: number; first: boolean; last: boolean };
type Range = { start: number; end: number };

const overlap = (a: Range, b: Range) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return round3(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};
const spoken = (s: string) => Array.from(s.replace(/[\n\s　、。，．,.!?！？「」『』（）()・…〜~]/g, "")).length;

function boundaryAfter(text: string): Boundary {
  const last = Array.from(text.trim()).at(-1) ?? "";
  if (/[。！？!?]/.test(last)) return "sentence";
  if (/[、，,]/.test(last)) return "comma";
  return "none";
}

export type ObserveOptions = { examples?: boolean };

export function observeProject(project: Project, options: ObserveOptions = {}): Observation {
  const { paths, json } = project;
  const withExamples = options.examples !== false;
  const gaps: string[] = [];

  const probe = readJsonIfExists<ProbeJson>(paths.probe);
  const transcript = readJsonIfExists<Transcript>(paths.transcript);
  const cuts = readJsonIfExists<CutCandidatesJson>(paths.cutCandidates);
  const terms = readJsonIfExists<TermCandidatesJson>(paths.termCandidates);
  const isReference = projectKind(json) === "reference";
  // reference projects: the reconstruction (same shape as timemap.json) stands in for the timemap
  const recon = isReference ? readJsonIfExists<Reconstruction>(paths.reconstruction) : null;
  const timemap: Pick<Timemap, "removed" | "segments" | "outputDurationSeconds" | "source" | "candidatesFingerprint" | "decisionsFingerprint"> | null = isReference
    ? recon
      ? { ...recon, candidatesFingerprint: "", decisionsFingerprint: "" }
      : null
    : readJsonIfExists<Timemap>(paths.timemap);
  const draft = readJsonIfExists<SubtitleDraft>(paths.subtitlesDraft);
  const alignment = readJsonIfExists<QuoteAlignment>(paths.quoteAlignment);
  const decisions = loadDecisions(paths);
  const settings = loadSettings(paths);
  const edits = loadSubtitleEdits(paths, json.id);
  const glossary = loadMergedGlossary(paths.glossary);
  if (json.learning?.exclude) throw new UserError(`案件 ${json.id} は学習の対象外です（${json.learning.reason}）。`);
  if (isReference && !recon) throw new UserError(`案件 ${json.id} にはまだ reconstruction.json がありません（npm run reference -- reconstruct --project=${json.id}）。`);
  if (!isReference && !cuts && !draft) throw new UserError(`案件 ${json.id} にはまだカット候補も字幕案もありません。観察できる編集判断がありません。`);

  // ---- scope / format
  // Horizontal videos only: a vertical / square video is refused, not recorded under another scope.
  const orientation = probe?.video?.orientation ?? null;
  const finalOrientation = isReference ? (readJsonIfExists<ProbeJson>(paths.finalProbe)?.video?.orientation ?? null) : orientation;
  for (const [label, o] of [["元動画", orientation], ["完成動画", finalOrientation]] as const) {
    if (o && o !== "landscape") throw new UserError(`talk-subtitle は横長動画専用です。案件 ${json.id} の${label}が${o === "portrait" ? "縦型" : "正方形"}です。縦型ショートは別のプロジェクトで扱ってください。`);
  }
  const scope: StyleScope = "landscape";
  const scopeReason = orientation ? "probe.json の向きが横（landscape）" : "probe.json が無いため talk-subtitle の既定（横長）";

  // ---- completeness
  const cutItems: { items: Record<string, CutDecision>; stale: boolean } = cuts ? currentCutDecisions(decisions, cuts) : { items: {}, stale: false };
  const pendingCuts = cuts ? cuts.items.filter((c) => !cutItems.items[c.id]).length : 0;
  const cutState = !cuts ? "none" : cutItems.stale ? "stale" : pendingCuts > 0 ? "partial" : "complete";
  const timemapCurrent = isReference
    ? !!recon && recon.source.sha256 === json.source?.sha256 && recon.inputs.sourceTranscript === fileFingerprint(paths.transcript)
    : !!timemap && !!cuts && !cutItems.stale && timemap.candidatesFingerprint === cuts.fingerprint && fingerprint(approvedCuts(cuts, decisions)) === timemap.decisionsFingerprint;
  const timemapState = !timemap ? "none" : timemapCurrent ? "current" : "stale";
  const editsStale = !!draft && !!edits.draftFingerprint && edits.draftFingerprint !== draft.fingerprint;
  const subtitleState = !draft
    ? "none"
    : editsStale
      ? "stale"
      : edits.approved?.draftFingerprint === draft.fingerprint
        ? "approved"
        : Object.keys(edits.edits).length
          ? "edited"
          : "draft";
  const finalReport = readJsonIfExists<{ ok: boolean }>(path.join(paths.output, "final.report.json"));
  const final = fs.existsSync(path.join(paths.output, "final.mp4")) && !!finalReport?.ok;
  if (cutState === "stale") gaps.push("カットの承認が今の候補と合っていない（候補の作り直し後）ため、カット候補への判断は記録していません。");
  if (timemapState !== "current") {
    gaps.push(
      isReference
        ? "reconstruction.json が今の元動画・文字起こしと合っていないため、削った区間・間・フィラーは記録していません（npm run reference -- reconstruct）。"
        : "timemap.json が無いか今の承認と合っていないため、完成動画に残った間・フィラーは記録していません。",
    );
  }
  if (subtitleState === "stale") gaps.push("字幕の修正が今の字幕案と合っていないため、字幕の修正は記録していません。");

  const events: ObservationEvent[] = [];
  const removed = timemapCurrent ? timemap!.removed.map((r) => ({ start: r.srcStart, end: r.srcEnd, ids: r.candidateIds })) : [];
  const removedIn = (r: Range) => removed.reduce((n, x) => n + overlap(r, x), 0);
  const removedIdsIn = (r: Range) => [...new Set(removed.filter((x) => overlap(r, x) > 0).flatMap((x) => x.ids))];
  const candById = new Map((cuts?.items ?? []).map((c) => [c.id, c]));

  // ---- raw words (cut candidates and the timemap are built on the raw transcript)
  const words: Word[] = (transcript?.segments ?? []).flatMap((s) =>
    s.words.map((w, i) => ({ ...w, seg: s.id, first: i === 0, last: i === s.words.length - 1 })),
  );
  const wordCutFraction = (w: Range) => {
    const d = w.end - w.start;
    if (d <= 0) return removed.some((x) => w.start >= x.start && w.start < x.end) ? 1 : 0;
    return removedIn(w) / d;
  };
  const kept = words.map((w) => (timemapCurrent ? wordCutFraction(w) < 0.5 : true));

  // ---- 1. cut candidates: the user's decision against the tool's proposal
  if (cuts && cutState !== "stale") {
    for (const c of cuts.items) {
      const d = cutItems.items[c.id] as CutDecision | undefined;
      const before = [...words].reverse().find((w) => w.end <= c.start + 0.05);
      const position = c.start <= 0.05 ? "head" : c.end >= cuts.durationSeconds - 0.05 ? "tail" : "body";
      const adjusted =
        d?.decision === "cut" && (d.start !== undefined || d.end !== undefined)
          ? { startDelta: round3((d.start ?? c.start) - c.start), endDelta: round3((d.end ?? c.end) - c.end), cutSeconds: round3((d.end ?? c.end) - (d.start ?? c.start)) }
          : undefined;
      const ev: CutCandidateEvent = {
        type: "cut-candidate",
        id: c.id,
        features: {
          kind: c.kind,
          suggestion: c.suggestion,
          confidence: c.confidence,
          round: c.round ?? 1,
          ...(c.detail ? { retakePattern: c.detail.pattern, retakeKeep: c.detail.keep, retakeSimilarity: c.detail.similarity } : {}),
          duration: round3(c.duration),
          position,
          boundaryBefore: before ? boundaryAfter(before.text) : "segment",
          chars: spoken(c.text),
        },
        outcome: {
          decision: d?.decision ?? "pending",
          ...(d ? { by: d.by } : {}),
          agreedWithSuggestion: !d || c.suggestion === "review" ? null : d.decision === "cut",
          ...(adjusted ? { adjusted } : {}),
          hasNote: !!d?.note,
        },
        evidence: { start: c.start, end: c.end },
        ...(withExamples
          ? { example: { text: c.text, before: c.context.before, after: c.context.after, reason: c.reason, ...(c.detail ? { first: c.detail.first, second: c.detail.second } : {}), ...(d?.note ? { note: d.note } : {}) } }
          : {}),
      };
      events.push(ev);
    }
  }

  // ---- 2. pauses between words that stayed in the video
  const provenanceOf = (ids: string[], action: PauseEvent["outcome"]["action"]): Provenance => {
    if (isReference) return "user-choice";
    const ds = ids.map((id) => ({ c: candById.get(id), d: cutItems.items[id] }));
    if (ds.some(({ d }) => d && (d.start !== undefined || d.end !== undefined))) return "user-adjusted";
    if (action === "joined") return "user-choice";
    if (action === "trimmed") return ds.every(({ c }) => c?.kind === "silence" && c.suggestion === "cut") ? "tool-default" : "user-choice";
    return "tool-default";
  };
  const pauseEvent = (srcStart: number, srcEnd: number, removedWords: number, boundary: Boundary, edge: "head" | "tail" | undefined, ex: { before: string; after: string }) => {
    const r = { start: srcStart, end: srcEnd };
    const srcGap = round3(Math.max(0, srcEnd - srcStart));
    const removedSeconds = round3(Math.min(srcGap, removedIn(r)));
    if (srcGap < MIN_PAUSE_SECONDS && removedWords === 0 && removedSeconds < 0.05) return;
    const action = removedWords > 0 ? "joined" : removedSeconds > 0.01 ? "trimmed" : "kept";
    const ids = removedIdsIn(r);
    const ev: PauseEvent = {
      type: "pause",
      features: { srcGap, removedSeconds, removedWords, boundary, ...(edge ? { edge } : {}) },
      outcome: { outGap: round3(Math.max(0, srcGap - removedSeconds)), action, provenance: provenanceOf(ids, action) },
      evidence: { srcStart: round3(srcStart), srcEnd: round3(srcEnd), candidateIds: ids },
      ...(withExamples ? { example: ex } : {}),
    };
    events.push(ev);
  };
  const keptIdx = words.map((_, i) => i).filter((i) => kept[i]);
  const textAround = (i: number, dir: -1 | 1) => {
    const out: string[] = [];
    for (let k = i; k >= 0 && k < words.length && out.length < 6; k += dir) if (kept[k]) out.push(words[k].text);
    return (dir === -1 ? out.reverse() : out).join("");
  };
  if (timemapCurrent && keptIdx.length) {
    const first = words[keptIdx[0]];
    pauseEvent(0, first.start, keptIdx[0], "segment", "head", { before: "", after: textAround(keptIdx[0], 1) });
    for (let k = 1; k < keptIdx.length; k++) {
      const a = words[keptIdx[k - 1]];
      const b = words[keptIdx[k]];
      let boundary = boundaryAfter(a.text);
      if (boundary === "none" && b.first && b.seg !== a.seg) boundary = "segment";
      pauseEvent(a.end, b.start, keptIdx[k] - keptIdx[k - 1] - 1, boundary, undefined, { before: textAround(keptIdx[k - 1], -1), after: textAround(keptIdx[k], 1) });
    }
    const lastI = keptIdx.at(-1)!;
    const end = timemap!.source.durationSeconds;
    pauseEvent(words[lastI].end, end, words.length - 1 - lastI, boundaryAfter(words[lastI].text), "tail", { before: textAround(lastI, -1), after: "" });
  }

  // ---- 2b. removed source ranges (what was cut, how long, and what it contained)
  if (timemapCurrent) {
    const segsBySrc = [...timemap!.segments].sort((a, b) => a.srcStart - b.srcStart);
    const srcEnd = timemap!.source.durationSeconds;
    for (const r of timemap!.removed) {
      const inside = words.filter((w) => (w.start + w.end) / 2 >= r.srcStart && (w.start + w.end) / 2 < r.srcEnd);
      const before = [...words].reverse().find((w) => (w.start + w.end) / 2 < r.srcStart);
      const after = words.find((w) => (w.start + w.end) / 2 >= r.srcEnd);
      const segBefore = segsBySrc.filter((s) => s.srcEnd <= r.srcStart + 1e-3).at(-1);
      const segAfter = segsBySrc.find((s) => s.srcStart >= r.srcEnd - 1e-3);
      const text = inside.map((w) => w.text).join("");
      const speechSec = (r as { speechSeconds?: number }).speechSeconds;
      const ev: CutRangeEvent = {
        type: "cut-range",
        features: {
          seconds: round3(r.srcEnd - r.srcStart),
          words: inside.length,
          chars: spoken(text),
          // reference: decided by the source audio (whisper word times often spill into pauses); else by words
          content: speechSec !== undefined ? (speechSec >= 0.15 ? "speech" : "pause") : inside.length ? "speech" : "pause",
          ...(speechSec !== undefined ? { speechSeconds: speechSec } : {}),
          position: r.srcStart <= 0.05 ? "head" : r.srcEnd >= srcEnd - 0.05 ? "tail" : "body",
          boundaryBefore: before ? boundaryAfter(before.text) : "segment",
          keptBefore: segBefore ? round3(segBefore.srcEnd - segBefore.srcStart) : null,
          keptAfter: segAfter ? round3(segAfter.srcEnd - segAfter.srcStart) : null,
        },
        outcome: { removed: true, candidateKinds: [...new Set(r.candidateIds.map((id) => candById.get(id)?.kind ?? "unknown"))] },
        evidence: { srcStart: round3(r.srcStart), srcEnd: round3(r.srcEnd), candidateIds: r.candidateIds },
        ...(withExamples ? { example: { text, before: before ? textAround(words.indexOf(before), -1) : "", after: after ? textAround(words.indexOf(after), 1) : "" } } : {}),
      };
      events.push(ev);
    }
  }

  // ---- 3. fillers: every occurrence in the transcript, cut or kept
  const fillerLists: { word: string; strength: FillerEvent["features"]["strength"] }[] = [
    ...settings.candidates.strongFillers.map((w) => ({ word: w, strength: "strong" as const })),
    ...settings.candidates.weakFillers.map((w) => ({ word: w, strength: "weak" as const })),
  ].sort((a, b) => b.word.length - a.word.length);
  const fillerWords = [...new Set(fillerLists.map((f) => f.word))];
  const cues = draft && subtitleState !== "stale" ? effectiveCues(draft, edits) : [];
  if (transcript && timemapCurrent) {
    for (const seg of transcript.segments) {
      const ix = indexSegment(seg);
      const t = ix.text;
      for (let i = 0; i < t.length; ) {
        const prev = t.slice(0, i).trimEnd().at(-1) ?? "";
        const head = i === 0 || /[。！？!?]/.test(prev);
        const clause = !head && /[、，,]/.test(prev);
        const hit = fillerLists.find((f) => {
          if (!t.startsWith(f.word, i)) return false;
          const next = t.slice(i + f.word.length).replace(/^[ー〜]+/, "").at(0) ?? "";
          const comma = next === "" || /[、，,。]/.test(next);
          if (f.strength === "strong") return true;
          if (f.word.length === 1) return comma;
          return comma || (head && WEAK_AT_HEAD.includes(f.word));
        });
        if (!hit) {
          i++;
          continue;
        }
        let j = i + hit.word.length;
        while (/[ー〜]/.test(t[j] ?? "")) j++;
        const span = { start: ix.charStart[i], end: ix.charEnd[j - 1] };
        const next = t[j] ?? "";
        const cut = wordCutFraction(span) >= 0.5;
        const proposedIds = (cuts?.items ?? []).filter((c) => c.kind === "filler" && overlap(c, span) > 0).map((c) => c.id);
        let subtitle: FillerEvent["outcome"]["subtitle"] = "unknown";
        if (cut) subtitle = "cut";
        else if (draft && subtitleState !== "stale") {
          const mid = (span.start + span.end) / 2;
          const omittedByDraft = draft.dropped.some((d) => d.reason === "filler" && overlap({ start: d.srcStart, end: d.srcEnd }, span) > 0);
          const cue = cues.find((c) => mid >= c.srcStart - 0.05 && mid <= c.srcEnd + 0.05);
          subtitle = omittedByDraft ? "omitted" : cue ? (cue.text.includes(hit.word) ? "shown" : "omitted") : "unknown";
        }
        const ev: FillerEvent = {
          type: "filler",
          features: { word: hit.word, strength: hit.strength, position: head ? "sentence-head" : clause ? "clause-head" : "mid", followedByComma: /[、，,]/.test(next), proposed: proposedIds.length > 0 },
          outcome: { cut, subtitle },
          evidence: { start: round3(span.start), end: round3(span.end), candidateIds: [...new Set([...proposedIds, ...removedIdsIn(span)])] },
          ...(withExamples ? { example: { context: t.slice(Math.max(0, i - 12), j + 12) } } : {}),
        };
        events.push(ev);
        i = j;
      }
    }
  }

  // ---- 4. subtitles: the finished cues and the user's edits
  const preset = draft ? loadPreset(paths) : null;
  const layout = draft && preset ? findLayout(paths.review, preset.name, cues) : null;
  if (draft && preset && !layout && preset.layout.lineBreak === "fit-width") {
    gaps.push("字幕は fit-width（幅で1行／2行を決める）ですが、今の字幕に合う layout.json が無いため、行数は字幕案の改行で数えています。");
  }
  const flagsOf = (id: string) => draft?.cues.find((c) => c.id === id)?.flags.filter((f) => f.review).map((f) => f.kind) ?? [];
  if (draft && subtitleState !== "stale") {
    for (const c of cues) {
      const lines = layout?.get(c.id) ?? c.text.split("\n");
      const e = edits.edits[c.id];
      const chars = spoken(c.text);
      const duration = round3(c.end - c.start);
      const ev: CueEvent = {
        type: "cue",
        id: c.id,
        features: {
          chars,
          lines: lines.length,
          maxLineChars: Math.max(...lines.map(spoken)),
          duration,
          charsPerSecond: duration > 0 ? round3(chars / duration) : 0,
          linesFrom: layout ? "layout" : "draft",
          reviewFlags: flagsOf(c.id),
        },
        outcome: { state: e?.text !== undefined ? "edited" : e?.ok ? "confirmed" : "as-drafted" },
        ...(withExamples ? { example: { text: c.text, heard: c.heard } } : {}),
      };
      events.push(ev);
    }
    const surfaces = glossary.flatMap((g) => [g.surface, ...g.aliases]);
    const quoteLines = loadQuotes(paths.quotes).quotes.flatMap((q) => q.lines);
    for (const [id, e] of Object.entries(edits.edits)) {
      const draftCue = draft.cues.find((c) => c.id === id);
      const orig = e.origText;
      const action = e.deleted ? "deleted" : e.text !== undefined ? "edited" : "confirmed";
      if (draftCue && e.deleted) events.push(cueDeletedEvent(id, draftCue, flagsOf(id), withExamples));
      const cls = e.text !== undefined ? classifyEdit(orig, e.text, { surfaces, quoteLines, fillers: fillerWords }) : null;
      const ev: SubtitleEditEvent = {
        type: "subtitle-edit",
        id,
        features: {
          categories: cls?.categories ?? [],
          charsRemoved: cls?.charsRemoved ?? (e.deleted ? spoken(orig) : 0),
          charsAdded: cls?.charsAdded ?? 0,
          origChars: spoken(orig),
          newChars: e.deleted ? 0 : spoken(e.text ?? orig),
          origLines: orig.split("\n").length,
          newLines: e.deleted ? 0 : (e.text ?? orig).split("\n").length,
          reviewFlags: flagsOf(id),
        },
        outcome: { action, by: e.by },
        ...(withExamples ? { example: { orig, ...(e.text !== undefined ? { edited: e.text } : {}), ops: cls?.ops ?? [] } } : {}),
      };
      events.push(ev);
    }
  }

  // ---- 5. proper nouns
  if (terms) {
    const { items, stale } = currentTermDecisions(decisions, terms);
    if (stale) gaps.push("固有名詞の承認が今の補正候補と合っていないため、固有名詞の判断は記録していません。");
    else {
      for (const t of terms.items) {
        const d = items[t.id];
        const decision = d ? d.decision : t.defaultDecision === "accept" ? "default-accept" : "pending";
        const ev: TermEvent = {
          type: "term",
          id: t.id,
          features: { candidateKind: t.kind, entryKind: glossary.find((g) => g.id === t.entryId)?.kind ?? "unknown", layer: t.layer, defaultDecision: t.defaultDecision, confidence: t.confidence },
          outcome: {
            decision,
            customSpelling: !!d?.replacement && d.replacement !== t.to,
            agreedWithDefault: t.defaultDecision === "accept" ? decision === "accept" || decision === "default-accept" : null,
          },
          ...(withExamples ? { example: { from: t.from, to: d?.replacement ?? t.to } } : {}),
        };
        events.push(ev);
      }
    }
  }

  // ---- 6. read-aloud posts
  if (alignment) {
    for (const m of alignment.matches) {
      const ev: QuoteEvent = {
        type: "quote",
        features: { status: m.status, keptRatio: m.keptRatio, similarity: m.similarity, covered: !!m.coveredBy },
        outcome: { state: m.state, usedPost: !!m.decision || m.status !== "review", flagged: !!m.decision?.flag, cutPartly: m.keptRatio < 0.95 },
        ...(withExamples ? { example: { line: m.line, heard: m.heard } } : {}),
      };
      events.push(ev);
    }
  }

  if (isReference) {
    gaps.push(
      "Whisper が文字にしなかった声（フィラー・息・言いかけ）は単語として出てこないため、フィラーの数には入りません（削った区間の秒数には入っています）。",
      "削った区間が「何のための削除か」（言い直し・脱線・フィラーなど）は分類していません。中の文字は example にあります。",
      "字幕（SRT）はまだ観察していません（S3）。",
    );
    if (recon && recon.quality.matchedSpeechRatio < 0.95) gaps.push(`完成動画の話し声のうち ${Math.round((1 - recon.quality.matchedSpeechRatio) * 100)}% は元動画の位置を特定できていません（reconstruction.json の unmatched）。`);
  } else {
    gaps.push(
      "Whisper が文字にしなかった声（フィラー・息・言いかけ）は単語として出てこないため、フィラーの数には入りません（その多くは「不明瞭」の候補として判断が記録されています）。",
      "talk-subtitle が候補にしなかった編集（脱線・同じ意味の繰り返し・文中の余計な一語）は、ユーザーが範囲を広げた場合を除き記録できません。",
      "間の残し方のうち、無音の候補をそのままカットした所は、ツールの余白（keepPaddingSeconds）で決まった長さです（provenance: tool-default）。",
    );
  }

  const summary0 = summarize(events, { source: timemap?.source.durationSeconds ?? probe?.durationSeconds ?? null, output: timemapCurrent ? timemap!.outputDurationSeconds : null, removed: timemapCurrent ? timemap!.removed : [], segments: timemapCurrent ? timemap!.segments : [], candById, words, kept, alignment });

  const quantile = (xs: number[], q: number) => (xs.length ? round3([...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))]) : null);
  const inner = (recon?.pauses ?? []).filter((x) => !x.edge);
  const summary: Observation["summary"] =
    recon && timemapCurrent
      ? {
          ...summary0,
          audioPauses: {
            count: inner.length,
            median: median(inner.map((x) => x.seconds)),
            p90: quantile(inner.map((x) => x.seconds), 0.9),
            max: inner.length ? Math.max(...inner.map((x) => x.seconds)) : null,
            atLeast03: inner.filter((x) => x.seconds >= 0.3).length,
            atCut: { count: inner.filter((x) => x.atCut).length, median: median(inner.filter((x) => x.atCut).map((x) => x.seconds)) },
            inside: { count: inner.filter((x) => !x.atCut).length, median: median(inner.filter((x) => !x.atCut).map((x) => x.seconds)) },
          },
        }
      : summary0;
  if (isReference && transcript && !/[。、！？]/.test(transcript.segments.map((x) => x.text).join(""))) {
    gaps.push("元動画の文字起こしに句読点が無いため、間の境目（文末／読点）を分けられず、読点で判断するフィラー（あの、・その、など）は数えていません。");
  }
  const byCount = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].map(([by, count]) => ({ by, count }));
  const tally = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
  const rangeAdjustments = Object.values(cutItems.items).filter((d) => d.start !== undefined || d.end !== undefined).length;

  return {
    version: OBSERVATION_VERSION,
    kind: "talk-subtitle-style-observation",
    project: json.id,
    observedAt: new Date().toISOString(),
    origin: isReference ? "reference" : "talk-subtitle",
    scope,
    scopeReason,
    format: { width: probe?.video?.width ?? null, height: probe?.video?.height ?? null, orientation, aspect: probe?.video?.aspectLabel ?? null },
    inputs: {
      sourceSha256: json.source?.sha256 ?? null,
      candidatesFingerprint: cuts?.fingerprint ?? null,
      timemapDecisionsFingerprint: timemap?.decisionsFingerprint ?? null,
      subtitleDraftFingerprint: draft?.fingerprint ?? null,
      termCandidatesFingerprint: terms?.fingerprint ?? null,
      candidateSettings: { minGapSeconds: settings.candidates.minGapSeconds, quietMarginDb: settings.candidates.quietMarginDb, keepPaddingSeconds: settings.candidates.keepPaddingSeconds, edgePaddingSeconds: settings.candidates.edgePaddingSeconds },
      subtitlePreset: preset?.name ?? null,
      ...(recon
        ? { reconstruction: { createdAt: recon.createdAt, matchedSpeechRatio: recon.quality.matchedSpeechRatio, speed: recon.speed.verdict, speedRatio: recon.speed.ratio } }
        : {}),
    },
    completeness: { cutDecisions: cutState, timemap: timemapState, subtitles: subtitleState, final },
    summary,
    history: {
      decisionEntries: byCount(decisions.history.map((h) => h.by)),
      firstAt: decisions.history[0]?.at ?? null,
      lastAt: decisions.history.at(-1)?.at ?? null,
      rangeAdjustments,
      subtitleEditsBy: byCount(Object.values(edits.edits).map((e) => e.by)),
    },
    glossary: {
      entries: glossary.length,
      byKind: tally(glossary.map((g) => g.kind)),
      bySource: tally(glossary.map((g) => g.source ?? "unknown")),
      misrecognitions: glossary.reduce((n, g) => n + g.misrecognitions.length, 0),
      unconfirmedReadings: glossary.filter((g) => !g.readingConfirmed).length,
    },
    events,
    gaps,
  };
}

function cueDeletedEvent(id: string, c: SubtitleDraft["cues"][number], reviewFlags: string[], withExamples: boolean): CueEvent {
  const lines = c.text.split("\n");
  const chars = spoken(c.text);
  const duration = round3(c.end - c.start);
  return {
    type: "cue",
    id,
    features: { chars, lines: lines.length, maxLineChars: Math.max(...lines.map(spoken)), duration, charsPerSecond: duration > 0 ? round3(chars / duration) : 0, linesFrom: "draft", reviewFlags },
    outcome: { state: "deleted" },
    ...(withExamples ? { example: { text: c.text, heard: c.heard } } : {}),
  };
}

/**
 * Burned-in lines from a review/subtitle-design/<name>/layout.json that was made
 * with the project's preset for exactly the current cues (same ids, same text).
 * The newest one wins. null when none matches.
 */
function findLayout(reviewDir: string, preset: string, cues: { id: string; text: string }[]): Map<string, string[]> | null {
  const dir = path.join(reviewDir, "subtitle-design");
  if (!fs.existsSync(dir)) return null;
  const flat = (s: string) => s.replace(/[\n\s　]/g, "");
  const want = new Map(cues.map((c) => [c.id, flat(c.text)]));
  const found = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(dir, d.name, "layout.json"))
    .filter((f) => fs.existsSync(f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const f of found) {
    const l = readJsonIfExists<{ preset?: string; cues?: { id: string; lines: string[] }[] }>(f);
    if (!l?.cues || l.preset !== preset || l.cues.length !== want.size) continue;
    if (l.cues.every((c) => want.get(c.id) === flat(c.lines.join("")))) return new Map(l.cues.map((c) => [c.id, c.lines]));
  }
  return null;
}

function summarize(
  events: ObservationEvent[],
  ctx: { source: number | null; output: number | null; removed: Timemap["removed"]; segments: Timemap["segments"]; candById: Map<string, CutCandidate>; words: Word[]; kept: boolean[]; alignment: QuoteAlignment | null },
): Observation["summary"] {
  const of = <T extends ObservationEvent["type"]>(t: T) => events.filter((e): e is Extract<ObservationEvent, { type: T }> => e.type === t);
  const cands = of("cut-candidate");
  const ranges = of("cut-range");
  const rangeStats = (xs: typeof ranges) => ({ count: xs.length, seconds: round3(xs.reduce((n, r) => n + r.features.seconds, 0)), median: median(xs.map((r) => r.features.seconds)) });
  const pauses = of("pause");
  const fillers = of("filler");
  const cues = of("cue").filter((c) => c.outcome.state !== "deleted");
  const editsEv = of("subtitle-edit");
  const termsEv = of("term");
  const quotes = of("quote");

  const removedByKind: Record<string, number> = {};
  for (const r of ctx.removed) {
    const kinds = r.candidateIds.map((id) => ctx.candById.get(id)?.kind ?? "unknown");
    for (const k of kinds) removedByKind[k] = round3((removedByKind[k] ?? 0) + (r.srcEnd - r.srcStart) / kinds.length);
  }
  const keptChars = ctx.words.reduce((n, w, i) => n + (ctx.kept[i] ? spoken(w.text) : 0), 0);

  const boundaries: Boundary[] = ["sentence", "comma", "segment", "none"];
  const inner = pauses.filter((p) => !p.features.edge);
  const keptMedianByBoundary: Partial<Record<Boundary, number | null>> = {};
  const sourceMedianByBoundary: Partial<Record<Boundary, number | null>> = {};
  for (const b of boundaries) {
    const ps = inner.filter((p) => p.features.boundary === b);
    keptMedianByBoundary[b] = median(ps.map((p) => p.outcome.outGap));
    sourceMedianByBoundary[b] = median(ps.map((p) => p.features.srcGap));
  }

  const byWord: Observation["summary"]["fillers"]["byWord"] = {};
  for (const f of fillers) {
    const w = (byWord[f.features.word] ??= { seen: 0, cut: 0, omittedInSubtitle: 0 });
    w.seen++;
    if (f.outcome.cut) w.cut++;
    if (f.outcome.subtitle === "omitted") w.omittedInSubtitle++;
  }

  const decided = (d: string) => cands.filter((c) => c.outcome.decision === d).length;
  return {
    sourceSeconds: ctx.source === null ? null : round3(ctx.source),
    outputSeconds: ctx.output === null ? null : round3(ctx.output),
    keptRatio: ctx.source && ctx.output ? round3(ctx.output / ctx.source) : null,
    // joins in the finished video (a removed head / tail is not a cut the viewer sees)
    cutsPerMinute: ctx.output ? round3(Math.max(0, ctx.segments.length - 1) / (ctx.output / 60)) : null,
    removedSecondsByKind: removedByKind,
    cuts: {
      joins: Math.max(0, ctx.segments.length - 1),
      removedRanges: ranges.length,
      removedSeconds: round3(ranges.reduce((n, r) => n + r.features.seconds, 0)),
      pauseOnly: rangeStats(ranges.filter((r) => r.features.content === "pause")),
      speech: rangeStats(ranges.filter((r) => r.features.content === "speech")),
      keptSegmentMedianSeconds: median(ctx.segments.map((x) => x.srcEnd - x.srcStart)),
    },
    charsPerSecond: ctx.output ? round3(keptChars / ctx.output) : null,
    candidates: {
      total: cands.length,
      cut: decided("cut"),
      keep: decided("keep"),
      pending: decided("pending"),
      agreeWithCut: cands.filter((c) => c.outcome.agreedWithSuggestion === true).length,
      disagreeWithCut: cands.filter((c) => c.outcome.agreedWithSuggestion === false).length,
      reviewResolvedCut: cands.filter((c) => c.features.suggestion === "review" && c.outcome.decision === "cut").length,
      reviewResolvedKeep: cands.filter((c) => c.features.suggestion === "review" && c.outcome.decision === "keep").length,
      adjusted: cands.filter((c) => c.outcome.adjusted).length,
    },
    pauses: { count: pauses.length, keptMedianByBoundary, sourceMedianByBoundary },
    fillers: { count: fillers.length, cut: fillers.filter((f) => f.outcome.cut).length, byWord },
    subtitles: {
      cues: cues.length,
      oneLine: cues.filter((c) => c.features.lines === 1).length,
      twoLines: cues.filter((c) => c.features.lines === 2).length,
      medianChars: median(cues.map((c) => c.features.chars)),
      maxChars: cues.length ? Math.max(...cues.map((c) => c.features.chars)) : null,
      medianSeconds: median(cues.map((c) => c.features.duration)),
      medianCharsPerSecond: median(cues.map((c) => c.features.charsPerSecond)),
      edited: editsEv.filter((e) => e.outcome.action === "edited").length,
      deleted: editsEv.filter((e) => e.outcome.action === "deleted").length,
      confirmed: editsEv.filter((e) => e.outcome.action === "confirmed").length,
    },
    terms: {
      total: termsEv.length,
      accepted: termsEv.filter((t) => t.outcome.decision === "accept" || t.outcome.decision === "default-accept").length,
      rejected: termsEv.filter((t) => t.outcome.decision === "reject").length,
      customSpelling: termsEv.filter((t) => t.outcome.customSpelling).length,
    },
    quotes: { lines: quotes.length, usedPost: quotes.filter((q) => q.outcome.usedPost).length, flagged: quotes.filter((q) => q.outcome.flagged).length, notFound: ctx.alignment?.notFound.length ?? 0 },
  };
}
