// input/decisions.json: the single approved record for cut and term
// decisions. Chat (npm run decide) and review.html (export → --import) both
// end up here. Decisions are tied to the candidates' fingerprint: if the
// candidates are regenerated, old decisions are not applied silently.

import fs from "node:fs";
import type { CutCandidatesJson } from "./candidates.ts";
import { UserError } from "./cli.ts";
import type { ProjectPaths } from "./paths.ts";
import { readJson, writeJsonAtomic } from "./project.ts";
import type { TermCandidatesJson } from "./terms.ts";

export type By = "chat" | "html" | "cli";

export type CutDecision = {
  decision: "cut" | "keep";
  /** Adjusted range; the candidate's own range when absent. */
  start?: number;
  end?: number;
  note?: string;
  by: By;
  at: string;
};

export type TermDecisionRecord = {
  decision: "accept" | "reject";
  /** Custom spelling; the candidate's proposal when absent. */
  replacement?: string;
  by: By;
  at: string;
};

export type DecisionsJson = {
  version: 1;
  project: string;
  updatedAt: string | null;
  cuts: { candidatesFingerprint: string | null; items: Record<string, CutDecision> };
  terms: { candidatesFingerprint: string | null; items: Record<string, TermDecisionRecord> };
  history: { at: string; by: By; summary: string }[];
};

/** What review.html exports (the full state of both sections). */
export type DecisionsExport = {
  kind: "talk-subtitle-decisions-export";
  project: string;
  cutsFingerprint: string | null;
  termsFingerprint: string | null;
  cuts: Record<string, { decision: "cut" | "keep"; start?: number; end?: number; note?: string }>;
  terms: Record<string, { decision: "accept" | "reject"; replacement?: string }>;
};

export function emptyDecisions(project: string): DecisionsJson {
  return {
    version: 1,
    project,
    updatedAt: null,
    cuts: { candidatesFingerprint: null, items: {} },
    terms: { candidatesFingerprint: null, items: {} },
    history: [],
  };
}

export function loadDecisions(paths: ProjectPaths): DecisionsJson {
  if (!fs.existsSync(paths.decisions)) return emptyDecisions(paths.id);
  const d = readJson<DecisionsJson>(paths.decisions);
  if (d.version !== 1 || d.project !== paths.id) throw new UserError(`${paths.decisions} の version／project が不正です。`);
  return d;
}

export function saveDecisions(paths: ProjectPaths, d: DecisionsJson): void {
  writeJsonAtomic(paths.decisions, d);
}

/** Decisions that belong to the current candidates (empty when stale). */
export function currentCutDecisions(d: DecisionsJson, cands: CutCandidatesJson | null) {
  const stale = !!cands && Object.keys(d.cuts.items).length > 0 && d.cuts.candidatesFingerprint !== cands.fingerprint;
  return { items: stale || !cands ? {} : d.cuts.items, stale };
}

export function currentTermDecisions(d: DecisionsJson, cands: TermCandidatesJson | null) {
  const stale = !!cands && Object.keys(d.terms.items).length > 0 && d.terms.candidatesFingerprint !== cands.fingerprint;
  return { items: stale || !cands ? {} : d.terms.items, stale };
}

export type DecideOps = {
  keep: string[];
  cut: string[];
  cutRest: boolean;
  keepRest: boolean;
  cutSuggested: boolean;
  ranges: string[]; // "c4:12.3-13.1"
  resetCuts: string[];
  acceptTerms: string[];
  rejectTerms: string[];
  acceptTermsRest: boolean;
  rejectTermsRest: boolean;
  termTexts: string[]; // "t3:Claude Code"
  resetTerms: string[];
  discardStale: boolean;
};

export function emptyOps(): DecideOps {
  return {
    keep: [], cut: [], cutRest: false, keepRest: false, cutSuggested: false, ranges: [], resetCuts: [],
    acceptTerms: [], rejectTerms: [], acceptTermsRest: false, rejectTermsRest: false, termTexts: [], resetTerms: [],
    discardStale: false,
  };
}

function checkIds(ids: string[], known: Set<string>, label: string) {
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new UserError(`${label}に無いIDです: ${unknown.join(", ")}`);
}

function prepareSection<T>(
  d: DecisionsJson,
  section: { candidatesFingerprint: string | null; items: Record<string, T> },
  fp: string,
  discardStale: boolean,
  label: string,
  by: By,
) {
  if (section.candidatesFingerprint !== fp && Object.keys(section.items).length > 0) {
    if (!discardStale) {
      throw new UserError(
        `${label}が作り直されているため、以前の承認（${Object.keys(section.items).length}件）は今の候補に対応していません。` +
          "今の候補で承認し直すには --discard-stale を付けてください（以前の承認は history に記録して破棄します）。",
      );
    }
    recordDiscarded(d, section, label, by);
    section.items = {};
  }
  section.candidatesFingerprint = fp;
}

/** Keeps a copy of decisions that no longer match their candidates before dropping them. */
function recordDiscarded(d: DecisionsJson, section: { candidatesFingerprint: string | null; items: object }, label: string, by: By) {
  d.history.push({
    at: new Date().toISOString(),
    by,
    summary: `${label}の作り直しにより以前の承認を破棄（候補 ${section.candidatesFingerprint}）: ${JSON.stringify(section.items)}`,
  });
}

/** Applies chat operations. Returns a human-readable summary of what changed. */
export function applyOps(
  d: DecisionsJson,
  ops: DecideOps,
  cuts: CutCandidatesJson | null,
  terms: TermCandidatesJson | null,
  by: By,
): string[] {
  const at = new Date().toISOString();
  const changes: string[] = [];
  const touchesCuts = ops.keep.length || ops.cut.length || ops.cutRest || ops.keepRest || ops.cutSuggested || ops.ranges.length || ops.resetCuts.length;
  const touchesTerms = ops.acceptTerms.length || ops.rejectTerms.length || ops.acceptTermsRest || ops.rejectTermsRest || ops.termTexts.length || ops.resetTerms.length;

  if (touchesCuts) {
    if (!cuts) throw new UserError("カット候補がまだありません。先に npm run candidates を実行してください。");
    if (ops.cutRest && ops.keepRest) throw new UserError("--cut-rest と --keep-rest は同時に指定できません。");
    prepareSection(d, d.cuts, cuts.fingerprint, ops.discardStale, "カット候補", by);
    const byId = new Map(cuts.items.map((c) => [c.id, c]));
    const known = new Set(byId.keys());
    const rangeOps = ops.ranges.map((r) => {
      const m = r.match(/^(c\d+):(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
      if (!m) throw new UserError(`--range の形式が違います: ${r}（例：c4:12.30-13.10）`);
      return { id: m[1], start: Number(m[2]), end: Number(m[3]) };
    });
    checkIds([...ops.keep, ...ops.cut, ...ops.resetCuts, ...rangeOps.map((r) => r.id)], known, "カット候補");
    const both = ops.keep.filter((id) => ops.cut.includes(id));
    if (both.length) throw new UserError(`同じIDを「残す」と「カット」の両方に指定しています: ${both.join(", ")}`);

    for (const id of ops.resetCuts) {
      if (d.cuts.items[id]) changes.push(`${id}: 未決定に戻す`);
      delete d.cuts.items[id];
    }
    const set = (id: string, decision: "cut" | "keep") => {
      const prev = d.cuts.items[id];
      if (prev?.decision === decision) return;
      d.cuts.items[id] = { ...(prev ?? {}), decision, by, at };
      changes.push(`${id}: ${decision === "cut" ? "カット" : "残す"}`);
    };
    for (const id of ops.keep) set(id, "keep");
    for (const id of ops.cut) set(id, "cut");
    for (const r of rangeOps) {
      if (!(r.start >= 0 && r.end > r.start && r.end <= cuts.durationSeconds + 0.001)) {
        throw new UserError(`${r.id} の範囲 ${r.start}–${r.end} が不正です（0〜${cuts.durationSeconds}秒）。`);
      }
      const prev = d.cuts.items[r.id];
      d.cuts.items[r.id] = { ...(prev ?? {}), decision: prev?.decision ?? "cut", start: r.start, end: r.end, by, at };
      changes.push(`${r.id}: 範囲 ${r.start.toFixed(2)}–${r.end.toFixed(2)} 秒${prev ? "" : "（カット）"}`);
    }
    for (const c of cuts.items) {
      if (d.cuts.items[c.id]) continue;
      if (ops.cutSuggested && c.suggestion === "cut") set(c.id, "cut");
      else if (ops.cutRest) set(c.id, "cut");
      else if (ops.keepRest) set(c.id, "keep");
    }
  }

  if (touchesTerms) {
    if (!terms) throw new UserError("固有名詞の補正候補がまだありません。先に npm run terms を実行してください。");
    if (ops.acceptTermsRest && ops.rejectTermsRest) throw new UserError("--accept-terms-rest と --reject-terms-rest は同時に指定できません。");
    prepareSection(d, d.terms, terms.fingerprint, ops.discardStale, "固有名詞の補正候補", by);
    const byId = new Map(terms.items.map((t) => [t.id, t]));
    const textOps = ops.termTexts.map((r) => {
      const i = r.indexOf(":");
      if (i < 0 || !r.slice(i + 1).trim()) throw new UserError(`--term-text の形式が違います: ${r}（例：t3:Claude Code）`);
      return { id: r.slice(0, i), text: r.slice(i + 1).trim() };
    });
    checkIds([...ops.acceptTerms, ...ops.rejectTerms, ...ops.resetTerms, ...textOps.map((t) => t.id)], new Set(byId.keys()), "固有名詞の補正候補");
    for (const id of ops.resetTerms) {
      if (d.terms.items[id]) changes.push(`${id}: 未決定に戻す`);
      delete d.terms.items[id];
    }
    const set = (id: string, decision: "accept" | "reject", replacement?: string) => {
      const prev = d.terms.items[id];
      d.terms.items[id] = { decision, ...(replacement ? { replacement } : prev?.replacement && decision === "accept" ? { replacement: prev.replacement } : {}), by, at };
      const t = byId.get(id)!;
      changes.push(`${id}: ${decision === "accept" ? `採用「${t.from}」→「${replacement ?? prev?.replacement ?? t.to}」` : `不採用（「${t.from}」のまま）`}`);
    };
    for (const id of ops.acceptTerms) set(id, "accept");
    for (const id of ops.rejectTerms) set(id, "reject");
    for (const t of textOps) set(t.id, "accept", t.text);
    for (const t of terms.items) {
      if (d.terms.items[t.id]) continue;
      if (ops.acceptTermsRest) set(t.id, "accept");
      else if (ops.rejectTermsRest) set(t.id, "reject");
    }
  }

  if (changes.length) {
    d.updatedAt = at;
    d.history.push({ at, by, summary: changes.join("; ") });
  }
  return changes;
}

/** Replaces both sections with the full state exported from review.html. */
export function importExport(
  d: DecisionsJson,
  exp: DecisionsExport,
  cuts: CutCandidatesJson | null,
  terms: TermCandidatesJson | null,
): string[] {
  if (exp.kind !== "talk-subtitle-decisions-export") throw new UserError("review.html から書き出したファイルではありません。");
  if (exp.project !== d.project) throw new UserError(`別の案件（${exp.project}）のファイルです。`);
  if (cuts && exp.cutsFingerprint !== cuts.fingerprint) {
    throw new UserError("書き出し後にカット候補が作り直されています。npm run review で HTML を作り直してから確認し直してください。");
  }
  if (terms && exp.termsFingerprint !== terms.fingerprint) {
    throw new UserError("書き出し後に固有名詞の補正候補が作り直されています。npm run review で HTML を作り直してから確認し直してください。");
  }
  const at = new Date().toISOString();
  const changes: string[] = [];

  if (cuts) {
    const known = new Set(cuts.items.map((c) => c.id));
    checkIds(Object.keys(exp.cuts), known, "カット候補");
    if (d.cuts.candidatesFingerprint !== cuts.fingerprint && Object.keys(d.cuts.items).length) recordDiscarded(d, d.cuts, "カット候補", "html");
    const old = d.cuts.candidatesFingerprint === cuts.fingerprint ? d.cuts.items : {};
    const next: Record<string, CutDecision> = {};
    for (const [id, v] of Object.entries(exp.cuts)) {
      if (v.decision !== "cut" && v.decision !== "keep") throw new UserError(`${id} の decision が不正です。`);
      if (v.start !== undefined || v.end !== undefined) {
        if (!(Number(v.start) >= 0 && Number(v.end) > Number(v.start) && Number(v.end) <= cuts.durationSeconds + 0.001)) {
          throw new UserError(`${id} の範囲 ${v.start}–${v.end} が不正です。`);
        }
      }
      const prev = old[id];
      const same = prev && prev.decision === v.decision && prev.start === v.start && prev.end === v.end && prev.note === v.note;
      next[id] = same ? prev : { decision: v.decision, ...(v.start !== undefined ? { start: Number(v.start), end: Number(v.end) } : {}), ...(v.note ? { note: v.note } : {}), by: "html", at };
      if (!same) changes.push(`${id}: ${v.decision === "cut" ? "カット" : "残す"}${v.start !== undefined ? ` ${Number(v.start).toFixed(2)}–${Number(v.end).toFixed(2)}` : ""}`);
    }
    for (const id of Object.keys(old)) if (!next[id]) changes.push(`${id}: 未決定に戻す`);
    d.cuts = { candidatesFingerprint: cuts.fingerprint, items: next };
  }
  if (terms) {
    const known = new Set(terms.items.map((t) => t.id));
    checkIds(Object.keys(exp.terms), known, "固有名詞の補正候補");
    if (d.terms.candidatesFingerprint !== terms.fingerprint && Object.keys(d.terms.items).length) recordDiscarded(d, d.terms, "固有名詞の補正候補", "html");
    const old = d.terms.candidatesFingerprint === terms.fingerprint ? d.terms.items : {};
    const next: Record<string, TermDecisionRecord> = {};
    for (const [id, v] of Object.entries(exp.terms)) {
      if (v.decision !== "accept" && v.decision !== "reject") throw new UserError(`${id} の decision が不正です。`);
      const prev = old[id];
      const same = prev && prev.decision === v.decision && prev.replacement === v.replacement;
      next[id] = same ? prev : { decision: v.decision, ...(v.replacement ? { replacement: v.replacement } : {}), by: "html", at };
      if (!same) changes.push(`${id}: ${v.decision === "accept" ? `採用${v.replacement ? `「${v.replacement}」` : ""}` : "不採用"}`);
    }
    for (const id of Object.keys(old)) if (!next[id]) changes.push(`${id}: 未決定に戻す`);
    d.terms = { candidatesFingerprint: terms.fingerprint, items: next };
  }
  if (changes.length) {
    d.updatedAt = at;
    d.history.push({ at, by: "html", summary: changes.join("; ") });
  }
  return changes;
}

/** Total length of the union of ranges (overlapping cuts counted once). */
export function unionSeconds(ranges: { start: number; end: number }[]): number {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let total = 0;
  let curS = -1;
  let curE = -1;
  for (const r of sorted) {
    if (r.start > curE) {
      if (curE > curS) total += curE - curS;
      curS = r.start;
      curE = r.end;
    } else curE = Math.max(curE, r.end);
  }
  if (curE > curS) total += curE - curS;
  return Math.round(total * 1000) / 1000;
}

export function cutSummary(cuts: CutCandidatesJson, items: Record<string, CutDecision>) {
  let cut = 0, keep = 0, pending = 0;
  const ranges: { start: number; end: number }[] = [];
  for (const c of cuts.items) {
    const d = items[c.id];
    if (!d) pending++;
    else if (d.decision === "keep") keep++;
    else {
      cut++;
      ranges.push({ start: d.start ?? c.start, end: d.end ?? c.end });
    }
  }
  return { total: cuts.items.length, cut, keep, pending, cutSeconds: unionSeconds(ranges) };
}
